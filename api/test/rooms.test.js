// Spec §7.2: GET, POST y PATCH /api/rooms (CRUD de administración, T5).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { setupTestDb, loginAs, dates } = require('./helpers');

let app;
let pool;
let admin;
let luis;

before(async () => {
  ({ app, pool } = await setupTestDb());
  admin = await loginAs(app, 'rrhh@empresa.local');
  luis = await loginAs(app, 'luis@empresa.local');
});
after(() => pool.end());

function get(token, path = '/api/rooms') {
  return request(app).get(path).set('Authorization', `Bearer ${token}`);
}

test('GET /api/rooms sin token → 401', async () => {
  const res = await request(app).get('/api/rooms');
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
});

test('GET /api/rooms devuelve las salas activas ordenadas por nombre con la forma Room', async () => {
  const res = await get(luis);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body[0], {
    id: 1,
    name: 'Sala 1',
    capacity: 4,
    location: 'Piso 1',
    isActive: true,
  });
  assert.deepStrictEqual(
    res.body.map((r) => r.name),
    ['Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5'],
  );
});

test('includeInactive=true solo funciona para admin', async () => {
  await pool.query('UPDATE rooms SET is_active = false WHERE id = 3');
  try {
    const employee = await get(luis, '/api/rooms?includeInactive=true');
    assert.deepStrictEqual(employee.body.map((r) => r.id), [1, 2, 4, 5]);

    const adminDefault = await get(admin);
    assert.deepStrictEqual(adminDefault.body.map((r) => r.id), [1, 2, 4, 5]);

    const adminAll = await get(admin, '/api/rooms?includeInactive=true');
    assert.deepStrictEqual(adminAll.body.map((r) => r.id), [1, 2, 3, 4, 5]);
    assert.strictEqual(adminAll.body[2].isActive, false);
  } finally {
    await pool.query('UPDATE rooms SET is_active = true WHERE id = 3');
  }
});

// --- T5: POST / PATCH de salas (spec §7.2, R12, R13, D-48 a D-53) ---

const VALIDATION = { code: 'VALIDATION_ERROR', message: 'Datos de la sala no válidos.' };
const NAME_TAKEN = { code: 'ROOM_NAME_TAKEN', message: 'Ya existe una sala con ese nombre.' };

function post(token, body) {
  return request(app).post('/api/rooms').set('Authorization', `Bearer ${token}`).send(body);
}
function patch(token, id, body) {
  return request(app).patch(`/api/rooms/${id}`).set('Authorization', `Bearer ${token}`).send(body);
}

test('POST /api/rooms: sin token → 401 y employee → 403', async () => {
  const anon = await request(app).post('/api/rooms').send({ name: 'X', capacity: 2 });
  assert.strictEqual(anon.status, 401);
  const res = await post(luis, { name: 'Sala Luis', capacity: 4 });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error.code, 'FORBIDDEN');
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM rooms WHERE name = 'Sala Luis'");
  assert.strictEqual(rows[0].n, 0);
});

test('POST /api/rooms crea la sala recortando espacios (201, forma Room)', async () => {
  const res = await post(admin, { name: '  Sala Nueva  ', capacity: 7, location: '  Piso 4 ' });
  assert.strictEqual(res.status, 201);
  assert.deepStrictEqual(res.body, {
    id: res.body.id,
    name: 'Sala Nueva',
    capacity: 7,
    location: 'Piso 4',
    isActive: true,
  });
  const noLocation = await post(admin, { name: 'Sala Sin Ubicación', capacity: 3, location: '  ' });
  assert.strictEqual(noLocation.status, 201);
  assert.strictEqual(noLocation.body.location, null);
  const omitted = await post(admin, { name: 'Sala Sin Ubicación 2', capacity: 3 });
  assert.strictEqual(omitted.body.location, null);
});

test('POST /api/rooms rechaza datos absurdos con 400 VALIDATION_ERROR', async () => {
  const bad = [
    {},
    { capacity: 4 },
    { name: 'Sin capacidad' },
    { name: '   ', capacity: 4 },
    { name: 'x'.repeat(61), capacity: 4 },
    { name: 42, capacity: 4 },
    { name: 'Cap 0', capacity: 0 },
    { name: 'Cap 101', capacity: 101 },
    { name: 'Cap decimal', capacity: 4.5 },
    { name: 'Cap texto', capacity: '4' },
    { name: 'Ubicación larga', capacity: 4, location: 'x'.repeat(61) },
    { name: 'Ubicación número', capacity: 4, location: 3 },
  ];
  for (const body of bad) {
    const res = await post(admin, body);
    assert.strictEqual(res.status, 400, JSON.stringify(body));
    assert.deepStrictEqual(res.body.error, VALIDATION, JSON.stringify(body));
  }
});

test('nombre repetido, también con otras mayúsculas o espacios → 409 ROOM_NAME_TAKEN', async () => {
  for (const name of ['Sala 1', 'sala 1', 'SALA 1', '  Sala 1 ']) {
    const res = await post(admin, { name, capacity: 4 });
    assert.strictEqual(res.status, 409, name);
    assert.deepStrictEqual(res.body.error, NAME_TAKEN, name);
  }
  const renamed = await patch(admin, 2, { name: 'sala 1' });
  assert.strictEqual(renamed.status, 409);
  assert.deepStrictEqual(renamed.body.error, NAME_TAKEN);
});

