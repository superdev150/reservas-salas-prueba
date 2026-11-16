# T5 · Administración de salas (RRHH), bloqueo sala/reserva y cancelación por admin

- **Sesión:** S5 · **Fecha:** 2026-11-15 · **Inicio–fin:** ~18:20–18:44
- **Agente:** Claude Code (Opus 5.5)
- **Sesión exportada:** `docs/sesiones/S5-t5-admin-salas.txt`

## Qué se pidió
T5 de `02-backlog.md`:
- Que RRHH gestione las salas (crear, editar, activar y desactivar) y pueda cancelar cualquier reserva.
- Cerrar la carrera "desactivar sala" vs "crear reserva" con el bloqueo de fila del §8.1.
- Dejar el README describiendo exactamente lo construido.

El responsable pidió expresamente que la verificación final revisara el README contra lo que hace la app de verdad.

## Qué hizo el agente
**API**
- `api/migrations/002_rooms_name_ci.sql` (nuevo): índice único sobre `lower(name)` (D-49). El `001` sigue literal.
- `api/src/routes/rooms.js`:
  - `POST /api/rooms` y `PATCH /api/rooms/:id`, solo admin.
  - Validación D-48 y orden de errores D-50.
  - `PATCH` en una transacción con `SELECT … FOR UPDATE`. Desactivar cancela en la misma transacción las reservas activas futuras y devuelve `cancelledBookings` (R12).
  - Cliente liberado con `try/finally`.
- `api/src/routes/bookings.js`: el SELECT de la sala dentro de la transacción del `POST` pasa a `… FOR SHARE` (§8.1). Sigue sin haber ninguna comprobación de solapamiento: R1 la decide la restricción.
- `api/src/errors.js`: `23505` sobre `rooms_name_key` o `rooms_name_lower_key` → 409 `ROOM_NAME_TAKEN`.
- `api/test/rooms.test.js` (ampliado) cubre:
  - 401 y 403 de employee;
  - creación con recorte de espacios y `location` vacía → `null`;
  - 12 cuerpos absurdos → 400;
  - nombre repetido con otras mayúsculas o espacios → 409;
  - orden de errores del `PATCH`;
  - edición;
  - desactivar cancela 2 futuras pero no la pasada, con `cancelled_by` = admin, y después la sala da 422 al reservar;
  - reactivar no recupera las canceladas.
- `api/test/room-lock.test.js` (nuevo): los 3 escenarios del §8.1. La espera se detecta con `pg_stat_activity` (`wait_event_type = 'Lock'`, máx. 5 s), sin esperas fijas. El estrés se repite 3 veces y además comprueba que `cancelledBookings` = número de 201.

**Web**
- `web/src/pages/AdminSalas.jsx` (nuevo) incluye:
  - la tabla con las inactivas;
  - un único formulario para crear y editar (D-51);
  - Activar/Desactivar con confirmación y número de canceladas (D-52, D-53).
- `web/src/App.jsx`: ruta `/admin/salas` con el guardián `RequireAdmin`, que redirige al employee a `/agenda`.
- `web/src/components/Header.jsx`: `nav-salas` solo para admin.
- `web/src/pages/Agenda.jsx`: el admin ve "Cancelar" en cualquier reserva (R9).
- `web/src/styles.css`: estilos de la pantalla de salas.

**E2E**
- `e2e/tests/admin.spec.js` (nuevo), con 4 tests:
  - escenario del §10.1 (crear → tabla y agenda → desactivar con una reserva de Luis dentro → "Reservas canceladas: 1." → desaparece de la agenda);
  - nombre repetido en mayúsculas;
  - editar;
  - Luis sin `nav-salas` y redirigido;
  - RRHH cancela desde la agenda una reserva de Luis.
- `e2e/playwright.config.js`: `workers: 1` (D-54).

**Documentación**
- Spec: §4 R13, §5.2, §6.1 (nota sobre la 002), §7 (mensajes y validación de salas) y §9.
- Backlog T5 (alcance: migración 002 y `workers: 1`).
- README (ver "Revisión del README").

