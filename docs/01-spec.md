# 01 · Spec — Reservas de salas de reunión

> Fuente de verdad del producto. Si algo no está aquí, no se construye.
> Cada decisión remite a `00-decisiones.md` (D-xx) con su porqué.

## 1. Problema

> "Somos unas 80 personas y tenemos 5 salas de reunión. Las reservamos en un Excel compartido y cada semana dos equipos llegan a la misma sala a la misma hora. Queremos una aplicación interna para reservar salas sin choques. Recursos Humanos es quien administra las salas."

**Objetivo del MVP:** que sea **imposible** que existan dos reservas activas de la misma sala que se solapen en el tiempo, incluso si dos personas reservan en el mismo instante.

## 2. Roles

| Rol | Código | Quién | Puede |
|---|---|---|---|
| Empleado | `employee` | Cualquier persona de la empresa | Ver la agenda de todas las salas, crear reservas, ver y cancelar **sus** reservas |
| Administrador | `admin` | Recursos Humanos | Todo lo del empleado + crear/editar/activar/desactivar salas + cancelar **cualquier** reserva |

RRHH **no aprueba** reservas: una reserva válida queda confirmada al crearse (D-02).

## 3. Alcance del MVP

**Dentro**
- Login con correo y contraseña (usuarios precargados por seed).
- Agenda diaria: todas las salas activas, reservas del día.
- Crear reserva, cancelar reserva propia, ver "Mis reservas".
- Administración de salas (solo admin) y cancelación de cualquier reserva por el admin.
- Garantía de no-solapamiento en base de datos + test de concurrencia.
- Verificación de interfaz con Playwright dentro de Docker.

**Fuera** (anotado para siguientes versiones)
- Registro de usuarios / gestión de usuarios / recuperar contraseña.
- Editar una reserva (se cancela y se crea otra).
- Reservas recurrentes.
- Notificaciones por correo, integración con calendarios.
- Aprobaciones.
- Despliegue en la nube, HTTPS.

## 4. Reglas de negocio

Todas las horas se interpretan en la zona horaria de la oficina: **`America/Tegucigalpa`** (UTC−06:00, sin horario de verano). En BD se guarda `TIMESTAMPTZ` (UTC).

| ID | Regla | Dónde se aplica | Error |
|---|---|---|---|
| R1 | Dos reservas **activas** de la misma sala no pueden solaparse. Intervalo semiabierto `[inicio, fin)`: 10:00–11:00 y 11:00–12:00 **no** chocan | **Restricción `EXCLUDE` en PostgreSQL** (nunca solo en código) | 409 `BOOKING_CONFLICT` |
| R2 | Inicio y fin en múltiplos de 15 minutos (`HH:00`, `HH:15`, `HH:30`, `HH:45`) | API | 422 `INVALID_SLOT` |
| R3 | Duración mínima 15 min, máxima 240 min (4 h) | API | 422 `INVALID_SLOT` |
| R4 | Solo lunes a viernes, entre 08:00 y 20:00 hora local; inicio y fin el mismo día | API | 422 `OUTSIDE_BUSINESS_HOURS` |
| R5 | El inicio debe ser posterior al momento actual | API | 422 `IN_PAST` |
| R6 | El inicio no puede estar a más de 30 días naturales desde hoy | API | 422 `TOO_FAR_AHEAD` |
| R7 | La sala debe existir y estar activa | API | 404 `NOT_FOUND` / 422 `ROOM_INACTIVE` |
| R8 | El título es obligatorio, 1–120 caracteres tras recortar espacios | API + CHECK en BD | 400 `VALIDATION_ERROR` |
| R9 | Solo el dueño o un admin pueden cancelar una reserva | API | 403 `FORBIDDEN` |
| R10 | Solo se cancelan reservas activas cuyo inicio aún no ha llegado | API | 409 `BOOKING_NOT_CANCELLABLE` |
| R11 | Cancelar no borra: cambia `status` a `cancelled` y libera el horario (la restricción solo aplica a `active`) | BD + API | — |
| R12 | Desactivar una sala cancela en la misma transacción sus reservas activas futuras; no se borran salas. Nunca puede quedar una reserva activa futura en una sala inactiva, ni siquiera si alguien reserva mientras RRHH desactiva (bloqueo de fila, §8.1) | API (transacción + bloqueo de fila) | — |
| R13 | Nombre de sala único | UNIQUE en BD | 409 `ROOM_NAME_TAKEN` |

