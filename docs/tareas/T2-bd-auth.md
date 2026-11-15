# T2 · Base de datos, migraciones, seed y autenticación

- **Sesión:** S2 · **Fecha:** 2026-11-15 · **Inicio–fin:** ~17:24–17:30
- **Agente:** Claude Code + Opus 5.5
- **Sesión exportada:** `docs/sesiones/S2-t2-bd-auth.txt`

## Qué se pidió
T2 de `02-backlog.md`: que exista el modelo de datos completo con la restricción anti-choque, que se apliquen migraciones y seed al arrancar y que los usuarios del seed puedan iniciar sesión (spec §2, §5.4, §6, §7, §7.1, §7.2 `auth/*`, §7.3, §10).

## Qué hizo el agente
- **Creados:**
  - `api/migrations/001_init.sql`: extraído del bloque SQL del spec §6.1 sin tocarlo (literal).
  - `api/src/migrate.js`: crea `schema_migrations` y aplica los `.sql` pendientes en orden alfabético, cada uno en su transacción.
  - `api/src/time.js`: `localToUtc`, `todayLocal`, `addDays`, `weekday` y `nextBusinessDay`, con `Intl` y `APP_TIMEZONE`, sin dependencias. Las validaciones R2–R6 quedan para T3.
  - `api/src/seed.js`: 4 usuarios (bcrypt coste 10), 5 salas y la reserva demo de Ana en Sala 1, el próximo día hábil de 10:00 a 11:00 local. Cada bloque solo se inserta si su tabla está vacía.
  - `api/src/auth.js`: `toUser`, `signToken` (HS256, 8 h, `{sub, role}`), `requireAuth` (carga el usuario desde BD en cada petición) y `requireAdmin`.
  - `api/src/routes/auth.js`: `POST /api/auth/login` y `GET /api/auth/me`.
  - `api/test/helpers.js`: `setupTestDb()` borra y recrea `reservas_test` (vía la BD `postgres`), migra, siembra y devuelve `{ app, pool }`.
  - `api/test/auth.test.js`: 10 casos.
- **Modificados:**
  - `api/src/index.js`: el arranque queda esperar BD → migrar → seed → escuchar (cierra D-29).
  - `api/src/app.js`: monta `/api/auth`.
  - `api/test/health.test.js`: pasa a usar `helpers.js` (D-30).
  - `api/package.json` y `package-lock.json`: añadidos `bcryptjs@3.0.3` y `jsonwebtoken@9.0.3`; script de test en serie (D-34).
  - `docs/01-spec.md`: columna "Mensaje" en la tabla de errores del §7 (D-35).
  - `docs/02-backlog.md`: script de test de T1 actualizado (D-34).
- **Puntos clave:**
  - El correo se normaliza (`trim` + minúsculas) antes de buscarlo.
  - Un correo inexistente y una contraseña incorrecta devuelven exactamente el mismo cuerpo.
  - `helpers.js` cambia `DATABASE_URL` a `reservas_test` antes de cargar `src/db`, así que `db.js` no necesitó cambios.

## Decisiones tomadas durante la tarea
- D-34: los archivos de test corren en serie (`--test-concurrency=1`), porque cada uno recrea `reservas_test`.
- D-35: mensajes de `message` fijados por código en el spec §7.

## Verificación
| Criterio de aceptación | Comando / evidencia | Resultado |
|---|---|---|
| 1. `\d bookings` muestra `bookings_no_overlap` | `docker compose exec db psql -U reservas -d reservas -c '\d bookings'` tras `down -v` + `up -d --build` | ✅ |
| 2. 4 usuarios, 5 salas, 1 reserva demo (Sala 1, próximo día hábil, 16:00–17:00 UTC) | consulta `psql` | ✅ `4\|5\|1`; Sala 1, Ana López, 2026-11-16 16:00–17:00 UTC (10:00 local) |
| 3. Reiniciar `api` no duplica ni re-migra | `docker compose restart api` + recuentos | ✅ `4\|5\|1` y 1 fila en `schema_migrations`; el log solo muestra "API escuchando" |
| 4. Casos de login y `/auth/me` | `test/auth.test.js` | ✅ |
| 5. `npm test` pasa | `docker compose exec api npm test` ×3 | ✅ 11/11 las 3 veces |
| DoD: servicios sanos | `docker compose ps` | ✅ db, api y web `healthy` |
| DoD: sin regresiones | `docker compose --profile e2e run --rm --build e2e` | ✅ smoke `1 passed` |

Salida relevante:
```
"bookings_no_overlap" EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE (status = 'active'::text)
Sala 1|Ana López|Reunión de equipo (demo)|2026-11-16 16:00:00|2026-11-16 17:00:00|2026-11-16 10:00:00|active
# tests 11  # pass 11  # fail 0

$ curl -s -X POST localhost:8080/api/auth/login ... ana@empresa.local
{"token":"<jwt…>","user":{"id":2,"email":"ana@empresa.local","name":"Ana López","role":"employee"}}
$ curl -s localhost:8080/api/auth/me -H "Authorization: Bearer $TOKEN"
{"id":2,"email":"ana@empresa.local","name":"Ana López","role":"employee"}
$ (contraseña mala)  {"error":{"code":"INVALID_CREDENTIALS","message":"Correo o contraseña incorrectos."}}
$ (sin token)        {"error":{"code":"UNAUTHORIZED","message":"Sesión no válida o expirada."}}
```

Capturas revisadas: no aplica (T2 no toca la UI). El smoke e2e solo se ejecutó como prueba de regresión.

## Problemas y correcciones
Ninguno en el código. En la verificación, un `grep` mal escrito (buscaba `ℹ` y la salida es TAP con `#`) no mostró el resultado de la 2ª ejecución, así que se repitió con el patrón corregido. Sin intervenciones manuales.
