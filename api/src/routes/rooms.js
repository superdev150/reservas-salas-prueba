const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');

// T3: solo GET /api/rooms. El CRUD de administración es T5.
const router = express.Router();

// Representación Room del spec §7.1.
function toRoom(row) {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    location: row.location,
    isActive: row.is_active,
  };
}

router.get('/', requireAuth, async (req, res) => {
  // includeInactive=true solo vale para admin; para employee se ignora.
  const includeInactive = req.user.role === 'admin' && req.query.includeInactive === 'true';
  const { rows } = await pool.query(
    `SELECT id, name, capacity, location, is_active FROM rooms
      ${includeInactive ? '' : 'WHERE is_active'}
      ORDER BY name`,
  );
  res.json(rows.map(toRoom));
});

module.exports = router;
module.exports.toRoom = toRoom;
