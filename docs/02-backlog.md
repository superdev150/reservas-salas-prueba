# 02 · Backlog

Tareas **en orden de ejecución**. Una tarea por sesión. No se empieza una tarea si la anterior no cumple su DoD.

## Definition of Ready (DoR) — una tarea está lista si tiene

1. **Objetivo** en una frase.
2. **Dependencias** cumplidas.
3. **Referencias al spec** (secciones exactas): nada se inventa fuera del spec.
4. **Alcance** concreto (qué entra) y **fuera de alcance** (qué no).
5. **Criterios de aceptación** verificables con un comando o una prueba.
6. **Cómo se verifica** (comandos exactos).
7. **Riesgos** conocidos.

## Definition of Done (DoD) común a todas las tareas

- [ ] Todos los criterios de aceptación cumplidos y verificados con los comandos indicados.
- [ ] `docker compose down -v && docker compose up -d --build` levanta todo sano (`docker compose ps` muestra `healthy`).
- [ ] Los tests existentes siguen pasando (sin regresiones).
- [ ] `docs/tareas/TX-*.md` creado con la plantilla de `docs/tareas/_plantilla.md`.
- [ ] Entrada en `docs/03-bitacora.md` con hora.
- [ ] Decisiones nuevas añadidas a `docs/00-decisiones.md`.
- [ ] Commit local `TX: <resumen>` (sin push).

## Resumen

| # | Tarea | Sesión | Verificación de UI | Estimado |
|---|---|---|---|---|
| T1 | Esqueleto: Docker Compose, API health, web y e2e smoke | S1 | Sí (smoke) | 25 min |
| T2 | Base de datos, migraciones, seed y autenticación | S2 | No (tests de API) | 25 min |
| T3 | API de reservas con garantía anti-choque y test de concurrencia | S3 | No (tests de API) | 30 min |
| T4 | Interfaz de empleado: login, agenda, reservar, mis reservas | S4 | Sí (skill verificar-ui) | 35 min |
| T5 | Administración de salas (RRHH), bloqueo sala/reserva y cancelación por admin | S5 | Sí (skill verificar-ui) | 35 min |
| — | Cierre: `04-cierre.md` con DoD y evidencias | S6 | — | 20 min |

Total estimado: unos 45 min de S0 + 2 h 50 min de ejecución y cierre.

---

## T1 · Esqueleto: Docker Compose, API health, web y e2e smoke

- **Objetivo:** que `docker compose up` desde un clon limpio levante db, api y web, y que la web muestre el estado de la API; dejar Playwright funcionando en Docker.
- **Dependencias:** ninguna.
- **Spec:** §5 (completo), §7.2 fila `GET /api/health`, §9 "Página inicial antes del login", §9.1 (`api-status`), §10, §10.1 smoke.
- **Alcance:**
  - `.gitignore`, `docker-compose.yml` con los 4 servicios del §5.3 (healthchecks, perfil `e2e`).
  - `.dockerignore` en `api/`, `web/` y `e2e/` con el contenido del §5.2 (D-31).
  - `api/`: Dockerfile (`node:22-alpine`, `npm ci`, incluye devDependencies para poder ejecutar tests), `package.json` con versiones exactas, `src/index.js`, `src/app.js`, `src/db.js`, `src/errors.js`, `routes/health.js`. Script `npm test` = `node --test --test-concurrency=1 "test/**/*.test.js"` (D-33, D-34).
  - `web/`: Vite + React, `nginx.conf` (SPA fallback a `index.html` y proxy `/api/` → `http://api:3000`), Dockerfile multi-stage. Página que muestra `API: ok` / `API: error` con `data-testid="api-status"`.
  - `e2e/`: Dockerfile desde la imagen de Playwright, `playwright.config.js` (baseURL desde `BASE_URL`, solo chromium, reporter `line`, `outputDir: results/test-results`), `tests/smoke.spec.js` con captura `results/smoke.png`.
  - `api/test/health.test.js` que comprueba 200 en `/api/health`.
- **Fuera de alcance:** tablas, login, reservas.
- **Criterios de aceptación:**
  1. Con `docker compose down -v` previo, `docker compose up -d --build` → `docker compose ps` muestra db, api y web `healthy`.
  2. `curl -s http://localhost:8080/api/health` → `{"status":"ok","db":"ok"}`.
  3. `docker compose exec api npm test` pasa.
  4. `docker compose --profile e2e run --rm --build e2e` pasa y deja `e2e/results/smoke.png`, que muestra `API: ok`.
  5. `docker compose up` (sin `-d`) no arranca el servicio `e2e`.