## Decisiones tomadas durante la tarea
- **D-48:** validación de salas y mensaje "Datos de la sala no válidos." (límites iguales a los `CHECK` de la BD; `location` ≤ 60).
- **D-49:** nombre único sin distinguir mayúsculas, garantizado en la BD con `002_rooms_name_ci.sql`. Mensaje "Ya existe una sala con ese nombre.".
- **D-50:** orden de errores de salas: 401 → 403 → 404 id → 400 → 404 sala → 409.
- **D-51:** editar reutiliza el formulario de crear, sin `data-testid` nuevos.
- **D-52:** se confirma antes de desactivar y se da el número de canceladas después, sin una consulta previa para contar.
- **D-53:** reactivar solo cambia `is_active`; las reservas canceladas no vuelven.
- **D-54:** `workers: 1` en Playwright, porque `admin.spec` y `empleado.spec` usan a Luis.

## Verificación
| Criterio de aceptación | Comando / evidencia | Resultado |
|---|---|---|
| 1. Escenario `admin.spec.js` del §10.1 | `docker compose --profile e2e run --rm --build e2e` | ✅ 9 passed (4 admin + 4 empleado + smoke), 4 ejecuciones seguidas, la última tras `down -v` |
| 2. `rooms.test.js` y sin regresiones (API + e2e) | `docker compose exec api npm test` | ✅ 59/59 (47 anteriores + 7 de salas + 5 de bloqueo) |
| 3. `room-lock.test.js`: desactivar primero → 422 sin reserva; reservar primero → `cancelledBookings ≥ 1` y la reserva queda `cancelled`; estrés → 0 activas futuras en salas inactivas; `npm test` ×3 | `npm test` tres veces seguidas tras `down -v` + `up --build` | ✅ 59/59 las tres veces |
| 3b. Control: los tests detectan la falta del bloqueo | Se quitó a mano `FOR SHARE` dentro del contenedor y se ejecutó `node --test test/room-lock.test.js` | ✅ Fallan "desactivar primero" y los 3 de estrés. "Reservar primero" pasa, como se esperaba: el `FOR SHARE` lo toma el cliente del test. El contenedor se recreó desde la imagen después |
| 4. Clon limpio: `healthy` y la demo funciona | `git clone` del commit de T5 al scratchpad + `docker compose up -d --build` | ✅ ver "Prueba de clon limpio" |
| DoD: `down -v` + `up --build` sano | `docker compose ps` | ✅ db, api y web `healthy`; `schema_migrations` = `001_init.sql`, `002_rooms_name_ci.sql`; `\d rooms` muestra `rooms_name_lower_key` |
| Contratos a mano | `curl` por nginx | ✅ "sala 1" → 409 `ROOM_NAME_TAKEN`; capacidad 0 → 400 "Datos de la sala no válidos."; Luis `POST /rooms` → 403; `PATCH /rooms/999` → 404 |

Salida relevante:
```
# tests 59 # pass 59 # fail 0     (×3)
9 passed (8.1s)
control sin FOR SHARE: # pass 1 # fail 4
```

Capturas revisadas:
- `admin-1-sala-creada.png`: mensaje "Sala «…» creada.", fila nueva activa, tabla con inactivas en gris.
- `admin-2-agenda-con-sala.png`: columna nueva en la agenda; el nombre largo se parte en dos líneas sin solaparse.
- `admin-3-sala-desactivada.png`: "Sala desactivada. Reservas canceladas: 1.", la fila pasa a "Inactiva" y el botón a "Activar".
- `admin-4-agenda-sin-sala.png`: la agenda vuelve a 5 columnas y solo queda la demo.
- `admin-5-editando.png`: el formulario dice "Editar sala", con "Guardar" y "Cancelar edición", y los datos cargados.
- `admin-6-luis-sin-salas.png`: la cabecera de Luis no tiene "Salas" y la URL es `/agenda`.
- `admin-7-cancelar-ajena.png`: RRHH ve "Cancelar" en "Reserva de Luis".
- `admin-8-ajena-cancelada.png`: el bloque desaparece. La celda azul clara es el `hover` del ratón.
- Las capturas `empleado-*` y `smoke` siguen como en T4.

## Revisión del README contra la app real
Se comprobó cada afirmación del README ejecutándola:

| Afirmación | Cómo se comprobó | Resultado |
|---|---|---|
| `docker compose up` (sin `-d`) deja todo en `http://localhost:8080` | Ejecutado tal cual, en primer plano | ✅ 3 servicios `healthy`, `/` 200, `/api/health` ok, `e2e` no arranca |
| `down -v && up` empieza de cero | Ejecutado | ✅ |
| 4 usuarios y contraseñas | Login real de cada uno | ✅ roles y nombres correctos |
| "Probar el choque en 30 segundos" | API y recorrido con Playwright siguiendo el texto, solo con textos visibles | ⚠️→✅ El paso "intenta reservar Sala 1 de 10:00 a 11:00" no se podía seguir tal cual: la celda de las 10:00 está tapada por el bloque de Ana. **Corregido:** pulsar una celda libre (09:00) y cambiar inicio y fin en el formulario. Con el texto nuevo: 10:00–11:00 y 10:30–11:30 dan el mensaje exacto; 11:00–12:00 se crea |
| Requisito "Compose v2" | `docker compose version` → v5.3.1 | Corregido a "v2 o superior (`docker compose`)" |
| Imagen de Playwright "~2 GB" | `docker image ls` → 3,67 GB | Corregido a "unos 3,7 GB en disco" |
| Comandos de "Cómo probar" | Ejecutados | ✅ |
| "Los tests de API usan `reservas_test` y no tocan la demo" | Conteo de salas, reservas y usuarios en `reservas` antes y después de `npm test` (7/6/4 → 7/6/4) | ✅. Se añadió `reservas_test_control` |
| Bloqueo de fila al desactivar | `room-lock.test.js` | ✅ (ya es cierto) |
| (faltaba) El e2e modifica la demo | Lista de salas tras el e2e: `Sala E2E …` y `Sala Edit …` inactivas; las futuras de Luis se cancelan | **Añadido** el aviso y cómo volver a los datos iniciales |
| (faltaba) Administración de salas | Recorrido con Playwright siguiendo el texto: crear, nombre en minúsculas rechazado, desactivar, activar y empleado sin acceso | **Añadida** la sección "Administrar salas (RRHH)" |
| Tabla de documentación | Existe cada ruta | ✅. `docs/reconstruccion/` "vacío" → "solo contiene su `README.md`" |
| Instrucción de reconstrucción | Comparada con `CLAUDE.md` | ✅ coincide (modo, carpeta, registro intacto) |

El script del recorrido del README se ejecutó desde el scratchpad, montado en el contenedor `e2e`, y no forma parte del repo. Resultado: `2 passed`.

## Prueba de clon limpio
Sobre el commit de T5 (`git clone` del repositorio local a una carpeta temporal, sin `.env` ni pasos manuales). Antes se paró el stack principal para liberar el puerto 8080.
- `docker compose up -d --build` → `clon-limpio-db/api/web` `healthy`; `/api/health` → `{"status":"ok","db":"ok"}`.
- Seed: 4 usuarios, 5 salas y 1 reserva; migraciones `001_init.sql` y `002_rooms_name_ci.sql`.
- `npm test` → 59/59. e2e → `9 passed`, 17 capturas. En `empleado-2-choque.png` del clon se ve el mensaje de choque sobre la demo de Ana.
- Después: `down -v --rmi local` del clon, carpeta borrada y stack principal levantado de nuevo (`healthy`).

## Problemas y correcciones
- **Fallo del e2e en la primera ejecución:** `admin.spec` esperaba `slot-1-10:00` como referencia de "agenda cargada", pero en esa celda está la demo de Ana y no se dibuja. La captura de fallo confirmó que la app iba bien (la sala ya no salía). Se usó `slot-1-08:00`.
- **Línea de la tabla cortada** en la columna de botones (vista en `admin-1`/`admin-3`): el `display: flex` sobre el `<td>` lo sacaba del modelo de tabla. Los botones van ahora en un `div` interno. Se repitió el e2e y se revisaron las capturas.
- **Paralelo en e2e:** `admin.spec` y `empleado.spec` usan a Luis. Se consultó al responsable y se fijó `workers: 1` (D-54).
- **Selector del botón "Editar":** no tiene `data-testid` en el §9.1, y D-51 no añade ninguno. El test lo busca por su texto ("Editar") solo dentro de `room-row-{id}`.
- **Pendiente, no bloqueante:** las capturas `fullPage` con modal muestran la cabecera de la rejilla a media página. Es el mismo efecto ya anotado en T4 (cabecera `sticky` con la página desplazada); en el navegador se ve bien.

## DoD
- [x] Criterios de aceptación cumplidos (el 4 en "Prueba de clon limpio")
- [x] `down -v` + `up --build` sano
- [x] Sin regresiones
- [x] Bitácora actualizada
- [x] Decisiones registradas (D-48 a D-54, escritas antes del código)
- [x] Commit local: `T5: administración de salas (RRHH), bloqueo FOR SHARE/FOR UPDATE sala-reserva y cancelación por admin`