**Orden de validación al crear reserva:** 400 (formato) → 404/422 sala → 422 reglas R2–R6 → INSERT (la BD decide R1 → 409).
No se hace "SELECT para ver si está libre" antes del INSERT como garantía: la garantía es la restricción (D-05). Ese tipo de comprobación previa está **prohibida** porque introduce la falsa sensación de control y una condición de carrera.
El único SELECT previo permitido es el bloqueo de la **fila de la sala** (`FOR SHARE`, §8.1), que garantiza R7/R12 (sala activa), no R1.

## 5. Arquitectura

```
navegador ──► web (nginx :80, publicado en host :8080)
                 ├── /         → SPA React compilada (estático)
                 └── /api/*    → proxy a api:3000
              api (Node 22 + Express :3000, solo red interna)
                 └── PostgreSQL (db :5432, solo red interna, volumen pgdata)
              e2e (Playwright, perfil "e2e", solo bajo demanda)
```

### 5.1 Versiones fijadas (D-07)

| Pieza | Versión |
|---|---|
| Imagen BD | `postgres:16-alpine` |
| Imagen Node (api y build web) | `node:22-alpine` |
| Imagen web | `nginx:1.27-alpine` |
| Imagen e2e | `mcr.microsoft.com/playwright:v1.65.1-noble` |
| api deps | `express@5.3.0`, `pg@8.23.1`, `bcryptjs@3.0.3`, `jsonwebtoken@9.0.3` |
| api devDeps | `supertest@7.3.2` (tests con `node:test` nativo) |
| web deps | `react@19.3.1`, `react-dom@19.3.1`, `react-router-dom@7.18.5` |
| web devDeps | `vite@8.3.8`, `@vitejs/plugin-react@6.3.0` |
| e2e devDeps | `@playwright/test@1.65.1` (debe coincidir con la imagen) |

En `package.json` las versiones van **exactas** (sin `^`). Se commitea `package-lock.json` y los Dockerfile usan `npm ci`.
JavaScript con CommonJS en api y e2e; ESM (por Vite) en web. Sin TypeScript (D-08).

### 5.2 Estructura del repositorio

```
docker-compose.yml
.gitignore                 # node_modules, dist, e2e/results, e2e/test-results
api/
  Dockerfile  .dockerignore
  package.json  package-lock.json
  migrations/001_init.sql
  src/
    index.js               # arranque: migrar → seed → escuchar
    app.js                 # crea la app Express (exportada para tests)
    db.js                  # Pool de pg desde DATABASE_URL
    migrate.js             # aplica migrations/*.sql en orden, registra en schema_migrations
    seed.js                # datos iniciales idempotentes
    time.js                # conversión hora local ↔ UTC y reglas de calendario
    auth.js                # login, JWT, middlewares requireAuth / requireAdmin
    errors.js              # clase AppError y middleware de errores
    routes/health.js  routes/auth.js  routes/rooms.js  routes/bookings.js
  test/
    helpers.js             # crea BD reservas_test limpia, migra, siembra, devuelve app
    auth.test.js  rooms.test.js  bookings.test.js  concurrency.test.js  room-lock.test.js
web/
  Dockerfile               # multi-stage: node build → nginx
  .dockerignore
  nginx.conf
  package.json  package-lock.json  vite.config.js  index.html
  src/ main.jsx  App.jsx  api.js  auth.jsx  pages/*.jsx  components/*.jsx  styles.css
e2e/
  Dockerfile               # FROM imagen playwright; npm ci; copia tests
  .dockerignore
  package.json  package-lock.json  playwright.config.js
  tests/ smoke.spec.js  empleado.spec.js  admin.spec.js
  results/                 # capturas (montado como volumen, ignorado por git)
```

**`.dockerignore`** (D-31) en `api/`, `web/` y `e2e/`, para que la imagen se construya solo con lo versionado en el repo:
```
node_modules
dist
results
test-results
.env*
*.log
.DS_Store
```

### 5.3 docker-compose.yml (contrato)

