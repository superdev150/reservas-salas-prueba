# 03 · Bitácora

Registro con hora (America/Tegucigalpa) de todo lo ocurrido. Solo se añaden entradas, nunca se reescriben. Formato: `AAAA-MM-DD HH:MM · Sesión · Qué pasó`.

## S0 · Análisis y planificación (Claude Code, Opus 5.5)

- **2026-11-15 ~16:27** · S0 · Se crea la carpeta del repositorio (vacía, con `git init`). Se comparte el PDF de la prueba con el agente con la instrucción de analizar sin escribir código ni archivos, alcance de unas 5 tareas en 5–6 sesiones, y prioridad en: imposibilidad de doble reserva (también simultánea) y reconstrucción solo con la documentación.
- **~16:30** · S0 · El agente entrega el análisis: garantía anti-choque con `EXCLUDE USING gist` en PostgreSQL (descartando consultar-luego-insertar por condición de carrera), tabla de decisiones propuestas, backlog de 5 tareas y organización de sesiones. Plantea 3 preguntas que cambian el diseño (autenticación, papel de RRHH, zona horaria) y avisa de que la fecha de entrega del PDF ya pasó.
- **~16:38** · S0 · Respuestas del responsable: ignorar la fecha y los correos del PDF; login con correo y contraseña; RRHH solo administra salas, no aprueba; zona horaria America/Tegucigalpa. Cambios al plan: (1) S6 es solo el cierre, el ensayo de reconstrucción lo hará el equipo revisor; (2) el seed deja una reserva en Sala 1 el próximo día hábil de 10:00 a 11:00 para probar el choque desde la UI; (3) verificación de UI con una skill del repo usando Playwright, comprobando si funciona dentro de Docker; (4) en CLAUDE.md, nunca hacer push, solo commits locales.
- **16:39** · S0 · Verificación técnica de Playwright en Docker: compose temporal con nginx + `mcr.microsoft.com/playwright:v1.65.1-noble` en la misma red. Primer intento falló por usar `timeout` (no existe en macOS); segundo intento: `1 passed`, captura escrita en el volumen montado. Conclusión: viable (D-15).
- **16:40** · S0 · Consulta de versiones actuales para fijarlas en el spec: express 5.3.0, pg 8.23.1, bcryptjs 3.0.3, jsonwebtoken 9.0.3, supertest 7.3.2, react 19.3.1, react-router-dom 7.18.5, vite 8.3.8, @vitejs/plugin-react 6.3.0, @playwright/test 1.65.1; imágenes postgres 16.16, node 22.23.5, nginx 1.27.5.
- **16:43** · S0 · Redactados `docs/00-decisiones.md` (25 decisiones, confirmadas y propuestas), `docs/01-spec.md`, `docs/02-backlog.md` (T1–T5 con DoR/DoD), `CLAUDE.md`, `README.md` con la instrucción única, skill `.claude/skills/verificar-ui`, plantilla de tareas y guía de sesiones. Pendiente: revisión del responsable y commit local de S0.
- **~16:50** · S0 · Revisión del responsable: confirma todas las decisiones propuestas (incluidas D-09, D-10 y D-24) y pide 2 cambios. (1) `CLAUDE.md` con dos modos: Desarrollo (plan corto y OK antes de escribir código; si el spec no lo resuelve, el agente pregunta y la decisión se escribe antes del código) y Reconstrucción (solo si la instrucción lo dice: sin preguntas, opción más simple, notas solo en `docs/reconstruccion/`). (2) Carrera en D-13: una reserva creada mientras RRHH desactiva una sala podía quedar activa en una sala inactiva; se pide bloquear la fila de la sala al desactivar y al reservar, con una prueba.
- **16:54** · S0 · Cambios aplicados: D-26 (bloqueo `FOR SHARE` al reservar y `FOR UPDATE` al modificar sala; la FK solo toma `FOR KEY SHARE`, por eso no bastaba) y D-27 (dos modos); spec R12 y nueva §8.1 con el SQL de ambas transacciones y 3 escenarios de prueba (`room-lock.test.js`, detectando la espera con `pg_stat_activity` en vez de esperas fijas); T5 ampliada (estimación de 25 a 35 min); T3 deja el POST como transacción explícita para que T5 solo añada el bloqueo; `CLAUDE.md` reescrito con los dos modos; la instrucción del README activa el modo reconstrucción; carpeta `docs/reconstruccion/` creada. Commit local de S0.

