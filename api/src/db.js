const { Pool } = require('pg');

// Al menos 10 conexiones para que la concurrencia sea real (spec §8).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

module.exports = { pool };