| Servicio | Build/imagen | Puertos | Depende de | Healthcheck |
|---|---|---|---|---|
| `db` | `postgres:16-alpine`; env `POSTGRES_DB=reservas`, `POSTGRES_USER=reservas`, `POSTGRES_PASSWORD=reservas`; volumen `pgdata` | ninguno publicado | — | `pg_isready -U reservas -d reservas` |
| `api` | `./api` | ninguno publicado (expone 3000) | `db` healthy | `wget -qO- http://localhost:3000/api/health` |
| `web` | `./web` | `8080:80` | `api` healthy | `wget -qO- http://localhost/` |
| `e2e` | `./e2e`; `profiles: ["e2e"]`; env `BASE_URL=http://web`; volumen `./e2e/results:/e2e/results` | ninguno | `web` healthy | — |

Variables de `api` (con valor por defecto en el compose, no se necesita `.env`):
`DATABASE_URL=postgres://reservas:reservas@db:5432/reservas`, `JWT_SECRET=dev-secret-cambiar-en-produccion`, `APP_TIMEZONE=America/Tegucigalpa`, `PORT=3000`.

`docker compose up` (sin flags) debe dejar todo funcionando en `http://localhost:8080` desde un clon limpio. El servicio `e2e` **no** arranca con `up` gracias al perfil.

### 5.4 Arranque de la API

1. Esperar a que la BD acepte conexiones (reintentos cada 1 s, máx. 30).
2. `migrate`: crea `schema_migrations(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())` si no existe y aplica, en orden alfabético y cada una en su transacción, los `.sql` de `migrations/` no aplicados.
3. `seed` (sección 6.2).
4. Escuchar en `PORT`.

## 6. Modelo de datos

### 6.1 `migrations/001_init.sql` (literal)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('employee', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 60),
  capacity   INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 100),
  location   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
  id           SERIAL PRIMARY KEY,
  room_id      INTEGER NOT NULL REFERENCES rooms(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancelled_at TIMESTAMPTZ,
  cancelled_by INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_valid_range CHECK (ends_at > starts_at),
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'active')
);

