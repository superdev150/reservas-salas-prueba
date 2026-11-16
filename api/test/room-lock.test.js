// Spec §8.1 (R12, D-26): carrera "desactivar sala" vs "crear reserva".
// Un cliente pg del test hace de "la otra operación a medias" y sujeta el bloqueo de la fila.
// Para saber que la petición HTTP está esperando ese bloqueo se consulta pg_stat_activity
// (wait_event_type = 'Lock', máx. 5 s), nunca esperas fijas.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { Client } = require('pg');
const { setupTestDb, loginAs, dates } = require('./helpers');

let app;
let pool;
let admin;
let luis;
let next;
let localToUtc;

before(async () => {
  ({ app, pool } = await setupTestDb());
  ({ localToUtc } = require('../src/time'));
  admin = await loginAs(app, 'rrhh@empresa.local');
  luis = await loginAs(app, 'luis@empresa.local');
  ({ next } = dates());
});
after(() => pool.end());

async function newClient() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

async function createRoom(name) {
  const { rows } = await pool.query(
    'INSERT INTO rooms (name, capacity) VALUES ($1, 6) RETURNING id',
    [name],
  );
  return rows[0].id;
}

// Espera hasta que otro backend de esta BD esté bloqueado esperando un lock.
async function waitForLockWait(holder) {
  const holderPid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> $1`,
      [holderPid],
    );
    if (rows[0].n > 0) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('La petición no llegó a esperar el bloqueo en 5 s');
}

// supertest no envía la petición hasta que se llama a then(): la arrancamos ya.
function start(req) {
  return new Promise((resolve, reject) => req.then(resolve, reject));
}

function postBooking(token, roomId, startTime, endTime) {
  return request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ roomId, date: next, startTime, endTime, title: 'Carrera' });
}

function deactivate(roomId) {
  return request(app)
    .patch(`/api/rooms/${roomId}`)
    .set('Authorization', `Bearer ${admin}`)
    .send({ isActive: false });
}

test('desactivar primero: la reserva espera y responde 422 ROOM_INACTIVE sin crear nada', async () => {
  const roomId = await createRoom('Sala Lock 1');
  const rrhh = await newClient();
  try {
    await rrhh.query('BEGIN');
    await rrhh.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);

    const pending = start(postBooking(luis, roomId, '10:00', '11:00'));
    await waitForLockWait(rrhh);

    await rrhh.query('UPDATE rooms SET is_active = false WHERE id = $1', [roomId]);
    await rrhh.query('COMMIT');

    const res = await pending;
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.body.error.code, 'ROOM_INACTIVE');
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM bookings WHERE room_id = $1', [
      roomId,
    ]);
    assert.strictEqual(rows[0].n, 0);
  } finally {
    await rrhh.end();
  }
});

test('reservar primero: la desactivación espera y cancela la reserva recién confirmada', async () => {
  const roomId = await createRoom('Sala Lock 2');
  const luisId = (await pool.query("SELECT id FROM users WHERE email = 'luis@empresa.local'")).rows[0]
    .id;
  const booker = await newClient();
  let bookingId;
  try {
    await booker.query('BEGIN');
    await booker.query('SELECT id, is_active FROM rooms WHERE id = $1 FOR SHARE', [roomId]);
    const inserted = await booker.query(
      `INSERT INTO bookings (room_id, user_id, title, starts_at, ends_at)
       VALUES ($1, $2, 'A medias', $3, $4) RETURNING id`,
      [roomId, luisId, localToUtc(next, '10:00'), localToUtc(next, '11:00')],
    );
    bookingId = inserted.rows[0].id;

    const pending = start(deactivate(roomId));
    await waitForLockWait(booker);

    await booker.query('COMMIT');

    const res = await pending;
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.cancelledBookings >= 1, `cancelledBookings = ${res.body.cancelledBookings}`);
    assert.strictEqual(res.body.room.isActive, false);
    const { rows } = await pool.query('SELECT status FROM bookings WHERE id = $1', [bookingId]);
    assert.strictEqual(rows[0].status, 'cancelled');
  } finally {
    await booker.end();
  }
});

for (let round = 1; round <= 3; round += 1) {
  test(`estrés ${round}/3: 15 reservas + 1 desactivación a la vez → 0 reservas activas futuras en salas inactivas`, async () => {
    const roomId = await createRoom(`Sala Estrés ${round}`);
    // 15 horarios distintos de 30 min desde las 08:00 (no se solapan entre sí).
    const starts = Array.from({ length: 15 }, (_, i) => 8 * 60 + i * 30);
    const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    const results = await Promise.all([
      ...starts.map((m) => postBooking(luis, roomId, hhmm(m), hhmm(m + 30))),
      deactivate(roomId),
    ]);

    const patchRes = results.pop();
    assert.strictEqual(patchRes.status, 200);
    for (const res of results) {
      assert.ok(
        res.status === 201 || (res.status === 422 && res.body.error.code === 'ROOM_INACTIVE'),
        `respuesta inesperada ${res.status} ${JSON.stringify(res.body)}`,
      );
    }

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM bookings b JOIN rooms r ON r.id = b.room_id
        WHERE NOT r.is_active AND b.status = 'active' AND b.starts_at > now()`,
    );
    assert.strictEqual(rows[0].n, 0);
    // Cada reserva que entró (201) la canceló la desactivación.
    const created = results.filter((r) => r.status === 201).length;
    assert.strictEqual(patchRes.body.cancelledBookings, created);
  });
}
