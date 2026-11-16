// D-43: GET /api/calendar y calendarInfo (fecha de hoy y horas reservables, calculadas en la API).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { setupTestDb, loginAs, dates } = require('./helpers');
const { calendarInfo, localToUtc, todayLocal, nextBusinessDay, weekday } = require('../src/time');

let app;
let pool;
let luis;
let d;

before(async () => {
  ({ app, pool } = await setupTestDb());
  luis = await loginAs(app, 'luis@empresa.local');
  d = dates();
});
after(() => pool.end());

function get(path) {
  return request(app).get(path).set('Authorization', `Bearer ${luis}`);
}

test('GET /api/calendar sin token → 401', async () => {
  const res = await request(app).get('/api/calendar');
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
});

test('GET /api/calendar con fecha mal formada → 400 VALIDATION_ERROR', async () => {
  for (const bad of ['2026-13-01', '2026-02-30', 'mañana', '']) {
    const res = await get(`/api/calendar?date=${encodeURIComponent(bad)}`);
    assert.strictEqual(res.status, 400, bad);
    assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    assert.strictEqual(res.body.error.message, 'Datos de la reserva no válidos.');
  }
});

test('GET /api/calendar sin fecha usa defaultDate (hoy, o el próximo día hábil en fin de semana)', async () => {
  const res = await get('/api/calendar');
  assert.strictEqual(res.status, 200);
  const today = todayLocal();
  const weekend = weekday(today) === 0 || weekday(today) === 6;
  assert.strictEqual(res.body.today, today);
  assert.strictEqual(res.body.defaultDate, weekend ? nextBusinessDay(today) : today);
  assert.strictEqual(res.body.date, res.body.defaultDate);
  assert.deepStrictEqual(Object.keys(res.body).sort(), ['bookableFrom', 'date', 'dayStatus', 'defaultDate', 'today']);
});

test('dayStatus por fecha: ok, past, weekend, too_far', async () => {
  const cases = [
    [d.next, 'ok', '08:00'],
    [d.lastAllowed, 'ok', '08:00'],
    [d.prevBusiness, 'past', null],
    [d.nextSaturday, 'weekend', null],
    [d.tooFar, 'too_far', null],
  ];
  for (const [date, dayStatus, bookableFrom] of cases) {
    const res = await get(`/api/calendar?date=${date}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.date, date);
    assert.strictEqual(res.body.dayStatus, dayStatus, date);
    assert.strictEqual(res.body.bookableFrom, bookableFrom, date);
  }
});

test('hoy: bookableFrom es el primer tramo estrictamente posterior a ahora (R5)', () => {
  // "Hoy" = un día hábil relativo a la fecha actual; la hora se inyecta.
  const day = d.next;
  const at = (time) => calendarInfo(day, localToUtc(day, time));
  assert.strictEqual(at('07:00').bookableFrom, '08:00');
  assert.strictEqual(at('08:00').bookableFrom, '08:15');
  assert.strictEqual(at('14:30').bookableFrom, '14:45');
  assert.strictEqual(at('14:32').bookableFrom, '14:45');
  assert.strictEqual(at('19:44').bookableFrom, '19:45');
  assert.strictEqual(at('19:44').dayStatus, 'ok');
});

test('hoy sin horas libres → no_time_left y bookableFrom null', () => {
  const day = d.next;
  for (const time of ['19:45', '19:59', '20:00', '23:30']) {
    const info = calendarInfo(day, localToUtc(day, time));
    assert.strictEqual(info.dayStatus, 'no_time_left', time);
    assert.strictEqual(info.bookableFrom, null, time);
  }
});

test('en fin de semana defaultDate es el próximo día hábil', () => {
  const info = calendarInfo(undefined, localToUtc(d.nextSaturday, '10:00'));
  assert.strictEqual(info.today, d.nextSaturday);
  assert.strictEqual(info.defaultDate, nextBusinessDay(d.nextSaturday));
  assert.strictEqual(info.dayStatus, 'ok');
  assert.strictEqual(info.bookableFrom, '08:00');
});