test('PATCH /api/rooms/:id: employee → 403, id inválido o inexistente → 404, cuerpo inválido → 400', async () => {
  const forbidden = await patch(luis, 1, { name: 'Hack' });
  assert.strictEqual(forbidden.status, 403);
  // 403 antes que 404 (D-50): un employee no sabe si la sala existe.
  assert.strictEqual((await patch(luis, 9999, { name: 'X' })).status, 403);

  assert.strictEqual((await patch(admin, 'abc', { name: 'X' })).status, 404);
  // 404 por id no numérico antes que 400 por cuerpo (D-50).
  assert.strictEqual((await patch(admin, 'abc', {})).status, 404);
  const missing = await patch(admin, 9999, { name: 'X' });
  assert.strictEqual(missing.status, 404);
  assert.strictEqual(missing.body.error.code, 'NOT_FOUND');
  // 400 antes que 404 por sala inexistente (D-50).
  assert.strictEqual((await patch(admin, 9999, {})).status, 400);

  for (const body of [{}, { color: 'rojo' }, { name: 'Ok', extra: 1 }, { isActive: 'false' }, { capacity: 0 }, { name: '' }]) {
    const res = await patch(admin, 1, body);
    assert.strictEqual(res.status, 400, JSON.stringify(body));
    assert.deepStrictEqual(res.body.error, VALIDATION, JSON.stringify(body));
  }
});

test('PATCH /api/rooms/:id edita nombre, capacidad y ubicación', async () => {
  const created = await post(admin, { name: 'Sala Editable', capacity: 5, location: 'Piso 1' });
  const id = created.body.id;
  const res = await patch(admin, id, { name: ' Sala Editada ', capacity: 9, location: null });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, {
    room: { id, name: 'Sala Editada', capacity: 9, location: null, isActive: true },
    cancelledBookings: 0,
  });
  // Renombrar a sí misma con otras mayúsculas no choca consigo misma.
  const self = await patch(admin, id, { name: 'SALA EDITADA' });
  assert.strictEqual(self.status, 200);
  assert.strictEqual(self.body.room.name, 'SALA EDITADA');
});

test('desactivar cancela las reservas activas futuras (no las pasadas) y devuelve cancelledBookings', async () => {
  const { next } = dates();
  const room = (await post(admin, { name: 'Sala Desactivable', capacity: 6 })).body;
  const ana = await loginAs(app, 'ana@empresa.local');
  const ids = [];
  for (const [startTime, endTime, token] of [['09:00', '10:00', luis], ['10:00', '11:00', ana]]) {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId: room.id, date: next, startTime, endTime, title: 'Futura' });
    assert.strictEqual(res.status, 201);
    ids.push(res.body.id);
  }
  // Una reserva pasada (por SQL directo, D-40): no se toca.
  const past = await pool.query(
    `INSERT INTO bookings (room_id, user_id, title, starts_at, ends_at)
     VALUES ($1, 2, 'Pasada', now() - interval '2 hours', now() - interval '1 hour') RETURNING id`,
    [room.id],
  );

  const res = await patch(admin, room.id, { isActive: false });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.cancelledBookings, 2);
  assert.strictEqual(res.body.room.isActive, false);

  const { rows } = await pool.query(
    'SELECT id, status, cancelled_by, cancelled_at FROM bookings WHERE room_id = $1 ORDER BY id',
    [room.id],
  );
  const adminId = (await pool.query("SELECT id FROM users WHERE email = 'rrhh@empresa.local'")).rows[0].id;
  for (const row of rows.filter((r) => ids.includes(r.id))) {
    assert.strictEqual(row.status, 'cancelled');
    assert.strictEqual(row.cancelled_by, adminId);
    assert.ok(row.cancelled_at);
  }
  assert.strictEqual(rows.find((r) => r.id === past.rows[0].id).status, 'active');

  // La sala ya no aparece para employee ni se puede reservar.
  assert.ok(!(await get(luis)).body.some((r) => r.id === room.id));
  const booking = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${luis}`)
    .send({ roomId: room.id, date: next, startTime: '12:00', endTime: '13:00', title: 'No' });
  assert.strictEqual(booking.status, 422);
  assert.strictEqual(booking.body.error.code, 'ROOM_INACTIVE');

  // Reactivar (D-53): vuelve a estar activa, cancelledBookings 0 y las canceladas no vuelven.
  const again = await patch(admin, room.id, { isActive: true });
  assert.strictEqual(again.status, 200);
  assert.deepStrictEqual(again.body.cancelledBookings, 0);
  assert.strictEqual(again.body.room.isActive, true);
  const stillCancelled = await pool.query(
    "SELECT count(*)::int AS n FROM bookings WHERE id = ANY($1) AND status = 'cancelled'",
    [ids],
  );
  assert.strictEqual(stillCancelled.rows[0].n, 2);
});
