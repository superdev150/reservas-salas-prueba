const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { AppError } = require('../errors');

const router = express.Router();
router.use(requireAuth);

const MAX_INT = 2147483647;
const MSG_VALIDATION = 'Datos de la sala no válidos.';
const PATCH_FIELDS = ['name', 'capacity', 'location', 'isActive'];

function validationError() {
  return new AppError(400, 'VALIDATION_ERROR', MSG_VALIDATION);
}

function notFound() {
  return new AppError(404, 'NOT_FOUND', 'Recurso no encontrado.');
}

// Representación Room del spec §7.1.
function toRoom(row) {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    location: row.location,
    isActive: row.is_active,
  };
}

// Validación de campos (D-48). Devuelve el valor limpio o lanza 400.
function cleanName(value) {
  if (typeof value !== 'string') throw validationError();
  const name = value.trim();
  if (name.length < 1 || name.length > 60) throw validationError();
  return name;
}

function cleanCapacity(value) {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw validationError();
  return value;
}

function cleanLocation(value) {
  if (value === null) return null;
  if (typeof value !== 'string') throw validationError();
  const location = value.trim();
  if (location.length > 60) throw validationError();
  return location === '' ? null : location;
}

router.get('/', async (req, res) => {
  // includeInactive=true solo vale para admin; para employee se ignora.
  const includeInactive = req.user.role === 'admin' && req.query.includeInactive === 'true';
  const { rows } = await pool.query(
    `SELECT id, name, capacity, location, is_active FROM rooms
      ${includeInactive ? '' : 'WHERE is_active'}
      ORDER BY name`,
  );
  res.json(rows.map(toRoom));
});

// POST /api/rooms (admin). El nombre duplicado (R13, D-49) lo decide la BD: 23505 → 409 en errors.js.
router.post('/', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const name = cleanName(body.name);
  const capacity = cleanCapacity(body.capacity);
  const location = body.location === undefined ? null : cleanLocation(body.location);

  const { rows } = await pool.query(
    `INSERT INTO rooms (name, capacity, location) VALUES ($1, $2, $3)
      RETURNING id, name, capacity, location, is_active`,
    [name, capacity, location],
  );
  res.status(201).json(toRoom(rows[0]));
});

// PATCH /api/rooms/:id (admin). Orden (D-50): 404 id → 400 cuerpo → 404 sala → 409 nombre.
// Una transacción que bloquea la fila con FOR UPDATE (spec §8.1): si una reserva tiene la sala
// bloqueada con FOR SHARE, esperamos a que termine y luego la vemos y la cancelamos (R12).
router.patch('/:id', requireAdmin, async (req, res) => {
  const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : NaN;
  if (!Number.isInteger(id) || id < 1 || id > MAX_INT) throw notFound();

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError();
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((k) => !PATCH_FIELDS.includes(k))) throw validationError();

  const sets = [];
  const values = [];
  const add = (column, value) => {
    values.push(value);
    sets.push(`${column} = $${values.length + 1}`);
  };
  if ('name' in body) add('name', cleanName(body.name));
  if ('capacity' in body) add('capacity', cleanCapacity(body.capacity));
  if ('location' in body) add('location', cleanLocation(body.location));
  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') throw validationError();
    add('is_active', body.isActive);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const locked = await client.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [id]);
    if (locked.rows.length === 0) throw notFound();

    const { rows } = await client.query(
      `UPDATE rooms SET ${sets.join(', ')} WHERE id = $1
        RETURNING id, name, capacity, location, is_active`,
      [id, ...values],
    );

    // R12: desactivar cancela en la misma transacción sus reservas activas futuras.
    let cancelledBookings = 0;
    if (body.isActive === false) {
      const cancelled = await client.query(
        `UPDATE bookings SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2
          WHERE room_id = $1 AND status = 'active' AND starts_at > now()`,
        [id, req.user.id],
      );
      cancelledBookings = cancelled.rowCount;
    }

    await client.query('COMMIT');
    res.json({ room: toRoom(rows[0]), cancelledBookings });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
module.exports.toRoom = toRoom;
