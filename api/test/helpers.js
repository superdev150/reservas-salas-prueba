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

module.exports = { setupTestDb };