## S1 · T1 Esqueleto (Claude Code, Opus 5.5)

- **~17:05** · S1 · El responsable pide guardar en memoria la regla de commitear el export de la sesión anterior; se commitea el export de S0 (`fee0cf4`). El agente presenta el plan de T1 con 4 dudas (dependencias por tarea, arranque sin migrar en T1, BD del test de health, `.dockerignore`).
- **~17:10** · S1 · OK del responsable al plan. Acepta las dudas 1–3 como se propusieron y pide `.dockerignore` en api, web y e2e, anotado como decisión y en el spec. Pide también que la regla del export esté en `CLAUDE.md`, porque la memoria del agente es local. Se escriben D-28 a D-32, el spec §5.2, el backlog T1 y `CLAUDE.md` antes del código.
- **~17:15** · S1 · Código de T1 escrito; los lockfiles se generan en un contenedor `node:22-alpine`. Primera verificación: `npm test` falla (`node --test test/` no acepta directorios en Node 22) y `web` queda `unhealthy` (`localhost` → `::1`, nginx solo en IPv4). Se corrige nginx con `listen [::]:80;`. Sobre el script de test, el responsable elige el glob `test/**/*.test.js` (D-33, backlog corregido).
- **17:21** · S1 · Verificación completa tras `down -v` + `up --build`: los 3 servicios `healthy`, health por nginx ok, `npm test` 1/1, e2e smoke `1 passed` y captura `smoke.png` revisada ("API: ok"), `e2e` fuera de `up`. Registro en `docs/tareas/T1-esqueleto.md` y commit local de T1.

## S2 · T2 Base de datos, migraciones, seed y autenticación (Claude Code, Opus 5.5)

- **2026-11-15 ~17:24** · S2 · Al iniciar, el export de S1 se mueve a `docs/sesiones/` y se commitea solo. El agente presenta el plan de T2 con dos dudas: archivos de test en paralelo contra `reservas_test` y textos de `message` de la API.
- **17:27** · S2 · OK del responsable: los tests corren en serie (D-34, `--test-concurrency=1`) y el agente decide los mensajes, que quedan fijados en el spec §7 para que la reconstrucción use los mismos (D-35). Se actualizan decisiones, spec y backlog antes del código.
- **~17:28** · S2 · Código de T2 escrito: migración literal del §6.1 (extraída del spec), `migrate`, `time` (mínimo para el seed), `seed`, `auth` y `routes/auth`, `helpers.js` con `reservas_test` y `auth.test.js`. Lockfile regenerado en `node:22-alpine` con `bcryptjs@3.0.3` y `jsonwebtoken@9.0.3`.
- **17:30** · S2 · Verificación tras `down -v` + `up -d --build`: servicios `healthy`, `bookings_no_overlap` presente, seed 4/5/1 con la demo el 2026-11-16 16:00–17:00 UTC, reiniciar `api` no duplica ni re-migra, `npm test` 11/11 tres veces, `curl` de login y `/me` correctos, smoke e2e `1 passed`. Registro en `docs/tareas/T2-bd-auth.md` y commit local de T2.

## S3 · T3 API de reservas con garantía anti-choque (Claude Code, Opus 5.5)

