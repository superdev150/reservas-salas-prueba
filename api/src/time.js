// Conversión hora local de la oficina ↔ UTC y reglas de calendario R2–R6 (spec §4, D-09).
// Toda la lógica de zona horaria vive en este módulo.
const { AppError } = require('./errors');

const TIMEZONE = process.env.APP_TIMEZONE || 'America/Tegucigalpa';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function localParts(instant) {
  const parts = {};
  for (const { type, value } of partsFormatter.formatToParts(instant)) parts[type] = value;
  return parts;
}

// Desfase (ms) de la zona de la oficina respecto a UTC en un instante dado.
function offsetMs(instant) {
  const p = localParts(instant);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// 'YYYY-MM-DD' + 'HH:mm' en hora local → Date (UTC).
function localToUtc(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const first = naive - offsetMs(new Date(naive));
  return new Date(naive - offsetMs(new Date(first)));
}

// Fecha local de hoy 'YYYY-MM-DD'.
function todayLocal(now = new Date()) {
  const p = localParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// 0 = domingo … 6 = sábado.
function weekday(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Primer día lunes–viernes estrictamente posterior a `date` (spec §6.2).
function nextBusinessDay(date = todayLocal()) {
  let next = addDays(date, 1);
  while (weekday(next) === 0 || weekday(next) === 6) next = addDays(next, 1);
  return next;
}

// Date (UTC) → { date: 'YYYY-MM-DD', time: 'HH:mm' } en hora local.
function utcToLocal(instant) {
  const p = localParts(instant);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// Formato (400, D-38): fecha real 'YYYY-MM-DD'.
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Formato (400, D-38): 'HH:mm' con 00–23 y 00–59.
function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toMinutes(time) {
  const [hh, mm] = time.split(':').map(Number);
  return hh * 60 + mm;
}

const SLOT_MINUTES = 15;
const MIN_DURATION = 15;
const MAX_DURATION = 240;
const OPEN_MINUTES = 8 * 60;
const CLOSE_MINUTES = 20 * 60;
const MAX_DAYS_AHEAD = 30;

const MESSAGES = {
  INVALID_SLOT: 'El horario debe ir en tramos de 15 minutos y durar entre 15 minutos y 4 horas.',
  OUTSIDE_BUSINESS_HOURS: 'Solo se puede reservar de lunes a viernes entre 08:00 y 20:00.',
  IN_PAST: 'No se puede reservar en el pasado.',
  TOO_FAR_AHEAD: 'Solo se puede reservar hasta 30 días por adelantado.',
};

function fail(code) {
  throw new AppError(422, code, MESSAGES[code]);
}

// Reglas R2–R6 en hora local (el formato ya está validado). Devuelve el intervalo en UTC.
// No comprueba solapamientos: eso es R1 y lo decide PostgreSQL (D-05).
function validateSlot(date, startTime, endTime, now = new Date()) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  // R2: múltiplos de 15 min.
  if (start % SLOT_MINUTES !== 0 || end % SLOT_MINUTES !== 0) fail('INVALID_SLOT');
  // R3: duración 15–240 min (fin ≤ inicio también es INVALID_SLOT, D-38).
  const duration = end - start;
  if (duration < MIN_DURATION || duration > MAX_DURATION) fail('INVALID_SLOT');
  // R4: lunes–viernes, 08:00–20:00, mismo día (garantizado: una sola `date`).
  const day = weekday(date);
  if (day === 0 || day === 6 || start < OPEN_MINUTES || end > CLOSE_MINUTES) {
    fail('OUTSIDE_BUSINESS_HOURS');
  }

  const startsAt = localToUtc(date, startTime);
  const endsAt = localToUtc(date, endTime);
  // R5: inicio posterior a ahora.
  if (startsAt.getTime() <= now.getTime()) fail('IN_PAST');
  // R6: fecha de inicio ≤ hoy + 30 días (inclusive, D-37).
  if (date > addDays(todayLocal(now), MAX_DAYS_AHEAD)) fail('TOO_FAR_AHEAD');

  return { startsAt, endsAt };
}

function fromMinutes(minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function isWeekend(date) {
  const day = weekday(date);
  return day === 0 || day === 6;
}

// GET /api/calendar (D-43): qué día abre la agenda y desde qué hora se puede reservar.
// `date` ya está validada. Mismas reglas que validateSlot (R4–R6), sin que el frontend calcule nada.
function calendarInfo(date, now = new Date()) {
  const today = todayLocal(now);
  const defaultDate = isWeekend(today) ? nextBusinessDay(today) : today;
  const day = date || defaultDate;
  const info = { today, defaultDate, date: day, dayStatus: 'ok', bookableFrom: null };

  if (day < today) info.dayStatus = 'past';
  else if (isWeekend(day)) info.dayStatus = 'weekend';
  else if (day > addDays(today, MAX_DAYS_AHEAD)) info.dayStatus = 'too_far';
  else if (day === today) {
    // R5: primer tramo de 15 min estrictamente posterior a ahora, nunca antes de las 08:00.
    const local = utcToLocal(now);
    const nowMinutes = toMinutes(local.time);
    const first = Math.max(OPEN_MINUTES, (Math.floor(nowMinutes / SLOT_MINUTES) + 1) * SLOT_MINUTES);
    if (first + MIN_DURATION > CLOSE_MINUTES) info.dayStatus = 'no_time_left';
    else info.bookableFrom = fromMinutes(first);
  } else {
    info.bookableFrom = fromMinutes(OPEN_MINUTES);
  }
  return info;
}

module.exports = {
  TIMEZONE,
  localToUtc,
  utcToLocal,
  todayLocal,
  addDays,
  weekday,
  nextBusinessDay,
  isValidDate,
  isValidTime,
  validateSlot,
  calendarInfo,
};
