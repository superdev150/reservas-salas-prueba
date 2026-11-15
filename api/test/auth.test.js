const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { setupTestDb } = require('./helpers');

let app;
let pool;

before(async () => {
  ({ app, pool } = await setupTestDb());
});
after(() => pool.end());

function login(email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

test('login correcto devuelve 200, token y user sin password_hash', async () => {
  const res = await login('ana@empresa.local', 'Empleado2026!');
  assert.strictEqual(res.status, 200);
  assert.ok(typeof res.body.token === 'string' && res.body.token.length > 0);
  assert.deepStrictEqual(Object.keys(res.body.user).sort(), ['email', 'id', 'name', 'role']);
  assert.strictEqual(res.body.user.email, 'ana@empresa.local');
  assert.strictEqual(res.body.user.name, 'Ana López');
  assert.strictEqual(res.body.user.role, 'employee');

  const payload = jwt.decode(res.body.token, { complete: true });
  assert.strictEqual(payload.header.alg, 'HS256');
  assert.strictEqual(payload.payload.sub, res.body.user.id);
  assert.strictEqual(payload.payload.role, 'employee');
  assert.strictEqual(payload.payload.exp - payload.payload.iat, 8 * 3600);
});

test('login del admin devuelve role admin', async () => {
  const res = await login('rrhh@empresa.local', 'Rrhh2026!');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.user.role, 'admin');
});

test('contraseña incorrecta y correo inexistente → 401 INVALID_CREDENTIALS con el mismo mensaje', async () => {
  const wrongPass = await login('ana@empresa.local', 'mala');
  const noUser = await login('nadie@empresa.local', 'Empleado2026!');
  for (const res of [wrongPass, noUser]) {
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.code, 'INVALID_CREDENTIALS');
    assert.strictEqual(res.body.error.message, 'Correo o contraseña incorrectos.');
  }
  assert.deepStrictEqual(wrongPass.body, noUser.body);
});

test('login sin correo o contraseña → 400 VALIDATION_ERROR', async () => {
  for (const body of [{}, { email: 'ana@empresa.local' }, { email: '', password: 'x' }, { email: 1, password: 2 }]) {
    const res = await request(app).post('/api/auth/login').send(body);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(res.body, {
      error: { code: 'VALIDATION_ERROR', message: 'Correo y contraseña son obligatorios.' },
    });
  }
});

test('login con JSON mal formado → 400 VALIDATION_ERROR', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email":');
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/auth/me sin token → 401 UNAUTHORIZED', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.strictEqual(res.status, 401);
  assert.deepStrictEqual(res.body, {
    error: { code: 'UNAUTHORIZED', message: 'Sesión no válida o expirada.' },
  });
});

test('GET /api/auth/me con token inválido o expirado → 401', async () => {
  const expired = jwt.sign({ sub: 2, role: 'employee' }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: -10,
  });
  const otherSecret = jwt.sign({ sub: 2, role: 'employee' }, 'otro-secreto');
  for (const token of ['basura', expired, otherSecret]) {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  }
});

test('GET /api/auth/me con token válido → 200 User', async () => {
  const { body } = await login('luis@empresa.local', 'Empleado2026!');
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.token}`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, body.user);
});

test('token de un usuario borrado → 401', async () => {
  const { rows } = await pool.query(
    "INSERT INTO users (email, name, password_hash, role) VALUES ('tmp@empresa.local', 'Tmp', 'x', 'employee') RETURNING id",
  );
  const token = jwt.sign({ sub: rows[0].id, role: 'employee' }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
  });
  await pool.query('DELETE FROM users WHERE id = $1', [rows[0].id]);
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 401);
});

test('requireAdmin: employee → 403 FORBIDDEN, admin pasa', async () => {
  const { requireAuth, requireAdmin } = require('../src/auth');
  const { errorHandler } = require('../src/errors');
  const mini = express();
  mini.get('/solo-admin', requireAuth, requireAdmin, (req, res) => res.json({ ok: true }));
  mini.use(errorHandler);

  const ana = (await login('ana@empresa.local', 'Empleado2026!')).body.token;
  const rrhh = (await login('rrhh@empresa.local', 'Rrhh2026!')).body.token;

  const denied = await request(mini).get('/solo-admin').set('Authorization', `Bearer ${ana}`);
  assert.strictEqual(denied.status, 403);
  assert.deepStrictEqual(denied.body, {
    error: { code: 'FORBIDDEN', message: 'No tienes permiso para esta acción.' },
  });
  const allowed = await request(mini).get('/solo-admin').set('Authorization', `Bearer ${rrhh}`);
  assert.strictEqual(allowed.status, 200);
});