- **2026-11-15 ~17:35** · S3 · Al iniciar, el export de S2 se mueve a `docs/sesiones/` y se commitea solo (`5b11ea8`). El agente presenta el plan de T3 con 6 dudas y explica por qué el choque lo detecta la BD: el código no lee `bookings` antes del `INSERT`, el único 409 sale de traducir el `23P01`, y el resultado se cuenta en la BD.
- **17:42** · S3 · OK del responsable: dudas 1–5 como se propusieron y el control negativo en su propio archivo. Se escriben D-36 a D-41 y se actualiza el spec (§7 mensajes, §5.2 y §8 control negativo) antes del código.
- **17:47** · S3 · Código y tests escritos. Verificación tras `down -v` + `up -d --build`: servicios `healthy`; `npm test` 40/40 tres veces seguidas (1×201 + 19×409, escalonado sin pares solapados, control sin restricción 20×201); `curl` como Luis: choque con la demo → 409, 11–12 → 201, cancelar la demo de Ana → 403, cancelar la suya → 200; smoke e2e `1 passed`. Registro en `docs/tareas/T3-reservas.md` y commit local de T3.
- **~17:52** · S3 · Duda del responsable: ¿el control negativo afecta a otras pruebas si corren a la vez? Comprobación: en serie no afecta (también con el orden invertido), pero forzando el paralelo el control y la concurrencia chocaban al recrear `reservas_test`. El responsable pide blindarlo.
- **17:55** · S3 · D-42 y spec §8/§10 escritos antes del código. El control usa `reservas_test_control` (`setupTestDb(dbName)`). Verificación: control ‖ concurrencia en paralelo 4/4 tres veces; la restricción solo falta en `reservas_test_control`; `npm test` 40/40 ×3; smoke e2e `1 passed`. La suite completa forzada en paralelo sigue fallando porque los demás archivos comparten `reservas_test` (cubierto por D-34). Registro ampliado en `docs/tareas/T3-reservas.md` y commit local.

## S4 · T4 Interfaz de empleado (Claude Code, Opus 5.5)

- **2026-11-15 ~17:58** · S4 · Al iniciar, el export de S3 se mueve a `docs/sesiones/` y se commitea solo (`86fdffb`). El agente presenta el plan de T4 con 5 dudas: fecha de hoy en el frontend, confirmación al cancelar en la agenda, dónde va el formulario, celdas pasadas o no hábiles, y `/login` con sesión.
- **~18:02** · S4 · OK del responsable con cambios. La fecha de hoy la da la API, para que la zona horaria viva en un solo lugar. Hay confirmación también en la agenda. El formulario se abre en un modal, porque debajo de 48 filas no se ve. La UI avisa y deshabilita las celdas si el día no se puede reservar. El agente propone el contrato `GET /api/calendar`, que el responsable acepta añadiendo el aviso "Ya no quedan horas disponibles hoy.". Se escriben D-43 a D-47 y se actualizan spec y backlog antes del código.
- **~18:10** · S4 · Código escrito: endpoint `GET /api/calendar` con sus tests, SPA con `react-router-dom@7.18.5` (login, agenda con rejilla, modal, avisos, mis reservas) y `empleado.spec.js`. Primera ejecución: API 47/47 y e2e `5 passed`. Al revisar las capturas, la etiqueta "08:00" aparece cortada bajo la cabecera fija; se corrige el CSS y se vuelve a ejecutar y revisar.
- **18:16** · S4 · Verificación tras `down -v` + `up -d --build`: servicios `healthy`, `npm test` 47/47, e2e `5 passed` dos veces seguidas, 9 capturas revisadas, `curl` de `/api/calendar` correcto. Registro en `docs/tareas/T4-interfaz-empleado.md` y commit local de T4.

## S5 · T5 Administración de salas, bloqueo sala/reserva y cancelación por admin (Claude Code, Opus 5.5)

