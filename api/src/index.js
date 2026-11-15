const { pool } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;

// Spec §5.4 paso 1: esperar a la BD (reintento cada 1 s, máx. 30).
// Migrar y seed se añaden en T2 (D-29).
async function waitForDb(retries = 30) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`Esperando a la base de datos (${attempt}/${retries})...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('La base de datos no responde.');
}

async function main() {
  await waitForDb();
  createApp().listen(PORT, () => {
    console.log(`API escuchando en el puerto ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
