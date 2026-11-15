const { test, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');

after(() => pool.end());

test('GET /api/health responde 200 con la BD disponible', async () => {
  const res = await request(createApp()).get('/api/health');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { status: 'ok', db: 'ok' });
});
