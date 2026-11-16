// Spec §10.1 admin.spec.js (T5): administración de salas y cancelación por admin.
const { test, expect } = require('@playwright/test');

const RRHH = { email: 'rrhh@empresa.local', password: 'Rrhh2026!' };
const LUIS = { email: 'luis@empresa.local', password: 'Empleado2026!' };

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
function nextBusinessDay(date) {
  let next = addDays(date, 1);
  while ([0, 6].includes(new Date(`${next}T00:00:00Z`).getUTCDay())) next = addDays(next, 1);
  return next;
}

async function nextDay(request, token) {
  const cal = await (await request.get('/api/calendar', auth(token))).json();
  return nextBusinessDay(cal.today);
}

async function login(page, user) {
  await page.goto('/login');
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

test('RRHH crea una sala, aparece en la agenda, la desactiva y desaparece', async ({ page, request }) => {
  const name = `Sala E2E ${Date.now()}`;
  const luisToken = await apiToken(request, LUIS);
  const next = await nextDay(request, luisToken);

  await login(page, RRHH);
  await page.getByTestId('nav-salas').click();
  await expect(page).toHaveURL(/\/admin\/salas$/);
  await page.getByTestId('room-name').fill(name);
  await page.getByTestId('room-capacity').fill('5');
  await page.getByTestId('room-location').fill('Piso E2E');
  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/rooms') && r.request().method() === 'POST'),
    page.getByTestId('room-submit').click(),
  ]);
  expect(created.status()).toBe(201);
  const room = await created.json();
  const row = page.getByTestId(`room-row-${room.id}`);
  await expect(row).toContainText(name);
  await expect(row).toContainText('Activa');
  await page.screenshot({ path: 'results/admin-1-sala-creada.png', fullPage: true });

  // El mismo nombre con otras mayúsculas se rechaza (D-49).
  await page.getByTestId('room-name').fill(name.toUpperCase());
  await page.getByTestId('room-capacity').fill('5');
  await page.getByTestId('room-submit').click();
  await expect(page.getByRole('alert')).toHaveText('Ya existe una sala con ese nombre.');
  await page.getByTestId('room-name').fill('');
  await page.getByTestId('room-capacity').fill('');

  // Aparece en la agenda.
  await page.getByTestId('nav-agenda').click();
  await page.getByTestId('agenda-date').fill(next);
  await expect(page.getByTestId(`slot-${room.id}-10:00`)).toBeVisible();
  await expect(page.getByTestId('agenda-grid')).toContainText(name);
  await page.screenshot({ path: 'results/admin-2-agenda-con-sala.png', fullPage: true });

  // Luis reserva en la sala nueva; al desactivarla se cancela (R12).
  const booked = await request.post('/api/bookings', {
    ...auth(luisToken),
    data: { roomId: room.id, date: next, startTime: '09:00', endTime: '10:00', title: 'En sala E2E' },
  });
  expect(booked.status()).toBe(201);
  const booking = await booked.json();

  await page.getByTestId('nav-salas').click();
  let confirmText = null;
  page.once('dialog', (dialog) => {
    confirmText = dialog.message();
    dialog.accept();
  });
  await page.getByTestId(`room-toggle-${room.id}`).click();
  await expect(page.getByRole('status')).toHaveText('Sala desactivada. Reservas canceladas: 1.');
  expect(confirmText).toBe(`¿Desactivar «${name}»? Se cancelarán sus reservas futuras.`);
  await expect(row).toContainText('Inactiva');
  await expect(page.getByTestId(`room-toggle-${room.id}`)).toHaveText('Activar');
  await page.screenshot({ path: 'results/admin-3-sala-desactivada.png', fullPage: true });

  // Ya no aparece en la agenda, y la reserva de Luis quedó cancelada.
  await page.getByTestId('nav-agenda').click();
  await page.getByTestId('agenda-date').fill(next);
  // Referencia de que la rejilla ya cargó (a las 10:00 de Sala 1 está la demo de Ana).
  await expect(page.getByTestId('slot-1-08:00')).toBeVisible();
  await expect(page.getByTestId(`slot-${room.id}-10:00`)).toHaveCount(0);
  await expect(page.getByTestId('agenda-grid')).not.toContainText(name);
  await expect(page.getByTestId(`booking-${booking.id}`)).toHaveCount(0);
  const mine = await (await request.get('/api/bookings/mine', auth(luisToken))).json();
  expect(mine.some((b) => b.id === booking.id)).toBe(false);
  await page.screenshot({ path: 'results/admin-4-agenda-sin-sala.png', fullPage: true });
});

test('RRHH edita una sala con el mismo formulario (D-51)', async ({ page }) => {
  const name = `Sala Edit ${Date.now()}`;
  await login(page, RRHH);
  await page.getByTestId('nav-salas').click();
  await page.getByTestId('room-name').fill(name);
  await page.getByTestId('room-capacity').fill('3');
  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/rooms') && r.request().method() === 'POST'),
    page.getByTestId('room-submit').click(),
  ]);
  const room = await created.json();
  const row = page.getByTestId(`room-row-${room.id}`);

  await row.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByTestId('room-name')).toHaveValue(name);
  await expect(page.getByTestId('room-submit')).toHaveText('Guardar');
  await page.getByTestId('room-capacity').fill('9');
  await page.getByTestId('room-location').fill('Piso 9');
  await page.screenshot({ path: 'results/admin-5-editando.png', fullPage: true });
  await page.getByTestId('room-submit').click();
  await expect(row).toContainText('9');
  await expect(row).toContainText('Piso 9');
  await expect(page.getByTestId('room-submit')).toHaveText('Crear sala');

  // Limpieza: se desactiva para no llenar la agenda de la demo.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId(`room-toggle-${room.id}`).click();
  await expect(row).toContainText('Inactiva');
});

test('Luis no ve nav-salas y /admin/salas lo lleva a /agenda', async ({ page }) => {
  await login(page, LUIS);
  await expect(page.getByTestId('nav-agenda')).toBeVisible();
  await expect(page.getByTestId('nav-salas')).toHaveCount(0);
  await page.goto('/admin/salas');
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.getByTestId('room-form')).toHaveCount(0);
  await page.screenshot({ path: 'results/admin-6-luis-sin-salas.png', fullPage: true });
});

test('RRHH cancela desde la agenda una reserva creada por Luis', async ({ page, request }) => {
  const luisToken = await apiToken(request, LUIS);
  const next = await nextDay(request, luisToken);
  const rooms = await (await request.get('/api/rooms', auth(luisToken))).json();
  const sala2 = rooms.find((r) => r.name === 'Sala 2');
  const res = await request.post('/api/bookings', {
    ...auth(luisToken),
    data: { roomId: sala2.id, date: next, startTime: '15:00', endTime: '16:00', title: 'Reserva de Luis' },
  });
  expect(res.status()).toBe(201);
  const booking = await res.json();

  await login(page, RRHH);
  await page.getByTestId('agenda-date').fill(next);
  const block = page.getByTestId(`booking-${booking.id}`);
  await expect(block).toContainText('Luis Martínez');
  await block.click();
  await expect(page.getByTestId('booking-cancel')).toBeVisible();
  await page.screenshot({ path: 'results/admin-7-cancelar-ajena.png', fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('booking-cancel').click();
  await expect(block).toHaveCount(0);

  const mine = await (await request.get('/api/bookings/mine', auth(luisToken))).json();
  expect(mine.some((b) => b.id === booking.id)).toBe(false);
  await page.screenshot({ path: 'results/admin-8-ajena-cancelada.png', fullPage: true });
});
