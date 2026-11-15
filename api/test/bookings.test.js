// Spec §4 (R1–R11) y §7: un caso por regla y por código de error.
// Seed: usuarios 1 rrhh (admin), 2 Ana, 3 Luis, 4 María; salas 1–5; demo Sala 1 10:00–11:00 de Ana.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { setupTestDb, loginAs, dates } = require('./helpers');
const { localToUtc } = require('../src/time');

let app;
let pool;
let tokens;
let d;

before(async () => {
  ({ app, pool } = await setupTestDb());
  tokens = {
    admin: await loginAs(app, 'rrhh@empresa.local'),
    ana: await loginAs(app, 'ana@empresa.local'),
    luis: await loginAs(app, 'luis@empresa.local'),
    maria: await loginAs(app, 'maria@empresa.local'),
  };
  d = dates();
});
after(() => pool.end());

function post(who, body) {
  return request(app).post('/api/bookings').set('Authorization', `Bearer ${tokens[who]}`).send(body);
}
function cancel(who, id) {
  return request(app).delete(`/api/bookings/${id}`).set('Authorization', `Bearer ${tokens[who]}`);
}
function get(who, path) {
  return request(app).get(path).set('Authorization', `Bearer ${tokens[who]}`);
}
function slot(roomId, startTime, endTime, extra = {}) {
  return { roomId, date: d.next, startTime, endTime, title: 'Reunión de prueba', ...extra };
}
function assertError(res, status, code, message) {
  assert.strictEqual(res.status, status, JSON.stringify(res.body));
  assert.strictEqual(res.body.error.code, code);
  if (message) assert.strictEqual(res.body.error.message, message);
}
async function insertRaw(roomId, userId, startsAt, endsAt) {
  const { rows } = await pool.query(
    `INSERT INTO bookings (room_id, user_id, title, starts_at, ends_at)
     VALUES ($1, $2, 'Insertada por SQL', $3, $4) RETURNING id`,
    [roomId, userId, startsAt, endsAt],
  );
  return rows[0].id;
}

const MSG = {
  VALIDATION: 'Datos de la reserva no válidos.',
  CONFLICT: 'La sala ya está reservada en ese horario.',
  SLOT: 'El horario debe ir en tramos de 15 minutos y durar entre 15 minutos y 4 horas.',
  HOURS: 'Solo se puede reservar de lunes a viernes entre 08:00 y 20:00.',
  PAST: 'No se puede reservar en el pasado.',
  FAR: 'Solo se puede reservar hasta 30 días por adelantado.',
  INACTIVE: 'La sala no está disponible.',
  NOT_CANCELLABLE: 'Esta reserva ya no se puede cancelar.',
  FORBIDDEN: 'No tienes permiso para esta acción.',
  NOT_FOUND: 'Recurso no encontrado.',
};

test('sin token → 401 en todas las rutas de reservas', async () => {
  for (const res of [
    await request(app).get(`/api/bookings?date=${d.next}`),
    await request(app).get('/api/bookings/mine'),
    await request(app).post('/api/bookings').send(slot(2, '09:00', '10:00')),
    await request(app).delete('/api/bookings/1'),
  ]) {
    assertError(res, 401, 'UNAUTHORIZED');
  }
});

test('GET ?date devuelve la reserva demo con la representación Booking exacta', async () => {
  const res = await get('luis', `/api/bookings?date=${d.next}`);
  assert.strictEqual(res.status, 200);
  const demo = res.body.find((b) => b.title === 'Reunión de equipo (demo)');
  assert.deepStrictEqual(demo, {
    id: demo.id,
    roomId: 1,
    roomName: 'Sala 1',
    userId: 2,
    userName: 'Ana López',
    title: 'Reunión de equipo (demo)',
    date: d.next,
    startTime: '10:00',
    endTime: '11:00',
    startsAt: localToUtc(d.next, '10:00').toISOString(),
    endsAt: localToUtc(d.next, '11:00').toISOString(),
    status: 'active',
  });
});