- **Cómo se verifica:** comandos de los criterios + skill `verificar-ui` (leer la captura).
- **Riesgos:** puerto 8080 ocupado en la máquina (se documenta en README); primera descarga de la imagen de Playwright (~2 GB, lenta).

## T2 · Base de datos, migraciones, seed y autenticación

- **Objetivo:** que exista el modelo de datos completo con la restricción anti-choque y que los usuarios del seed puedan iniciar sesión.
- **Dependencias:** T1.
- **Spec:** §2, §5.4, §6 (completo, SQL literal), §7 formato de error y códigos, §7.1 User, §7.2 filas `auth/*`, §7.3, §10.
- **Alcance:**
  - `migrations/001_init.sql` **copiado literalmente** del §6.1.
  - `src/migrate.js`, `src/seed.js` (usuarios, salas y reserva demo; la reserva demo necesita `src/time.js` con al menos "próximo día hábil" y "hora local → UTC").
  - `src/auth.js` (login, JWT, `requireAuth`, `requireAdmin`), `routes/auth.js`.
  - Middleware de errores con el formato del §7.
  - `test/helpers.js` (BD `reservas_test`) y `test/auth.test.js`.
- **Fuera de alcance:** endpoints de salas y reservas.
- **Criterios de aceptación:**
  1. Tras `down -v` + `up`, `docker compose exec db psql -U reservas -d reservas -c '\d bookings'` muestra la restricción `bookings_no_overlap`.
  2. Hay 4 usuarios, 5 salas y 1 reserva demo (Sala 1, próximo día hábil, 10:00–11:00 local = 16:00–17:00 UTC).
  3. Reiniciar `api` no duplica datos ni vuelve a aplicar migraciones.
  4. Tests: login correcto (200 + token + user sin `password_hash`), contraseña incorrecta y correo inexistente (401 `INVALID_CREDENTIALS`, mismo mensaje), `/auth/me` sin token (401) y con token (200).
  5. `docker compose exec api npm test` pasa.
- **Cómo se verifica:** comandos de los criterios; `curl -s -X POST localhost:8080/api/auth/login -H 'Content-Type: application/json' -d '{"email":"ana@empresa.local","password":"Empleado2026!"}'`.
- **Riesgos:** conversión de zona horaria (verificar con caso concreto); la extensión `btree_gist` existe en `postgres:16-alpine` (incluida en contrib).

## T3 · API de reservas con garantía anti-choque y test de concurrencia

- **Objetivo:** reservar, consultar y cancelar por API cumpliendo R1–R13, con la prueba de que la concurrencia no produce choques.
- **Dependencias:** T2.
- **Spec:** §4 (completo), §6.1, §7 (completo), §8 (completo), §10.
- **Alcance:**
  - `src/time.js` completo (validaciones R2–R6 en hora local).
  - `routes/rooms.js` **solo** `GET /api/rooms` (el CRUD admin es T5).
  - `routes/bookings.js`: `GET ?date`, `GET /mine`, `POST`, `DELETE /:id`.
  - Traducción `23P01` → 409 `BOOKING_CONFLICT`.
  - El `POST` se escribe ya como transacción explícita (`BEGIN` → validar sala → `INSERT` → `COMMIT`) con un cliente del pool. El bloqueo `FOR SHARE` de la sala (§8.1) se añade en T5 junto con su prueba.
  - `test/bookings.test.js` (un caso por regla R1–R10 y por código de error) y `test/concurrency.test.js` (§8, ambos casos).
- **Fuera de alcance:** UI; POST/PATCH de salas.
- **Criterios de aceptación:**
  1. Reservas seguidas 10:00–11:00 y 11:00–12:00 en la misma sala → ambas 201.
  2. Solapada (10:30–11:30 sobre 10:00–11:00) → 409 `BOOKING_CONFLICT`; misma hora en otra sala → 201.
  3. Tras cancelar, el mismo horario vuelve a poder reservarse.
  4. Concurrencia: 20 peticiones idénticas → exactamente 1×201 y 19×409; caso escalonado → ningún par solapado en BD.
  5. Empleado no puede cancelar reserva ajena (403); admin sí (200).
  6. `docker compose exec api npm test` pasa **3 veces seguidas** (la concurrencia no es intermitente).
- **Cómo se verifica:** `docker compose exec api npm test` ×3; prueba manual con `curl` del choque contra la reserva demo, entrando como Luis.
- **Riesgos:** tests que dependen de la fecha actual (usar fechas relativas); falsos positivos si el pool tiene pocas conexiones (mín. 10).

