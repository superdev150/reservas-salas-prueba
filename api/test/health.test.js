const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { setupTestDb } = require('./helpers');

let app;
let pool;

before(async () => {
  ({ app, pool } = await setupTestDb());
});
after(() => pool.end());

test('GET /api/health responde 200 con la BD disponible', async () => {
  const res = await request(app).get('/api/health');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { status: 'ok', db: 'ok' });
});
