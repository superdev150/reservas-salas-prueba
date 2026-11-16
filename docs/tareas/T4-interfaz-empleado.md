# T4 · Interfaz de empleado: login, agenda, reservar, mis reservas

- **Sesión:** S4 · **Fecha:** 2026-11-15 · **Inicio–fin:** ~18:00–18:16
- **Agente:** Claude Code (Opus 5.5)
- **Sesión exportada:** `docs/sesiones/S4-t4-interfaz-empleado.txt`

## Qué se pidió
T4 del `02-backlog.md`: que un empleado pueda entrar, ver la agenda, reservar sin choques y cancelar sus reservas desde el navegador (spec §3, §7.1, §7.3, §9 salvo `/admin/salas`, §9.1 y §10.1 `empleado.spec.js`).

Al responder a las dudas del plan, el responsable pidió tres cosas:
- que la fecha de hoy la dé la API;
- que el formulario se abra en un modal;
- que la interfaz avise y deshabilite las celdas cuando el día no se puede reservar, incluido el caso "hoy ya no quedan horas".

## Qué hizo el agente

**API** (pedido del responsable, D-43):
- `api/src/time.js`: `calendarInfo(date, now)`. Calcula `today`, `defaultDate`, `dayStatus` (`past` → `weekend` → `too_far` → `no_time_left` → `ok`) y `bookableFrom` (primer tramo estrictamente posterior a ahora, nunca antes de las 08:00).
- `api/src/routes/calendar.js` (`GET /api/calendar?date=`, con sesión) y su montaje en `app.js`.
- `api/test/calendar.test.js`: 7 tests. Cubren 401, 400, `defaultDate`, los 4 `dayStatus` por fecha, el cálculo de `bookableFrom` con la hora inyectada, `no_time_left` y `defaultDate` en fin de semana.

**Web:**
- `react-router-dom@7.18.5` exacto, con su `package-lock.json` regenerado en `node:22-alpine`.
- `api.js`: `fetch` con el token de `localStorage`. Un 401 con sesión borra el token y lleva a `/login`.
- `auth.jsx`: contexto de sesión. Valida el token con `/auth/me` al cargar, así que recargar mantiene la sesión.
- `App.jsx`: rutas. `/login` redirige a `/agenda` si ya hay sesión (D-47); las demás están protegidas con `RequireAuth`.
- `slots.js`: tramos fijos de 08:00 a 20:00, fin por defecto (inicio + 60 recortado a 20:00) y texto de confirmación compartido. Sin cálculos de fecha ni de zona horaria.
- `components/`:
  - `Header`: nombre, rol "Empleado"/"Administrador", `nav-agenda`, `nav-mis-reservas` y `logout`.
  - `Footer`: `api-status` en todas las pantallas.
  - `Modal`.
  - `BookingForm`: modal (D-46). Ante un 409 muestra el mensaje exacto del §9 y refresca la agenda; los demás errores muestran `error.message`.
- `pages/`:
  - `Login`.
  - `Agenda`: rejilla CSS de 48 filas × salas activas, con bloques que abarcan sus filas. Muestra el aviso `agenda-notice` y las celdas deshabilitadas según `GET /api/calendar` (D-44). Un clic en una reserva propia abre su detalle con `booking-cancel` y confirmación (D-45). Una guarda descarta las respuestas de una fecha anterior.
  - `MisReservas`: lista con `mine-cancel-{id}` y confirmación.
- `styles.css` rehecho para la aplicación completa.

**e2e:** `e2e/tests/empleado.spec.js` con 4 tests:
- el escenario del §10.1;
- contraseña incorrecta;
- recargar, `/login` con sesión, cancelar desde la agenda (rechazar y aceptar la confirmación) y Salir;
- avisos de día no hábil y pasado con celdas deshabilitadas.

Antes de cada test cancela por API las reservas futuras de Luis. `smoke.spec.js` no cambia.

**Docs:**
- D-43 a D-47 en `00-decisiones.md`.
- Spec actualizado:
  - §5.2: `routes/calendar.js`, `calendar.test.js` y `slots.js`;
  - §7.2: fila `GET /api/calendar`;
  - §9: aviso, modal y confirmación;
  - §9.1: `agenda-notice`.
- Backlog T4 actualizado: el alcance incluye el endpoint.

**Fuera de alcance, como pide el backlog:** el admin no ve el botón de cancelar en reservas ajenas; eso y `nav-salas` llegan en T5.

## Decisiones tomadas durante la tarea
- D-43: `GET /api/calendar`. La fecha de hoy y las horas reservables las da la API.
- D-44: aviso `agenda-notice` con 4 textos y celdas deshabilitadas antes de `bookableFrom`.
- D-45: confirmación al cancelar también desde la agenda.
- D-46: el formulario de reserva se abre en un modal.
- D-47: `/login` con sesión redirige a `/agenda`; `api-status` en el pie de todas las pantallas; rol en la cabecera.

