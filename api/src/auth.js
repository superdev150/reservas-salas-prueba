const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { AppError } = require('./errors');

// Spec §7.3: JWT HS256, 8 h, payload { sub: userId, role }.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-cambiar-en-produccion';
const TOKEN_TTL = '8h';

const MSG_UNAUTHORIZED = 'Sesión no válida o expirada.';
const MSG_FORBIDDEN = 'No tienes permiso para esta acción.';

// Representación User del spec §7.1 (nunca incluye password_hash).
function toUser(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL,
  });
}

// Carga el usuario desde BD en cada petición (si fue borrado → 401).
async function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw new AppError(401, 'UNAUTHORIZED', MSG_UNAUTHORIZED);

  let payload;
  try {
    payload = jwt.verify(match[1], JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', MSG_UNAUTHORIZED);
  }

  const { rows } = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [
    payload.sub,
  ]);
  if (rows.length === 0) throw new AppError(401, 'UNAUTHORIZED', MSG_UNAUTHORIZED);
  req.user = toUser(rows[0]);
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', MSG_FORBIDDEN);
  }
  next();
}

module.exports = { toUser, signToken, requireAuth, requireAdmin };