CREATE INDEX bookings_starts_at_idx ON bookings (starts_at);
CREATE INDEX bookings_user_idx ON bookings (user_id, starts_at);
```

La API traduce el error de PostgreSQL con `code = '23P01'` (exclusion_violation) y `constraint = 'bookings_no_overlap'` a **409 `BOOKING_CONFLICT`**, y `23505` sobre `rooms_name_key` a **409 `ROOM_NAME_TAKEN`**.

### 6.2 Seed (idempotente, en cada arranque)

- **Usuarios** — solo si la tabla `users` está vacía. Contraseñas con `bcryptjs` (coste 10).

  | Correo | Nombre | Rol | Contraseña |
  |---|---|---|---|
  | `rrhh@empresa.local` | Recursos Humanos | admin | `Rrhh2026!` |
  | `ana@empresa.local` | Ana López | employee | `Empleado2026!` |
  | `luis@empresa.local` | Luis Martínez | employee | `Empleado2026!` |
  | `maria@empresa.local` | María Pérez | employee | `Empleado2026!` |

- **Salas** — solo si `rooms` está vacía:

  | Nombre | Capacidad | Ubicación |
  |---|---|---|
  | Sala 1 | 4 | Piso 1 |
  | Sala 2 | 6 | Piso 1 |
  | Sala 3 | 8 | Piso 2 |
  | Sala 4 | 10 | Piso 2 |
  | Sala 5 | 12 | Piso 3 |

- **Reserva de demostración** — solo si `bookings` está vacía: Sala 1, **próximo día hábil** (el primer día lunes–viernes estrictamente posterior a hoy en `America/Tegucigalpa`), 10:00–11:00 hora local, dueña Ana López, título `Reunión de equipo (demo)`. Sirve para probar el choque desde la interfaz entrando como Luis (D-14).

## 7. Contratos de la API

Base `/api`. JSON en request y response. Autenticación con cabecera `Authorization: Bearer <token>` (todas las rutas salvo `health` y `auth/login`).

**Formato de error (siempre):**
```json
{ "error": { "code": "BOOKING_CONFLICT", "message": "La sala ya está reservada en ese horario." } }
```
`message` en español y apto para mostrar al usuario.

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Cuerpo/parámetros con formato inválido o faltantes |
| `UNAUTHORIZED` | 401 | Sin token, token inválido o expirado |
| `INVALID_CREDENTIALS` | 401 | Login con correo o contraseña incorrectos (mismo mensaje en ambos casos) |
| `FORBIDDEN` | 403 | Rol insuficiente o reserva ajena |
| `NOT_FOUND` | 404 | Recurso inexistente |
| `BOOKING_CONFLICT` | 409 | R1 |
| `ROOM_NAME_TAKEN` | 409 | R13 |
| `BOOKING_NOT_CANCELLABLE` | 409 | R10 |
| `INVALID_SLOT` | 422 | R2, R3 |
| `OUTSIDE_BUSINESS_HOURS` | 422 | R4 |
| `IN_PAST` | 422 | R5 |
| `TOO_FAR_AHEAD` | 422 | R6 |
| `ROOM_INACTIVE` | 422 | R7 |
| `INTERNAL_ERROR` | 500 | Cualquier otro (sin filtrar detalles internos) |

### 7.1 Representaciones

**User:** `{ "id": 2, "email": "ana@empresa.local", "name": "Ana López", "role": "employee" }`

**Room:** `{ "id": 1, "name": "Sala 1", "capacity": 4, "location": "Piso 1", "isActive": true }`

**Booking:**
```json
{
  "id": 1, "roomId": 1, "roomName": "Sala 1",
  "userId": 2, "userName": "Ana López",
  "title": "Reunión de equipo (demo)",
  "date": "2026-11-16", "startTime": "10:00", "endTime": "11:00",
  "startsAt": "2026-11-16T16:00:00.000Z", "endsAt": "2026-11-16T17:00:00.000Z",
  "status": "active"
}
```
`date/startTime/endTime` en hora local de la oficina; `startsAt/endsAt` en UTC ISO-8601.

### 7.2 Endpoints

| Método y ruta | Rol | Request | Respuesta OK | Errores |
|---|---|---|---|---|
| `GET /api/health` | público | — | 200 `{ "status": "ok", "db": "ok" }` (hace `SELECT 1`) | 503 `{ "status":"error","db":"error" }` |
| `POST /api/auth/login` | público | `{ email, password }` | 200 `{ token, user: User }` | 400, 401 `INVALID_CREDENTIALS` |
| `GET /api/auth/me` | auth | — | 200 `User` | 401 |
| `GET /api/rooms` | auth | query `includeInactive=true` (solo admin; ignorado para employee) | 200 `Room[]` ordenadas por `name` | 401 |
| `POST /api/rooms` | admin | `{ name, capacity, location? }` | 201 `Room` | 400, 401, 403, 409 `ROOM_NAME_TAKEN` |
| `PATCH /api/rooms/:id` | admin | cualquiera de `{ name, capacity, location, isActive }` | 200 `{ room: Room, cancelledBookings: number }` (transacción con `FOR UPDATE` de la sala, §8.1) | 400, 401, 403, 404, 409 |
| `GET /api/bookings?date=YYYY-MM-DD` | auth | `date` obligatorio | 200 `Booking[]` activas de ese día local (todas las salas), orden `startsAt` | 400, 401 |
| `GET /api/bookings/mine` | auth | — | 200 `Booking[]` activas del usuario con `endsAt > now`, orden `startsAt` | 401 |
| `POST /api/bookings` | auth | `{ roomId, date: "YYYY-MM-DD", startTime: "HH:mm", endTime: "HH:mm", title }` (hora local) | 201 `Booking` | 400, 401, 404, 409 `BOOKING_CONFLICT`, 422 |
| `DELETE /api/bookings/:id` | auth (dueño o admin) | — | 200 `Booking` con `status: "cancelled"` | 401, 403, 404, 409 `BOOKING_NOT_CANCELLABLE` |

**Por qué la reserva se pide en hora local y no en UTC:** toda la lógica de zona horaria vive en un solo lugar (`api/src/time.js`) y el frontend no tiene que calcular desfases (D-09).

### 7.3 Autenticación

- JWT HS256 firmado con `JWT_SECRET`, expira en 8 h, payload `{ sub: userId, role }`.
- `requireAuth` carga el usuario desde BD en cada petición (si fue borrado → 401).
- Frontend guarda el token en `localStorage` (D-11) y, ante cualquier 401, cierra sesión y redirige a `/login`.

## 8. Concurrencia (la garantía central)

- La garantía es R1 en BD. El INSERT es una sola sentencia; PostgreSQL serializa el chequeo de la restricción, así que de N inserciones simultáneas que se solapan, **exactamente una** tiene éxito.
- **Test obligatorio** (`api/test/concurrency.test.js`): lanzar con `Promise.all` **20** `POST /api/bookings` idénticos (mismo usuario, sala y horario) contra la BD real → exactamente 1 respuesta 201, 19 respuestas 409 `BOOKING_CONFLICT`, y `SELECT count(*)` de reservas activas de ese horario = 1. Segundo caso: 20 peticiones de **distintos horarios solapados parcialmente** (p. ej. inicios escalonados de 15 min con 60 min de duración) → en BD no existe ningún par solapado (verificado con un self-join).
- El pool de `pg` debe tener al menos 10 conexiones para que la concurrencia sea real.

### 8.1 Carrera "desactivar sala" vs "crear reserva" (R12, D-26)

**Problema:** sin bloqueo, una reserva puede validar `is_active = true`, RRHH desactiva la sala y cancela las reservas futuras **que ya ve**, y después se confirma la reserva nueva: queda activa en una sala inactiva. La FK de `bookings.room_id` no lo evita, porque solo toma `FOR KEY SHARE`, que no choca con un `UPDATE` de `is_active`.

**Solución:** ambas operaciones bloquean la misma fila de `rooms` con modos incompatibles.

*Crear reserva* (`POST /api/bookings`), una transacción en `READ COMMITTED`:
```sql
BEGIN;
SELECT id, is_active FROM rooms WHERE id = $roomId FOR SHARE;   -- no existe → 404; is_active = false → 422 ROOM_INACTIVE (ROLLBACK)
INSERT INTO bookings (...) VALUES (...) RETURNING *;            -- 23P01 → 409 BOOKING_CONFLICT (ROLLBACK)
COMMIT;
```

*Desactivar sala* (`PATCH /api/rooms/:id` con `isActive: false`), una transacción:
```sql
BEGIN;
SELECT id FROM rooms WHERE id = $id FOR UPDATE;                 -- no existe → 404
UPDATE rooms SET is_active = false, ... WHERE id = $id;
UPDATE bookings SET status = 'cancelled', cancelled_at = now(), cancelled_by = $adminId
 WHERE room_id = $id AND status = 'active' AND starts_at > now();   -- rowCount = cancelledBookings
