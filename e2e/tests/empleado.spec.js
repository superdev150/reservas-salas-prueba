// Spec §10.1 empleado.spec.js (T4) y avisos de la agenda (D-44).
const { test, expect } = require('@playwright/test');

const LUIS = { email: 'luis@empresa.local', password: 'Empleado2026!' };
const CONFLICT = 'Esa sala ya está reservada en ese horario. Elige otro.';
const DEMO_TITLE = 'Reunión de equipo (demo)';

async function apiToken(request, user) {
  const res = await request.post('/api/auth/login', { data: user });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

function auth(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Aritmética de calendario sobre 'YYYY-MM-DD' (sin zona horaria: "hoy" lo da la API).
function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
function nextBusinessDay(date) {
  let next = addDays(date, 1);
  while (weekday(next) === 0 || weekday(next) === 6) next = addDays(next, 1);
  return next;
}
function nextSaturday(date) {
  let next = addDays(date, 1);
  while (weekday(next) !== 6) next = addDays(next, 1);
  return next;
}

async function context(request) {
  const token = await apiToken(request, LUIS);
  const cal = await (await request.get('/api/calendar', auth(token))).json();
  const rooms = await (await request.get('/api/rooms', auth(token))).json();
  const sala1 = rooms.find((r) => r.name === 'Sala 1');
  return { token, today: cal.today, next: nextBusinessDay(cal.today), sala1 };
}

async function login(page, user) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/agenda$/);
}

// Repetible (spec §10): cancela las reservas futuras de Luis. La demo es de Ana y no se toca.
test.beforeEach(async ({ request }) => {
  const token = await apiToken(request, LUIS);
  const mine = await (await request.get('/api/bookings/mine', auth(token))).json();
  for (const b of mine) await request.delete(`/api/bookings/${b.id}`, auth(token));
});

test('Luis ve la demo, choca, reserva 11–12, la ve en Mis reservas y la cancela', async ({ page, request }) => {
  const { token, next, sala1 } = await context(request);
  const dayBookings = await (await request.get(`/api/bookings?date=${next}`, auth(token))).json();
  const demo = dayBookings.find((b) => b.title === DEMO_TITLE && b.roomId === sala1.id);
  expect(demo, 'la reserva demo debe existir el próximo día hábil').toBeTruthy();

  await login(page, LUIS);
  await page.getByTestId('agenda-date').fill(next);
  const demoBlock = page.getByTestId(`booking-${demo.id}`);
  await expect(demoBlock).toContainText(DEMO_TITLE);
  await expect(demoBlock).toContainText('Ana López');
  await expect(page.getByTestId('agenda-notice')).toHaveCount(0);
  await page.screenshot({ path: 'results/empleado-1-agenda.png', fullPage: true });

  // Choque con la demo: 10:00–11:00 en Sala 1.
  await page.getByTestId(`slot-${sala1.id}-09:00`).click();
  await expect(page.getByTestId('booking-form')).toBeVisible();
  await page.getByTestId('booking-room').selectOption(String(sala1.id));
  await page.getByTestId('booking-start').selectOption('10:00');
  await page.getByTestId('booking-end').selectOption('11:00');
  await page.getByTestId('booking-title').fill('Revisión E2E');
  await page.getByTestId('booking-submit').click();
  await expect(page.getByTestId('booking-error')).toHaveText(CONFLICT);
  await page.screenshot({ path: 'results/empleado-2-choque.png', fullPage: true });

  // Reserva válida: 11:00–12:00.
  await page.getByTestId('booking-start').selectOption('11:00');
  await page.getByTestId('booking-end').selectOption('12:00');
  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/bookings') && r.request().method() === 'POST'),
    page.getByTestId('booking-submit').click(),
  ]);
  expect(created.status()).toBe(201);
  const booking = await created.json();
  await expect(page.getByTestId('booking-form')).toHaveCount(0);
  await expect(page.getByTestId(`booking-${booking.id}`)).toContainText('Revisión E2E');
  await expect(page.getByTestId(`booking-${booking.id}`)).toContainText('Luis Martínez');
  await page.screenshot({ path: 'results/empleado-3-reservada.png', fullPage: true });

  // Mis reservas → cancelar con confirmación.
  await page.getByTestId('nav-mis-reservas').click();
  const item = page.getByTestId(`mine-item-${booking.id}`);
  await expect(item).toContainText('Revisión E2E');
  await expect(item).toContainText('11:00–12:00');
  await page.screenshot({ path: 'results/empleado-4-mis-reservas.png', fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId(`mine-cancel-${booking.id}`).click();
  await expect(item).toHaveCount(0);
  await expect(page.getByTestId('mine-list')).toBeVisible();
  await page.screenshot({ path: 'results/empleado-5-cancelada.png', fullPage: true });

  // También desaparece de la agenda.
  await page.getByTestId('nav-agenda').click();
  await page.getByTestId('agenda-date').fill(next);
  await expect(page.getByTestId(`booking-${demo.id}`)).toBeVisible();
  await expect(page.getByTestId(`booking-${booking.id}`)).toHaveCount(0);
});

test('login con contraseña incorrecta muestra login-error', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(LUIS.email);
  await page.getByTestId('login-password').fill('incorrecta');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toHaveText('Correo o contraseña incorrectos.');
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: 'results/empleado-login-error.png', fullPage: true });
});

test('recargar mantiene la sesión, cancelar desde la agenda pide confirmación y Salir cierra', async ({ page, request }) => {
  const { token, next, sala1 } = await context(request);
  const res = await request.post('/api/bookings', {
    ...auth(token),
    data: { roomId: sala1.id, date: next, startTime: '14:00', endTime: '15:00', title: 'Para cancelar' },
  });
  expect(res.status()).toBe(201);
  const booking = await res.json();

  await login(page, LUIS);
  await page.reload();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.getByTestId('nav-agenda')).toBeVisible();
  // Con sesión activa, /login lleva a la agenda (D-47).
  await page.goto('/login');
  await expect(page).toHaveURL(/\/agenda$/);

  await page.getByTestId('agenda-date').fill(next);
  await page.getByTestId(`booking-${booking.id}`).click();
  // Si se rechaza la confirmación, no se cancela.
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByTestId('booking-cancel').click();
  await expect(page.getByTestId(`booking-${booking.id}`)).toBeVisible();
  await page.screenshot({ path: 'results/empleado-6-detalle-reserva.png', fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('booking-cancel').click();
  await expect(page.getByTestId(`booking-${booking.id}`)).toHaveCount(0);

  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/agenda');
  await expect(page).toHaveURL(/\/login$/);
});

test('un día no hábil muestra aviso y celdas deshabilitadas', async ({ page, request }) => {
  const { today, sala1 } = await context(request);
  await login(page, LUIS);
  await page.getByTestId('agenda-date').fill(nextSaturday(today));
  await expect(page.getByTestId('agenda-notice')).toHaveText('Solo se puede reservar de lunes a viernes.');
  await expect(page.getByTestId(`slot-${sala1.id}-10:00`)).toBeDisabled();
  await page.screenshot({ path: 'results/empleado-7-no-habil.png', fullPage: true });

  await page.getByTestId('agenda-date').fill(addDays(today, -7));
  await expect(page.getByTestId('agenda-notice')).toHaveText('Este día ya pasó.');
  await expect(page.getByTestId(`slot-${sala1.id}-10:00`)).toBeDisabled();
});