- **2026-11-15 ~18:20** · S5 · Al iniciar, el export de S4 se mueve a `docs/sesiones/` y se commitea solo (`9c13578`). El agente presenta el plan de T5 con 6 dudas: validación y mensaje de salas, mayúsculas en el nombre, orden de errores, edición en la UI, textos al desactivar y reactivación. El responsable pide que la verificación final revise el README contra la app real.
- **~18:28** · S5 · OK del responsable. El nombre de sala no distingue mayúsculas, así que el agente lo garantiza en la BD con una migración `002` (el `001` sigue literal) y no con una consulta previa. Se escriben D-48 a D-53 y spec §4, §5.2, §6.1, §7 y §9 antes del código.
- **~18:33** · S5 · API escrita: `POST`/`PATCH` de salas, `FOR SHARE` en reservas, 409 `ROOM_NAME_TAKEN`, `rooms.test.js` ampliado y `room-lock.test.js`. `npm test` da 59/59. Control: sin `FOR SHARE`, `room-lock` falla en 4 de 5 tests.
- **~18:35** · S5 · Al escribir `admin.spec.js`, el agente detecta que Playwright ejecutaría en paralelo dos archivos que limpian las reservas de Luis. El responsable elige `workers: 1` y pide anotarlo: D-54, escrita antes del cambio.
- **~18:38** · S5 · e2e: un primer fallo de selector del propio test (la celda de las 10:00 de Sala 1 está tapada por la demo). En las capturas, una línea de la tabla de salas aparece cortada; se corrige el CSS. Después, 9 passed varias veces seguidas.
- **18:41** · S5 · Verificación tras `down -v` + `up -d --build`: servicios `healthy`, migraciones 001 y 002, `npm test` 59/59 ×3, e2e 9 passed, contratos con `curl`. Revisión del README frase por frase contra la app: se corrigen los pasos de "Probar el choque" (la celda de las 10:00 no se puede pulsar), el tamaño de la imagen de Playwright y la versión de Compose; se añaden la sección de administración de salas, el aviso de que el e2e modifica la demo y la base `reservas_test_control`. Los pasos nuevos se recorren con un script de Playwright que solo usa textos visibles: 2 passed.
- **18:43** · S5 · Prueba de clon limpio sobre el commit de T5: `git clone` a una carpeta temporal y `up -d --build` → `healthy`, seed 4/5/1, migraciones 001 y 002, `npm test` 59/59, e2e 9 passed, captura del choque revisada. Clon desmontado y stack principal levantado de nuevo. Se completa `docs/tareas/T5-admin-salas.md` y se enmienda el commit local de T5 con esta evidencia.

## S6 · Cierre (Claude Code, Opus 5.5)

- **2026-11-15 ~18:55** · S6 · Al iniciar, el export de S5 se mueve a `docs/sesiones/` y se commitea solo (`2d3d16a`). El agente presenta el plan de cierre con 3 dudas.
- **~19:00** · S6 · OK del responsable con estas respuestas:
  - la prueba de clon limpio se repite sobre la versión final;
  - se incluyen los puntos extra A (supuestos técnicos sin probar en S0) y B (regla de proceso en la memoria local), después de los suyos;
  - solo bitácora y commit, sin documento en `docs/tareas/`.

  El responsable fija los tres primeros fallos del plan: el README sin comprobar hasta T5, el aislamiento de pruebas sin decidir y los estados de pantalla sin pensar. Todos tienen la misma causa: se debían decidir en S0. En "Qué no quedó" solo va la reconstrucción, que hará el equipo revisor.
- **19:09** · S6 · Prueba de clon limpio sobre `2d3d16a`:
  - `up -d --build` → 3 servicios `healthy`;
  - seed 4/5/1, migraciones 001 y 002, `bookings_no_overlap` presente;
  - `npm test` 59/59 y e2e `9 passed`;
  - capturas del choque, del día no hábil y de la sala desactivada revisadas.

  Después se desmonta el clon y se vuelve a levantar el stack principal. Se completa `docs/04-cierre.md` (DoD con evidencia, qué quedó, qué no, 5 fallos del plan y qué cambiaría) y se hace el commit local de S6.
