class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function notFoundHandler(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Recurso no encontrado.'));
}

// Formato de error del spec §7: { error: { code, message } }
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  // R1: el choque lo detecta PostgreSQL (restricción EXCLUDE, spec §6.1). Es el único origen del 409.
  if (err.code === '23P01' && err.constraint === 'bookings_no_overlap') {
    return res.status(409).json({
      error: { code: 'BOOKING_CONFLICT', message: 'La sala ya está reservada en ese horario.' },
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'El cuerpo de la petición no es JSON válido.' },
    });
  }
  console.error(err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' },
  });
}

module.exports = { AppError, notFoundHandler, errorHandler };
