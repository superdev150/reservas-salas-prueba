const express = require('express');
const { requireAuth } = require('../auth');
const { AppError } = require('../errors');
const { isValidDate, calendarInfo } = require('../time');

// GET /api/calendar?date=YYYY-MM-DD (D-43). La fecha de "hoy" la da la API: la zona horaria
// vive solo en time.js y el frontend no calcula fechas ni horas.
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const { date } = req.query;
  if (date !== undefined && !isValidDate(date)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Datos de la reserva no válidos.');
  }
  res.json(calendarInfo(date));
});

module.exports = router;
