// Spec §8: la garantía anti-choque vive en PostgreSQL (restricción bookings_no_overlap).
// Las peticiones van todas a la vez (Promise.all) contra un único servidor HTTP y la BD real;
// el pool tiene 10 conexiones, así que varias transacciones están abiertas a la vez.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { setupTestDb, loginAs, dates } = require('./helpers');
const { localToUtc } = require('../src/time');

const N = 20;
let server;
let pool;
let token;
let day;

before(async () => {
  let app;
  ({ app, pool } = await setupTestDb());
  server = app.listen(0);
  token = await loginAs(app, 'luis@empresa.local');
  day = dates().next;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function book(roomId, startTime, endTime) {
  return request(server)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ roomId, date: day, startTime, endTime, title: 'Concurrencia' });
}

function hhmm(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

test('la restricción bookings_no_overlap existe en la BD de test', async () => {
  const { rows } = await pool.query(
    "SELECT contype FROM pg_constraint WHERE conname = 'bookings_no_overlap'",
  );
  assert.deepStrictEqual(rows, [{ contype: 'x' }]);
});

test(`${N} reservas idénticas simultáneas → exactamente 1×201 y ${N - 1}×409 BOOKING_CONFLICT`, async () => {
  const responses = await Promise.all(Array.from({ length: N }, () => book(2, '14:00', '15:00')));

  const created = responses.filter((r) => r.status === 201);
  const conflicts = responses.filter((r) => r.status === 409);
  assert.strictEqual(created.length, 1);
  assert.strictEqual(conflicts.length, N - 1);
  for (const r of conflicts) {
    assert.deepStrictEqual(r.body, {
      error: { code: 'BOOKING_CONFLICT', message: 'La sala ya está reservada en ese horario.' },
    });
  }

  // Comprobado en la BD, no solo en las respuestas.
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM bookings
      WHERE room_id = 2 AND status = 'active' AND starts_at = $1 AND ends_at = $2`,
    [localToUtc(day, '14:00'), localToUtc(day, '15:00')],
  );
  assert.strictEqual(rows[0].n, 1);
});

test(`${N} reservas escalonadas (15 min, 60 min de duración) simultáneas → ningún par solapado en BD`, async () => {
  const start = 8 * 60;
  const responses = await Promise.all(
    Array.from({ length: N }, (_, i) => book(3, hhmm(start + i * 15), hhmm(start + i * 15 + 60))),
  );

  for (const r of responses) {
    assert.ok(
      r.status === 201 || (r.status === 409 && r.body.error.code === 'BOOKING_CONFLICT'),
      `respuesta inesperada ${r.status} ${JSON.stringify(r.body)}`,
    );
  }
  const createdCount = responses.filter((r) => r.status === 201).length;
  assert.ok(createdCount >= 1);
  assert.ok(createdCount < N);

  const overlaps = await pool.query(
    `SELECT count(*)::int AS n
       FROM bookings a
       JOIN bookings b ON a.id < b.id AND a.room_id = b.room_id
      WHERE a.status = 'active' AND b.status = 'active'
        AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')`,
  );
  assert.strictEqual(overlaps.rows[0].n, 0);

  const stored = await pool.query(
    "SELECT count(*)::int AS n FROM bookings WHERE room_id = 3 AND status = 'active'",
  );
  assert.strictEqual(stored.rows[0].n, createdCount);
});