## T4 · Interfaz de empleado: login, agenda, reservar, mis reservas

- **Objetivo:** que un empleado pueda entrar, ver la agenda, reservar sin choques y cancelar sus reservas desde el navegador.
- **Dependencias:** T3.
- **Spec:** §3, §7.1, §7.3 (frontend), §9 (todas menos `/admin/salas`), §9.1, §10.1 `empleado.spec.js`.
- **Alcance:**
  - API: `GET /api/calendar` (`routes/calendar.js`, cálculo en `time.js`) y `test/calendar.test.js` (D-43).
  - `web/src/api.js` (fetch con token y manejo de 401), `auth.jsx` (contexto de sesión), rutas protegidas.
  - Páginas `Login`, `Agenda` (rejilla + formulario + cancelar propia), `MisReservas`; cabecera; `api-status` en el pie de página.
  - `e2e/tests/empleado.spec.js` con capturas `results/empleado-*.png`; actualizar `smoke.spec.js` si cambia la página inicial.
- **Fuera de alcance:** pantalla de salas; cancelar reservas ajenas desde la UI.
- **Criterios de aceptación:**
  1. Escenario `empleado.spec.js` del §10.1 pasa completo.
  2. El mensaje de choque es exactamente el del §9.
  3. Todos los `data-testid` del §9.1 que aplican a estas pantallas existen.
  4. Recargar el navegador mantiene la sesión; "Salir" la cierra.
  5. Smoke y tests de API siguen pasando.
- **Cómo se verifica:** skill `verificar-ui` (ejecuta e2e y revisa las capturas) + `docker compose exec api npm test`.
- **Riesgos:** la rejilla de 48 filas × 5 salas puede quedar ilegible (revisar en la captura); selectores frágiles si no se usan los `data-testid`.

## T5 · Administración de salas (RRHH) y cancelación por admin

- **Objetivo:** que RRHH gestione las salas y pueda cancelar cualquier reserva; cerrar los huecos técnicos del README.
- **Dependencias:** T4.
- **Spec:** §2, §4 R7, R9, R12 y R13, §7.2 filas `rooms`, **§8.1 (completo)**, §9 `/admin/salas` y cancelación por admin en agenda, §9.1, §10.1 `admin.spec.js`.
- **Alcance:**
  - `POST /api/rooms`, `PATCH /api/rooms/:id` (transacción con `SELECT ... FOR UPDATE` de la sala; desactivar cancela las futuras), `includeInactive` para admin.
  - Modificar `POST /api/bookings` para bloquear la sala con `SELECT ... FOR SHARE` dentro de su transacción, antes del INSERT (§8.1).
  - `test/rooms.test.js`: roles (employee → 403), nombre duplicado (409), desactivar cancela reservas futuras y devuelve `cancelledBookings`.
  - `test/room-lock.test.js`: los 3 escenarios del §8.1.
  - Página `/admin/salas`, enlace `nav-salas` solo admin, redirección de employee, botón cancelar en reservas ajenas para admin.
  - `e2e/tests/admin.spec.js` con capturas `results/admin-*.png`.
  - Revisar que el README describe exactamente lo construido (puertos, usuarios, comandos).
- **Fuera de alcance:** gestión de usuarios.
- **Criterios de aceptación:**
  1. Escenario `admin.spec.js` del §10.1 pasa.
  2. Tests de `rooms.test.js` pasan y no hay regresiones (API + e2e completo).
  3. `room-lock.test.js`: "desactivar primero" → 422 `ROOM_INACTIVE` sin reserva creada; "reservar primero" → `cancelledBookings >= 1` y la reserva queda `cancelled`; estrés → 0 reservas activas futuras en salas inactivas. `npm test` pasa **3 veces seguidas**.
  4. Desde clon limpio (`git clone` a carpeta temporal + `docker compose up -d --build`) todo queda `healthy` y la demo funciona.
- **Cómo se verifica:** `docker compose exec api npm test`; skill `verificar-ui` con la suite completa; prueba de clon limpio.
- **Riesgos:** dejar la UI sin actualizar tras desactivar una sala (refrescar la lista de salas y la agenda). Test de bloqueo intermitente si se usan esperas fijas (usar `pg_stat_activity`, §8.1). Olvidar liberar el cliente del pool tras un error en la transacción (usar `try/finally` con `ROLLBACK` y `release`).