COMMIT;
```
(Cualquier `PATCH` de sala usa el `FOR UPDATE`, aunque solo cambie el nombre: un único camino de código.)

**Por qué funciona:**
- `FOR SHARE` y `FOR UPDATE` son incompatibles. Si la reserva bloqueó primero, la desactivación espera a que la reserva termine y después la ve y la cancela. Si la desactivación bloqueó primero, la reserva espera y, al continuar, PostgreSQL le devuelve la versión ya confirmada de la fila (`is_active = false`), así que responde 422 `ROOM_INACTIVE`.
- `FOR SHARE` es compatible consigo mismo: varias reservas de la misma sala siguen en paralelo, y el choque entre ellas lo resuelve la restricción (§8).
- El orden de bloqueo es siempre "sala primero", así que no hay interbloqueos entre estas dos operaciones.

**Test obligatorio** (`api/test/room-lock.test.js`, T5), contra la BD real. Para saber que una petición HTTP está bloqueada, el test consulta `pg_stat_activity` hasta encontrar un backend con `wait_event_type = 'Lock'` (máx. 5 s) en lugar de usar esperas fijas.
1. **Desactivar primero:** un cliente `pg` del test abre una transacción y hace `SELECT ... FOR UPDATE` de la sala (simula a RRHH a mitad de desactivar). Lanza `POST /api/bookings` para esa sala → queda en espera. El cliente pone `is_active = false` y hace `COMMIT` → la petición responde **422 `ROOM_INACTIVE`** y no existe ninguna reserva nueva.
2. **Reservar primero:** un cliente `pg` abre una transacción, hace `SELECT ... FOR SHARE` de la sala e inserta una reserva futura (simula una reserva a mitad de crearse). Lanza `PATCH /api/rooms/:id {isActive:false}` → queda en espera. El cliente hace `COMMIT` → el PATCH responde 200 con **`cancelledBookings >= 1`** y esa reserva está `cancelled`.
3. **Estrés:** 15 `POST /api/bookings` a horarios distintos de la misma sala + 1 `PATCH {isActive:false}` en `Promise.all` → al terminar, `SELECT count(*) FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE NOT r.is_active AND b.status = 'active' AND b.starts_at > now()` = **0**. Repetir 3 veces.

## 9. Pantallas

Rutas del SPA (react-router-dom). Todas excepto `/login` requieren sesión.

| Ruta | Quién | Contenido |
|---|---|---|
| `/login` | público | Formulario correo + contraseña. Error genérico "Correo o contraseña incorrectos". |
| `/` → `/agenda` | todos | Selector de fecha (por defecto hoy; si es fin de semana, el próximo día hábil). Rejilla: una columna por sala activa, filas de 15 min de 08:00 a 20:00. Las reservas se dibujan como bloques que ocupan sus filas con título y nombre del dueño. Clic en celda libre abre el formulario precargado (sala, fecha, inicio, fin = inicio + 60 min recortado a 20:00). Clic en una reserva propia (o cualquiera si admin) muestra botón "Cancelar". |
| `/mis-reservas` | todos | Lista de mis reservas futuras con botón "Cancelar" (pide confirmación). |
| `/admin/salas` | admin | Tabla de salas (incluidas inactivas), formulario crear, editar nombre/capacidad/ubicación, botón Activar/Desactivar (confirmación avisando que se cancelan las reservas futuras). Un employee que entra aquí es redirigido a `/agenda`. |

**Formulario de reserva:** sala (select), fecha, inicio y fin (selects de 15 min entre 08:00 y 20:00), título. Al recibir 409 muestra **"Esa sala ya está reservada en ese horario. Elige otro."** y refresca la agenda. Los 422 muestran `error.message` del servidor.

**Cabecera:** nombre y rol del usuario, enlaces Agenda · Mis reservas · Salas (solo admin), botón Salir.

**Página inicial antes del login (T1):** mientras no exista login, `/` muestra `API: ok` o `API: error` consultando `/api/health`. En T4 esto se sustituye; el `data-testid="api-status"` se conserva en el pie de página.

### 9.1 `data-testid` obligatorios (contrato con e2e)

`api-status`, `login-email`, `login-password`, `login-submit`, `login-error`, `nav-agenda`, `nav-mis-reservas`, `nav-salas`, `logout`, `agenda-date`, `agenda-grid`, `slot-{roomId}-{HH:mm}` (celda), `booking-{id}` (bloque), `booking-form`, `booking-room`, `booking-start`, `booking-end`, `booking-title`, `booking-submit`, `booking-error`, `booking-cancel`, `mine-list`, `mine-item-{id}`, `mine-cancel-{id}`, `room-form`, `room-name`, `room-capacity`, `room-location`, `room-submit`, `room-row-{id}`, `room-toggle-{id}`.

## 10. Pruebas

| Tipo | Herramienta | Cómo se ejecuta | Qué cubre |
|---|---|---|---|
| API | `node:test` + `supertest` contra PostgreSQL real | `docker compose exec api npm test` | Auth, roles, reglas R1–R13, concurrencia |
| UI | Playwright en contenedor | `docker compose --profile e2e run --rm --build e2e` | Flujos de usuario reales vía nginx |

- Los tests de API usan una base **`reservas_test`** que `test/helpers.js` borra y recrea (conectándose a la BD `postgres` del mismo servidor), migra y siembra. Nunca tocan la base `reservas` de la demo.
- Las fechas de los tests se calculan relativas a "hoy" (próximo día hábil, etc.), nunca fijas.
- Los tests e2e dejan capturas en `e2e/results/*.png` y son repetibles: antes de cada test cancelan vía API las reservas futuras de los usuarios que usan (excepto la reserva demo de Ana).

### 10.1 Escenarios e2e

- `smoke.spec.js` (T1): `/` muestra `api-status` con texto `API: ok`.
- `empleado.spec.js` (T4): login como Luis → agenda del próximo día hábil → muestra el bloque demo en Sala 1 10:00 → intenta reservar Sala 1 10:00–11:00 → ve el mensaje de choque → reserva Sala 1 11:00–12:00 → aparece en la agenda y en Mis reservas → la cancela → desaparece. Login con contraseña incorrecta muestra `login-error`.
- `admin.spec.js` (T5): login como RRHH → crea "Sala E2E <timestamp>" → aparece en la tabla y en la agenda → la desactiva → ya no aparece en la agenda. Luis no ve `nav-salas` y al abrir `/admin/salas` acaba en `/agenda`. RRHH puede cancelar desde la agenda una reserva creada por Luis.