test('GET ?date sin fecha o con fecha inválida → 400 VALIDATION_ERROR', async () => {
  for (const q of ['', '?date=', '?date=2026-02-30', '?date=16/11/2026']) {
    assertError(await get('luis', `/api/bookings${q}`), 400, 'VALIDATION_ERROR', MSG.VALIDATION);
  }
});

test('R1 · reservas seguidas 10–11 y 11–12 en la misma sala → ambas 201', async () => {
  const a = await post('luis', slot(2, '10:00', '11:00'));
  const b = await post('luis', slot(2, '11:00', '12:00'));
  assert.strictEqual(a.status, 201, JSON.stringify(a.body));
  assert.strictEqual(b.status, 201, JSON.stringify(b.body));
  assert.strictEqual(a.body.userId, 3);
  assert.strictEqual(a.body.userName, 'Luis Martínez');
  assert.strictEqual(a.body.roomName, 'Sala 2');
  assert.strictEqual(a.body.status, 'active');
});

test('R1 · solapada 10:30–11:30 → 409 BOOKING_CONFLICT; misma hora en otra sala → 201', async () => {
  const res = await post('ana', slot(2, '10:30', '11:30'));
  assert.strictEqual(res.status, 409);
  assert.deepStrictEqual(res.body, { error: { code: 'BOOKING_CONFLICT', message: MSG.CONFLICT } });
  const other = await post('ana', slot(3, '10:30', '11:30'));
  assert.strictEqual(other.status, 201);
});

test('R1 · choque contra la reserva demo (Luis en Sala 1 10:00–11:00) → 409', async () => {
  assertError(await post('luis', slot(1, '10:00', '11:00')), 409, 'BOOKING_CONFLICT', MSG.CONFLICT);
});

test('R11 · tras cancelar, el mismo horario vuelve a poder reservarse y la cancelada no se borra', async () => {
  const first = await post('maria', slot(2, '14:00', '15:00'));
  assert.strictEqual(first.status, 201);
  assertError(await post('ana', slot(2, '14:00', '15:00')), 409, 'BOOKING_CONFLICT');

  const cancelled = await cancel('maria', first.body.id);
  assert.strictEqual(cancelled.status, 200);
  assert.strictEqual(cancelled.body.status, 'cancelled');

  const again = await post('ana', slot(2, '14:00', '15:00'));
  assert.strictEqual(again.status, 201);

  const { rows } = await pool.query(
    'SELECT status, cancelled_by, cancelled_at FROM bookings WHERE id = $1',
    [first.body.id],
  );
  assert.strictEqual(rows[0].status, 'cancelled');
  assert.strictEqual(rows[0].cancelled_by, 4);
  assert.ok(rows[0].cancelled_at instanceof Date);
});

test('R2 · horas fuera de tramos de 15 min → 422 INVALID_SLOT', async () => {
  assertError(await post('luis', slot(4, '10:10', '11:00')), 422, 'INVALID_SLOT', MSG.SLOT);
  assertError(await post('luis', slot(4, '10:00', '10:50')), 422, 'INVALID_SLOT', MSG.SLOT);
});

test('R3 · duración < 15, fin ≤ inicio o > 240 min → 422 INVALID_SLOT; 240 min → 201', async () => {
  for (const [s, e] of [['10:00', '10:00'], ['11:00', '10:00'], ['09:00', '13:15']]) {
    assertError(await post('luis', slot(4, s, e)), 422, 'INVALID_SLOT', MSG.SLOT);
  }
  assert.strictEqual((await post('luis', slot(4, '08:00', '12:00'))).status, 201);
  assert.strictEqual((await post('luis', slot(4, '12:00', '12:15'))).status, 201);
});

