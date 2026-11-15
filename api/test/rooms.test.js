// Spec §7.2: GET /api/rooms (el CRUD de administración es T5).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { setupTestDb, loginAs } = require('./helpers');

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
