# T3 · API de reservas con garantía anti-choque y test de concurrencia

- **Sesión:** S3 · **Fecha:** 2026-11-15 · **Inicio–fin:** ~17:35–17:48
- **Agente:** Claude Code (Opus 5.5)
- **Sesión exportada:** `docs/sesiones/S3-t3-reservas.txt`

## Qué se pidió
T3 de `02-backlog.md`: reservar, consultar y cancelar por API cumpliendo R1–R13 (las que tocan a reservas), con la prueba de que la concurrencia no produce choques (spec §4, §6.1, §7, §8, §10).

## Qué hizo el agente
- `api/src/time.js`: `utcToLocal`, `isValidDate`, `isValidTime` y `validateSlot` (R2 → R3 → R4 → R5 → R6 en hora local; devuelve el intervalo en UTC).
- `api/src/errors.js`: `23P01` + `bookings_no_overlap` → 409 `BOOKING_CONFLICT`. Es el único sitio que produce ese código.
- `api/src/routes/rooms.js`: `GET /api/rooms` (`includeInactive=true` solo para admin).
- `api/src/routes/bookings.js`: `GET ?date`, `GET /mine`, `POST` (transacción `BEGIN` → `SELECT` de la sala → reglas → `INSERT` → `COMMIT` con un cliente del pool; sin `FOR SHARE`, que llega en T5) y `DELETE /:id` (404 → 403 → 409; la condición de R10 va dentro del propio `UPDATE`).
- `api/src/app.js`: monta las rutas nuevas.
- Tests: `bookings.test.js` (22), `rooms.test.js` (3), `concurrency.test.js` (3), `concurrency-control.test.js` (1). `helpers.js` gana `loginAs` y `dates()` (fechas relativas a hoy).
- Docs: D-36 a D-41; spec §7 (mensajes), §5.2 y §8 (control negativo).

**Por qué el 409 lo produce la BD y no otra cosa:** el `POST` no lee `bookings` antes del `INSERT` (comprobado con `grep`: el único `SELECT` previo es el de `rooms`). El único camino al 409 es la traducción del `23P01`, y cualquier otro error saldría como 500. El resultado se cuenta en la BD (`count = 1`, self-join con 0 pares solapados). El control negativo, sin la restricción, deja entrar las 20 reservas.

## Decisiones tomadas durante la tarea
- D-36: mensajes de `INVALID_SLOT`, `OUTSIDE_BUSINESS_HOURS`, `IN_PAST`, `TOO_FAR_AHEAD`, `ROOM_INACTIVE`, `BOOKING_NOT_CANCELLABLE` y `VALIDATION_ERROR` de reservas.
- D-37: R6 permite hasta hoy + 30 días, inclusive.
- D-38: qué es formato inválido (400); el título se guarda recortado; fin ≤ inicio → `INVALID_SLOT`.
- D-39: orden de errores en `DELETE`: 404 → 403 → 409.
- D-40: R7 y R10 se preparan en los tests con SQL directo.
- D-41: test de control negativo en su propio archivo.
- D-42: el control negativo usa su propia base `reservas_test_control` (ajuste pedido por el responsable tras cerrar la tarea).

## Verificación
| Criterio de aceptación | Comando / evidencia | Resultado |
|---|---|---|
| 1. Reservas seguidas 10–11 y 11–12 → 201 | test `R1 · reservas seguidas`; `curl` 11:00–12:00 en Sala 1 → 201 | ✅ |
| 2. Solapada → 409; otra sala → 201 | test `R1 · solapada`; `curl` como Luis contra la demo → 409 `BOOKING_CONFLICT` | ✅ |
| 3. Tras cancelar se puede volver a reservar | test `R11` | ✅ |
| 4. Concurrencia: 1×201 + 19×409; escalonado sin pares solapados | `concurrency.test.js` (conteo y self-join en BD) + control negativo (sin restricción, 20×201) | ✅ |
| 5. Empleado no cancela una reserva ajena (403); admin sí (200) | test `R9`; `curl` de Luis sobre la demo → 403 | ✅ |
| 6. `npm test` pasa 3 veces seguidas | `docker compose exec api npm test` ×3 | ✅ 40/40 en las 3 |
| DoD: `down -v` + `up -d --build` sano | `docker compose ps` | ✅ db/api/web healthy |
| Sin regresiones | auth/health en la suite; `docker compose --profile e2e run --rm --build e2e` | ✅ `1 passed` |

Salida relevante:
```
=== corrida 1/2/3
ok 33 - sin la restricción, 20 reservas idénticas simultáneas → las 20 entran (201)
ok 34 - la restricción bookings_no_overlap existe en la BD de test
ok 35 - 20 reservas idénticas simultáneas → exactamente 1×201 y 19×409 BOOKING_CONFLICT
ok 36 - 20 reservas escalonadas (15 min, 60 min de duración) simultáneas → ningún par solapado en BD
# tests 40
# pass 40
# fail 0

curl (Luis, vía nginx :8080, fecha 2026-11-16):
Sala 1 10:00–11:00 → 409 {"error":{"code":"BOOKING_CONFLICT","message":"La sala ya está reservada en ese horario."}}
Sala 1 11:00–12:00 → 201 · DELETE /bookings/1 (demo de Ana) → 403 · DELETE de la suya → 200 status "cancelled"
```

Capturas revisadas: no aplica (T3 no toca la UI, D-16).

## Problemas y correcciones
- El primer `curl` de la agenda falló porque zsh interpretó el `?` de la URL como un comodín. Se repitió con la URL entre comillas: 200, solo con la demo. No era un fallo de la API.

## Ajuste posterior: aislamiento del control negativo (D-42)
- **Duda del responsable:** el control quita la restricción; ¿afecta a otras pruebas si corren a la vez?
- **Comprobación previa:** con `npm test` (en serie) no afecta. En orden directo e invertido todo pasa y `reservas` conserva la restricción. Pero forzando `--test-concurrency=2`, el control y la concurrencia chocaban al recrear `reservas_test` (`duplicate key ... pg_database_datname_index`).
- **Cambio:** `setupTestDb(dbName)` acepta el nombre de la base (solo `reservas_test` o `reservas_test_<sufijo>`, y falla si `src/db` ya estaba cargado). El control usa `reservas_test_control` y comprueba `current_database()`. Spec §8 y §10 actualizados.
- **Verificación:**

| Comprobación | Resultado |
|---|---|
| `node --test --test-concurrency=2 test/concurrency-control.test.js test/concurrency.test.js` ×3 | ✅ 4/4 en las 3 |
| Restricción por base tras las pruebas | `reservas` 1 · `reservas_test` 1 · `reservas_test_control` 0 |
| `npm test` ×3 | ✅ 40/40 en las 3 |
| Smoke e2e | ✅ `1 passed` |
| Suite completa forzada con `--test-concurrency=4` | ❌ esperado: auth, bookings, rooms, health y concurrency comparten `reservas_test`; por eso `npm test` las ejecuta en serie (D-34). Queda fuera del alcance de D-42 |

## DoD
- [x] Criterios de aceptación cumplidos
- [x] `down -v` + `up --build` sano
- [x] Sin regresiones
- [x] Bitácora actualizada
- [x] Decisiones registradas
- [x] Commit local: ver `git log` (`T3: ...`)
