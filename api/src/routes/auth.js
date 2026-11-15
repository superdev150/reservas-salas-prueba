const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { AppError } = require('../errors');
const { toUser, signToken, requireAuth } = require('../auth');

const router = express.Router();

const MSG_INVALID_CREDENTIALS = 'Correo o contraseña incorrectos.';

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Correo y contraseña son obligatorios.');
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [
    email.trim().toLowerCase(),
  ]);
  const row = rows[0];
  // Mismo error si el correo no existe o la contraseña no coincide (spec §7).
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', MSG_INVALID_CREDENTIALS);
  }

  const user = toUser(row);
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