test('R4 · fin de semana o fuera de 08:00–20:00 → 422 OUTSIDE_BUSINESS_HOURS; 19:00–20:00 → 201', async () => {
  assertError(
    await post('luis', slot(4, '10:00', '11:00', { date: d.nextSaturday })),
    422,
    'OUTSIDE_BUSINESS_HOURS',
    MSG.HOURS,
  );
  assertError(await post('luis', slot(4, '07:45', '08:45')), 422, 'OUTSIDE_BUSINESS_HOURS');
  assertError(await post('luis', slot(4, '19:30', '20:15')), 422, 'OUTSIDE_BUSINESS_HOURS');
  assert.strictEqual((await post('luis', slot(4, '19:00', '20:00'))).status, 201);
});

test('R5 · inicio en el pasado → 422 IN_PAST', async () => {
  assertError(
    await post('luis', slot(4, '10:00', '11:00', { date: d.prevBusiness })),
    422,
    'IN_PAST',
    MSG.PAST,
  );
});

test('R6 · más de 30 días → 422 TOO_FAR_AHEAD; último día hábil permitido → 201', async () => {
  assertError(
    await post('luis', slot(4, '10:00', '11:00', { date: d.tooFar })),
    422,
    'TOO_FAR_AHEAD',
    MSG.FAR,
  );
  const ok = await post('luis', slot(4, '10:00', '11:00', { date: d.lastAllowed }));
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
});

test('R7 · sala inexistente → 404 NOT_FOUND; sala inactiva → 422 ROOM_INACTIVE', async () => {
  assertError(await post('luis', slot(999, '10:00', '11:00')), 404, 'NOT_FOUND', MSG.NOT_FOUND);
  await pool.query('UPDATE rooms SET is_active = false WHERE id = 5');
  try {
    assertError(await post('luis', slot(5, '10:00', '11:00')), 422, 'ROOM_INACTIVE', MSG.INACTIVE);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM bookings WHERE room_id = 5');
    assert.strictEqual(rows[0].n, 0);
  } finally {
    await pool.query('UPDATE rooms SET is_active = true WHERE id = 5');
  }
});

test('orden de validación: sala antes que reglas, reglas antes que el INSERT', async () => {
  // Sala inexistente + horario inválido → gana el 404.
  assertError(await post('luis', slot(999, '10:10', '11:00')), 404, 'NOT_FOUND');
  // Horario inválido que además chocaría con la demo → gana el 422.
  assertError(await post('luis', slot(1, '10:10', '11:00')), 422, 'INVALID_SLOT');
});

test('R8 · título vacío, solo espacios, ausente o > 120 caracteres → 400 VALIDATION_ERROR', async () => {
  for (const title of ['', '   ', undefined, 5, 'x'.repeat(121)]) {
    assertError(await post('luis', slot(3, '15:00', '15:30', { title })), 400, 'VALIDATION_ERROR', MSG.VALIDATION);
  }
});

test('R8 · el título se guarda recortado y 120 caracteres es válido', async () => {
  const trimmed = await post('luis', slot(3, '15:00', '15:30', { title: '  Planificación  ' }));
  assert.strictEqual(trimmed.status, 201);
  assert.strictEqual(trimmed.body.title, 'Planificación');
  const long = await post('luis', slot(3, '16:00', '16:30', { title: `  ${'x'.repeat(120)}  ` }));
  assert.strictEqual(long.status, 201);
});

