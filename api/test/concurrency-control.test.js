// Control negativo (D-41): sin la restricción bookings_no_overlap, las mismas 20 peticiones
// idénticas entran todas. Demuestra que el código no tiene ninguna otra comprobación de
// solapamiento: el único origen del 409 BOOKING_CONFLICT es PostgreSQL.
// Usa su propia base reservas_test_control (D-42): quitar la restricción aquí nunca afecta
// a las demás pruebas, aunque corran en paralelo.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { setupTestDb, loginAs, dates } = require('./helpers');

const N = 20;
let server;
let pool;
let token;
let day;

before(async () => {
  let app;
  ({ app, pool } = await setupTestDb('reservas_test_control'));
  const { rows } = await pool.query('SELECT current_database() AS db');
  assert.strictEqual(rows[0].db, 'reservas_test_control');
  server = app.listen(0);
  token = await loginAs(app, 'luis@empresa.local');
  day = dates().next;
  await pool.query('ALTER TABLE bookings DROP CONSTRAINT bookings_no_overlap');
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test(`sin la restricción, ${N} reservas idénticas simultáneas → las ${N} entran (201)`, async () => {
  const { rows: constraint } = await pool.query(
    "SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlap'",
  );
  assert.strictEqual(constraint.length, 0);

  const responses = await Promise.all(
    Array.from({ length: N }, () =>
      request(server)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({ roomId: 2, date: day, startTime: '14:00', endTime: '15:00', title: 'Control' }),
    ),
  );
  assert.deepStrictEqual(
    responses.map((r) => r.status),
    Array(N).fill(201),
  );

  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM bookings WHERE room_id = 2 AND status = 'active' AND title = 'Control'",
  );
  assert.strictEqual(rows[0].n, N);
});