## Verificación
| Criterio de aceptación | Comando / evidencia | Resultado |
|---|---|---|
| 1. Escenario `empleado.spec.js` del §10.1 | `docker compose --profile e2e run --rm --build e2e` | ✅ 5 passed (smoke + 4 de empleado), dos veces seguidas |
| 2. Mensaje de choque exacto del §9 | `toHaveText('Esa sala ya está reservada en ese horario. Elige otro.')` + captura `empleado-2-choque.png` | ✅ |
| 3. `data-testid` del §9.1 de estas pantallas | Todos los usados por los tests: `api-status`, `login-*`, `nav-agenda`, `nav-mis-reservas`, `logout`, `agenda-date`, `agenda-notice`, `agenda-grid`, `slot-*`, `booking-{id}`, `booking-form/room/start/end/title/submit/error/cancel`, `mine-list`, `mine-item-*`, `mine-cancel-*`. `nav-salas` y `room-*` son de T5 | ✅ |
| 4. Recargar mantiene la sesión; Salir la cierra | Test "recargar mantiene la sesión…" (`page.reload()` sigue en `/agenda`; tras `logout`, `/agenda` → `/login`) | ✅ |
| 5. Smoke y tests de API siguen pasando | `docker compose exec api npm test` → 47/47 (40 anteriores + 7 de calendario); `smoke.spec.js` passed | ✅ |
| DoD: `down -v` + `up -d --build` sano | `docker compose ps` → db, api y web `healthy` | ✅ |

Salida relevante:
```
# tests 47 / # pass 47 / # fail 0
Running 5 tests using 2 workers
  5 passed (4.3s)
  5 passed (4.1s)        ← segunda ejecución seguida (repetible)
GET /api/calendar → {"today":"2026-11-15","defaultDate":"2026-11-16","date":"2026-11-16","dayStatus":"ok","bookableFrom":"08:00"}
GET /api/calendar?date=2026-11-14 → {...,"dayStatus":"past","bookableFrom":null}
GET /mis-reservas (fallback SPA en nginx) → 200
```

Capturas revisadas (`e2e/results/`):
- `empleado-1-agenda.png`: agenda del 16/11 con las 5 salas y 48 filas legibles. El bloque azul "Reunión de equipo (demo) · Ana López · 10:00–11:00" está en Sala 1. No hay aviso.
- `empleado-2-choque.png`: modal "Nueva reserva" (Sala 1, 10:00–11:00, "Revisión E2E") con el mensaje de choque en rojo.
- `empleado-3-reservada.png`: bloque verde (propio) "Revisión E2E · Luis Martínez · 11:00–12:00" justo debajo de la demo, sin solaparse.
- `empleado-4-mis-reservas.png`: "Revisión E2E · Sala 1 · 2026-11-16 · 11:00–12:00" con el botón Cancelar.
- `empleado-5-cancelada.png`: "No tienes reservas próximas."
- `empleado-6-detalle-reserva.png`: modal "Reserva" con título, sala, horario, dueño y el botón Cancelar.
- `empleado-7-no-habil.png`: sábado 21/11 con el aviso amarillo "Solo se puede reservar de lunes a viernes." y todas las celdas rayadas (deshabilitadas).
- `empleado-login-error.png`: "Correo o contraseña incorrectos." bajo el formulario.
- `smoke.png`: `/` → `/login` con "API: ok" en el pie.

## Problemas y correcciones
- **"08:00" cortada:** en la primera revisión de capturas, la etiqueta quedaba medio oculta bajo la cabecera fija de las salas, por un `translateY` de las etiquetas de hora. Se quitó el desplazamiento y las etiquetas van alineadas arriba de su fila. Se repitieron los e2e y se revisó la captura.
- **Cabecera a media página en `empleado-6`:** es un efecto de la captura `fullPage` con la página desplazada (la cabecera es `sticky`). En el navegador queda fija arriba, que es lo buscado; no se cambia.
- **Respuestas de una fecha anterior:** al revisar el código se vio que cambiar de fecha rápido podía pintar una respuesta vieja. Se añadió una guarda con contador de peticiones en `Agenda.jsx`.
- **Sin cobertura e2e:** `no_time_left` y la desactivación parcial de hoy dependen de la hora real. Quedan cubiertos por `calendar.test.js` con la hora inyectada.
- Sin intervenciones manuales.

## DoD
- [x] Criterios de aceptación cumplidos
- [x] `down -v` + `up --build` sano
- [x] Sin regresiones (API 47/47, smoke passed)
- [x] Bitácora actualizada
- [x] Decisiones registradas (D-43 a D-47, escritas antes del código)
- [x] Commit local: `T4: interfaz de empleado (login, agenda, reservar, mis reservas) y GET /api/calendar`
