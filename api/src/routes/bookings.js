const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');
const { AppError } = require('../errors');
const {
  localToUtc,
  utcToLocal,
  addDays,
  isValidDate,
  isValidTime,
  validateSlot,
} = require('../time');

const router = express.Router();
router.use(requireAuth);

const MAX_INT = 2147483647;
const MSG_VALIDATION = 'Datos de la reserva no válidos.';
const MSG_NOT_FOUND = 'Recurso no encontrado.';

function validationError() {
  return new AppError(400, 'VALIDATION_ERROR', MSG_VALIDATION);
}

function notFound() {
  return new AppError(404, 'NOT_FOUND', MSG_NOT_FOUND);
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_INT;
}

// Columnas para construir la representación Booking (spec §7.1).
const BOOKING_COLUMNS = `b.id, b.room_id, r.name AS room_name, b.user_id, u.name AS user_name,
  b.title, b.starts_at, b.ends_at, b.status`;
const BOOKING_JOINS = 'JOIN rooms r ON r.id = b.room_id JOIN users u ON u.id = b.user_id';

function toBooking(row) {
  const start = utcToLocal(row.starts_at);
  const end = utcToLocal(row.ends_at);
  return {
    id: row.id,
    roomId: row.room_id,
    roomName: row.room_name,
    userId: row.user_id,
    userName: row.user_name,
    title: row.title,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: row.status,
  };
}

// GET /api/bookings?date=YYYY-MM-DD → activas de ese día local, todas las salas.
router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!isValidDate(date)) throw validationError();
  const { rows } = await pool.query(
    `SELECT ${BOOKING_COLUMNS} FROM bookings b ${BOOKING_JOINS}
      WHERE b.status = 'active' AND b.starts_at >= $1 AND b.starts_at < $2
      ORDER BY b.starts_at, b.id`,
    [localToUtc(date, '00:00'), localToUtc(addDays(date, 1), '00:00')],
  );
  res.json(rows.map(toBooking));
});

// GET /api/bookings/mine → activas del usuario que aún no han terminado.
router.get('/mine', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${BOOKING_COLUMNS} FROM bookings b ${BOOKING_JOINS}
      WHERE b.user_id = $1 AND b.status = 'active' AND b.ends_at > now()
      ORDER BY b.starts_at, b.id`,
    [req.user.id],
  );
  res.json(rows.map(toBooking));
});

// POST /api/bookings. Orden (spec §4): 400 formato → 404/422 sala → 422 R2–R6 → INSERT.
// No hay "SELECT para ver si está libre": el solapamiento (R1) lo decide la restricción
// bookings_no_overlap en el INSERT (23P01 → 409 en errors.js, D-05).
router.post('/', async (req, res) => {
  const body = req.body || {};
  const { roomId, date, startTime, endTime, title } = body;
  if (
    !isPositiveInt(roomId) ||
    !isValidDate(date) ||
    !isValidTime(startTime) ||
    !isValidTime(endTime) ||
    typeof title !== 'string'
  ) {
    throw validationError();
  }
  const cleanTitle = title.trim();
  if (cleanTitle.length < 1 || cleanTitle.length > 120) throw validationError();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // R7: la sala existe y está activa. (El bloqueo FOR SHARE del §8.1 se añade en T5.)
    const room = await client.query('SELECT id, is_active FROM rooms WHERE id = $1', [roomId]);
    if (room.rows.length === 0) throw notFound();
    if (!room.rows[0].is_active) {
      throw new AppError(422, 'ROOM_INACTIVE', 'La sala no está disponible.');
    }

    const { startsAt, endsAt } = validateSlot(date, startTime, endTime);

    const { rows } = await client.query(
      `WITH b AS (
         INSERT INTO bookings (room_id, user_id, title, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *
       )
       SELECT ${BOOKING_COLUMNS} FROM b ${BOOKING_JOINS}`,
      [roomId, req.user.id, cleanTitle, startsAt, endsAt],
    );

    await client.query('COMMIT');
    res.status(201).json(toBooking(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// DELETE /api/bookings/:id. Orden (D-39): 404 → 403 → 409. Cancelar no borra (R11).
router.delete('/:id', async (req, res) => {
  const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : NaN;
  if (!isPositiveInt(id)) throw notFound();

  const found = await pool.query('SELECT user_id FROM bookings WHERE id = $1', [id]);
  if (found.rows.length === 0) throw notFound();
  // R9: solo el dueño o un admin.
  if (found.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
  }

  // R10: solo activas cuyo inicio aún no ha llegado (la condición va en el propio UPDATE).
  const { rows } = await pool.query(
    `WITH b AS (
       UPDATE bookings SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2
        WHERE id = $1 AND status = 'active' AND starts_at > now()
        RETURNING *
     )
     SELECT ${BOOKING_COLUMNS} FROM b ${BOOKING_JOINS}`,
    [id, req.user.id],
  );
  if (rows.length === 0) {
    throw new AppError(409, 'BOOKING_NOT_CANCELLABLE', 'Esta reserva ya no se puede cancelar.');
  }
  res.json(toBooking(rows[0]));
});

module.exports = router;