test('formato inválido de roomId, fecha u horas → 400 VALIDATION_ERROR', async () => {
  const bad = [
    { roomId: '2' },
    { roomId: 0 },
    { roomId: 1.5 },
    { roomId: 9999999999 },
    { date: '2026-02-30' },
    { date: '16/11/2026' },
    { startTime: '9:00' },
    { startTime: '24:00' },
    { endTime: '10:60' },
    { endTime: undefined },
  ];
  for (const override of bad) {
    assertError(await post('luis', { ...slot(3, '18:00', '19:00'), ...override }), 400, 'VALIDATION_ERROR');
  }
  const malformed = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${tokens.luis}`)
    .set('Content-Type', 'application/json')
    .send('{"roomId":');
  assertError(malformed, 400, 'VALIDATION_ERROR', 'El cuerpo de la petición no es JSON válido.');
});

test('R9 · empleado no puede cancelar una reserva ajena (403); admin sí (200)', async () => {
  const luis = await post('luis', slot(3, '17:00', '18:00'));
  assert.strictEqual(luis.status, 201);

  assertError(await cancel('ana', luis.body.id), 403, 'FORBIDDEN', MSG.FORBIDDEN);

  const res = await cancel('admin', luis.body.id);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'cancelled');
  assert.strictEqual(res.body.userId, 3);
  const { rows } = await pool.query('SELECT cancelled_by FROM bookings WHERE id = $1', [luis.body.id]);
  assert.strictEqual(rows[0].cancelled_by, 1);
});

test('R10 · cancelar una ya cancelada o una que ya empezó → 409 BOOKING_NOT_CANCELLABLE', async () => {
  const b = await post('maria', slot(3, '19:00', '20:00'));
  assert.strictEqual((await cancel('maria', b.body.id)).status, 200);
  assertError(await cancel('maria', b.body.id), 409, 'BOOKING_NOT_CANCELLABLE', MSG.NOT_CANCELLABLE);

  // Reserva que ya empezó, preparada por SQL (D-40).
  const now = Date.now();
  const started = await insertRaw(3, 4, new Date(now - 30 * 60000), new Date(now + 30 * 60000));
  assertError(await cancel('maria', started), 409, 'BOOKING_NOT_CANCELLABLE');
  assertError(await cancel('admin', started), 409, 'BOOKING_NOT_CANCELLABLE');
});

test('DELETE: 404 si no existe o el id no es numérico; 403 antes que 409 (D-39)', async () => {
  assertError(await cancel('luis', 999999), 404, 'NOT_FOUND', MSG.NOT_FOUND);
  assertError(await cancel('luis', 'abc'), 404, 'NOT_FOUND');
  assertError(await cancel('luis', 99999999999), 404, 'NOT_FOUND');

  const b = await post('ana', slot(5, '08:00', '09:00'));
  assert.strictEqual((await cancel('ana', b.body.id)).status, 200);
  // Luis intenta cancelar una reserva ajena ya cancelada → 403, no 409.
  assertError(await cancel('luis', b.body.id), 403, 'FORBIDDEN');
});

test('GET /mine: solo las activas del usuario que no han terminado, ordenadas por inicio', async () => {
  const later = await post('maria', slot(1, '12:00', '13:00'));
  const earlier = await post('maria', slot(1, '08:00', '09:00'));
  const cancelled = await post('maria', slot(1, '13:00', '14:00'));
  await cancel('maria', cancelled.body.id);
  const now = Date.now();
  await insertRaw(1, 4, new Date(now - 3 * 3600000), new Date(now - 2 * 3600000)); // ya terminó
  await post('ana', slot(1, '14:00', '15:00')); // de otro usuario

  const res = await get('maria', '/api/bookings/mine');
  assert.strictEqual(res.status, 200);
  const ids = res.body.map((b) => b.id);
  assert.ok(ids.indexOf(earlier.body.id) < ids.indexOf(later.body.id));
  assert.ok(!ids.includes(cancelled.body.id));
  assert.ok(res.body.every((b) => b.userId === 4 && b.status === 'active'));
  assert.ok(res.body.every((b) => new Date(b.endsAt).getTime() > now));
  const starts = res.body.map((b) => b.startsAt);
  assert.deepStrictEqual(starts, [...starts].sort());
});

test('GET ?date solo devuelve activas de ese día, ordenadas por inicio', async () => {
  const res = await get('luis', `/api/bookings?date=${d.next}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.length > 0);
  assert.ok(res.body.every((b) => b.date === d.next && b.status === 'active'));
  const starts = res.body.map((b) => b.startsAt);
  assert.deepStrictEqual(starts, [...starts].sort());
  const other = await get('luis', `/api/bookings?date=${d.lastAllowed}`);
  assert.ok(other.body.every((b) => b.date === d.lastAllowed));
});
