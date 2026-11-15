// Conversión hora local de la oficina ↔ UTC (spec §4, D-09).
// T2 solo necesita "hoy", "próximo día hábil" y "hora local → UTC" para el seed;
// las validaciones R2–R6 se añaden en T3.

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

module.exports = { TIMEZONE, localToUtc, todayLocal, addDays, weekday, nextBusinessDay };
