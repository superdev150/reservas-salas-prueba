// Spec §10: los tests usan la BD reservas_test, que se borra y recrea
// (conectándose a la BD `postgres` del mismo servidor), se migra y se siembra.
// Nunca tocan la BD `reservas` de la demo.
const { Client } = require('pg');

const TEST_DB = 'reservas_test';
const baseUrl = new URL(process.env.DATABASE_URL);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = '/postgres';
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${TEST_DB}`;

// Debe ocurrir antes de cargar src/db, que crea el pool desde DATABASE_URL.
process.env.DATABASE_URL = testUrl.toString();

async function setupTestDb() {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
  } finally {
    await admin.end();
  }

  const { pool } = require('../src/db');
  const { migrate } = require('../src/migrate');
  const { seed } = require('../src/seed');
  const { createApp } = require('../src/app');
  await migrate(pool);
  await seed(pool);
  return { app: createApp(), pool };
}

const PASSWORDS = { 'rrhh@empresa.local': 'Rrhh2026!' };

// Devuelve el token de un usuario del seed.
async function loginAs(app, email) {
  const request = require('supertest');
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: PASSWORDS[email] || 'Empleado2026!' });
  if (res.status !== 200) throw new Error(`login ${email} → ${res.status}`);
  return res.body.token;
}

// Fechas relativas a hoy en hora local (spec §10: nunca fijas).
function dates() {
  const { todayLocal, addDays, weekday, nextBusinessDay } = require('../src/time');
  const today = todayLocal();
  const isWeekend = (d) => weekday(d) === 0 || weekday(d) === 6;
  let prevBusiness = addDays(today, -1);
  while (isWeekend(prevBusiness)) prevBusiness = addDays(prevBusiness, -1);
  let nextSaturday = addDays(today, 1);
  while (weekday(nextSaturday) !== 6) nextSaturday = addDays(nextSaturday, 1);
  let tooFar = addDays(today, 31);
  while (isWeekend(tooFar)) tooFar = addDays(tooFar, 1);
  // Último día hábil permitido por R6 (≤ hoy + 30).
  let lastAllowed = addDays(today, 30);
  while (isWeekend(lastAllowed)) lastAllowed = addDays(lastAllowed, -1);
  return { today, next: nextBusinessDay(today), prevBusiness, nextSaturday, tooFar, lastAllowed };
}

module.exports = { setupTestDb, loginAs, dates };
