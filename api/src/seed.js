const bcrypt = require('bcryptjs');
const { localToUtc, nextBusinessDay } = require('./time');

// Spec §6.2: datos iniciales idempotentes. Cada bloque solo si su tabla está vacía.
const USERS = [
  { email: 'rrhh@empresa.local', name: 'Recursos Humanos', role: 'admin', password: 'Rrhh2026!' },
  { email: 'ana@empresa.local', name: 'Ana López', role: 'employee', password: 'Empleado2026!' },
  { email: 'luis@empresa.local', name: 'Luis Martínez', role: 'employee', password: 'Empleado2026!' },
  { email: 'maria@empresa.local', name: 'María Pérez', role: 'employee', password: 'Empleado2026!' },
];

const ROOMS = [
  { name: 'Sala 1', capacity: 4, location: 'Piso 1' },
  { name: 'Sala 2', capacity: 6, location: 'Piso 1' },
  { name: 'Sala 3', capacity: 8, location: 'Piso 2' },
  { name: 'Sala 4', capacity: 10, location: 'Piso 2' },
  { name: 'Sala 5', capacity: 12, location: 'Piso 3' },
];

async function isEmpty(pool, table) {
  const { rows } = await pool.query(`SELECT NOT EXISTS (SELECT 1 FROM ${table}) AS empty`);
  return rows[0].empty;
}

async function seed(pool) {
  if (await isEmpty(pool, 'users')) {
    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      await pool.query(
        'INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4)',
        [u.email, u.name, hash, u.role],
      );
    }
    console.log('Seed: usuarios creados');
  }

  if (await isEmpty(pool, 'rooms')) {
    for (const r of ROOMS) {
      await pool.query('INSERT INTO rooms (name, capacity, location) VALUES ($1, $2, $3)', [
        r.name,
        r.capacity,
        r.location,
      ]);
    }
    console.log('Seed: salas creadas');
  }

  if (await isEmpty(pool, 'bookings')) {
    const date = nextBusinessDay();
    await pool.query(
      `INSERT INTO bookings (room_id, user_id, title, starts_at, ends_at)
       VALUES ((SELECT id FROM rooms WHERE name = 'Sala 1'),
               (SELECT id FROM users WHERE email = 'ana@empresa.local'),
               $1, $2, $3)`,
      ['Reunión de equipo (demo)', localToUtc(date, '10:00'), localToUtc(date, '11:00')],
    );
    console.log(`Seed: reserva demo creada (${date} 10:00–11:00)`);
  }
}

module.exports = { seed };
