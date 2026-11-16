# 04 · Cierre

> Sesión S6 · 2026-11-15 · Claude Code (Opus 5.5). La evidencia corresponde a la versión final (`2d3d16a`).

## DoD de la prueba

| Requisito | Estado | Evidencia |
|---|---|---|
| `docker compose up` levanta base de datos, API y frontend desde un repositorio recién clonado, sin pasos manuales | ☑ | Prueba de clon limpio en S6 sobre `2d3d16a` (ver abajo): `git clone` a una carpeta temporal y `docker compose up -d --build`, sin `.env` ni pasos manuales → `db`, `api` y `web` `healthy`. Resultados: `/api/health` → `{"status":"ok","db":"ok"}`; `/` → 200; seed 4 usuarios / 5 salas / 1 reserva; migraciones `001_init.sql` y `002_rooms_name_ci.sql`; restricción `bookings_no_overlap` presente; `npm test` 59/59; e2e `9 passed`. Antes se había hecho la misma prueba sobre T5 (`docs/tareas/T5-admin-salas.md`, "Prueba de clon limpio") |
| Cada tarea del backlog tiene su documentación en `/docs/tareas` | ☑ | `T1-esqueleto.md`, `T2-bd-auth.md`, `T3-reservas.md`, `T4-interfaz-empleado.md` y `T5-admin-salas.md`, todos con la plantilla `_plantilla.md` y cada uno con su commit `TX:` (`6ffe8b1`, `68b7bbd`, `4eb59fd`+`0898405`, `08f528c`, `8cb4b1b`). Además, la conversación de cada sesión (S0–S5) está exportada en `docs/sesiones/` y la bitácora registra cada paso con hora (`docs/03-bitacora.md`) |
| El README explica cómo levantar el proyecto | ☑ | `README.md` → "Requisitos", "Cómo levantar" (`docker compose up` → http://localhost:8080), "Usuarios de prueba", "Probar el choque", "Administrar salas (RRHH)" y "Cómo probar". En T5 se revisó frase por frase contra la app real y se corrigieron 7 diferencias (`docs/tareas/T5-admin-salas.md`, "Revisión del README contra la app real"). En S6 se volvió a seguir "Cómo levantar" en el clon limpio |

### Prueba de clon limpio (S6, versión final)

```
git clone . <scratchpad>/clon-limpio            # HEAD 2d3d16a
docker compose up -d --build
  clon-limpio-db-1   Up (healthy)
  clon-limpio-api-1  Up (healthy)
  clon-limpio-web-1  Up (healthy)
curl /api/health  → {"status":"ok","db":"ok"}     curl /  → 200
psql reservas     → 4|5|1|001_init.sql,002_rooms_name_ci.sql|1   (usuarios|salas|reservas|migraciones|bookings_no_overlap)
docker compose exec api npm test                    → # tests 59 # pass 59 # fail 0
docker compose --profile e2e run --rm --build e2e  → 9 passed (12.7s), 17 capturas
```

Capturas del clon que se revisaron:
- `empleado-2-choque.png`: Luis intenta reservar Sala 1 de 10:00 a 11:00 sobre la demo de Ana y ve "Esa sala ya está reservada en ese horario. Elige otro.".
- `empleado-7-no-habil.png`: un sábado muestra "Solo se puede reservar de lunes a viernes." y la rejilla deshabilitada.
- `admin-3-sala-desactivada.png`: "Sala desactivada. Reservas canceladas: 1." y la sala en "Inactiva".

Después se desmontó el clon (`down -v --rmi local`), se borró la carpeta y se volvió a levantar el stack principal (`healthy`).

## Qué quedó

- **Las 13 reglas de negocio del spec (R1–R13)**, cada una con su prueba automática.
- **La garantía anti-choque vive en PostgreSQL:** `EXCLUDE USING gist … bookings_no_overlap`, con el SQL literal del §6.1. La API no consulta disponibilidad antes de insertar; el 409 sale de traducir el `23P01`.
  - Tests de concurrencia: 20 peticiones simultáneas → 1×201 y 19×409.
  - Control negativo: sin la restricción el test falla. Corre en su propia BD, `reservas_test_control` (D-42).
- **Carrera "desactivar sala" vs "reservar" cerrada:** `FOR SHARE` al reservar y `FOR UPDATE` al modificar la sala (§8.1). La cubre `room-lock.test.js`, con un control sin `FOR SHARE` que hace fallar 4 de 5 tests.
- **Interfaz de empleado:** login, agenda por día con rejilla de 30 min, reservar en modal, mis reservas, cancelar con confirmación y avisos de día no reservable.
- **Interfaz de RRHH:** crear, editar, activar y desactivar salas, y cancelar cualquier reserva.
- **Todo se levanta con `docker compose up`** desde un clon limpio, con migraciones, seed y la reserva de demo para probar el choque.
- **Pruebas:** 59 tests de API (`npm test`) y 9 e2e con Playwright dentro de Docker. La skill `verificar-ui` se usó en T1, T4 y T5 y se revisaron las capturas.
- **Documentación para reconstruir:**
  - spec como fuente de verdad, con contratos, mensajes y `data-testid` exactos;
  - backlog con DoR y DoD;
  - 54 decisiones con su porqué;
  - bitácora con hora;
  - un documento por tarea;
  - las conversaciones exportadas;
  - `CLAUDE.md` con los modos Desarrollo y Reconstrucción.

## Qué no quedó

- **La reconstrucción no se ha hecho:** la hará el equipo revisor. Hasta entonces, `docs/reconstruccion/` queda vacía (solo contiene su `README.md` con las instrucciones).

## Qué falló en el plan

Los tres primeros fallos son los que observó el responsable en el registro y tienen la misma causa: **eran cosas que había que decidir en S0 y se descubrieron al ejecutar.** El registro lo confirma: de las 54 decisiones, 27 se tomaron en S0 (D-01 a D-27) y las otras 27 durante la ejecución (D-28 a D-54).

1. **El README se escribió antes del código y no se comprobó hasta el final.** Se redactó en S0 y nadie lo contrastó con la app hasta T5. En esa revisión salieron **7 diferencias**:
   - el paso "Probar el choque" no se podía seguir: la celda de las 10:00 de Sala 1 está tapada por la reserva de Ana y no se puede pulsar;
   - el requisito "Compose v2";
   - el tamaño de la imagen de Playwright (decía ~2 GB y ocupa 3,7 GB);
   - faltaba `reservas_test_control`;
   - faltaba el aviso de que el e2e modifica la demo;
   - faltaba la sección de administración de salas;
   - `docs/reconstruccion/` se describía como "vacío".

   El paso que más importaba para la prueba fue precisamente el que no funcionaba.
2. **No se pensó cómo aislar las pruebas.** El aislamiento se fue resolviendo tarea a tarea, cada vez que aparecía un choque:
   - T2: los archivos de test en paralelo contra `reservas_test` (D-34, ejecución en serie);
   - T3: el control negativo chocaba con el test de concurrencia al recrear `reservas_test` (D-42, BD propia `reservas_test_control`);
   - T5: dos specs de Playwright usaban a Luis a la vez (D-54, `workers: 1`).

   Además, el e2e modifica los datos de demo, y eso solo se descubrió al revisar el README en T5.
3. **El spec no pensó los estados de la pantalla:** día pasado, día no hábil, día sin horas libres. Cuando empezó T4 no estaba definido qué ve el usuario cuando no puede reservar. Salieron 5 dudas de UI y un contrato nuevo, `GET /api/calendar`, que no estaba en el spec. Con ellos llegaron 5 decisiones (D-43 a D-47): la fecha de hoy la da la API, las celdas se deshabilitan con aviso y se añade el mensaje "Ya no quedan horas disponibles hoy.".
4. **No se comprobaron en S0 los supuestos técnicos del entorno, salvo Playwright.** Playwright en Docker sí se probó en S0 (D-15) y funcionó a la primera en T1. El resto se dio por hecho, y en la primera verificación de T1 fallaron dos cosas:
   - `node --test test/` no acepta directorios en Node 22 (D-33, glob `test/**/*.test.js`);
   - `web` quedaba `unhealthy` porque `localhost` resolvía a `::1` y nginx solo escuchaba en IPv4.
5. **Una regla de proceso se guardó fuera del repositorio.** La regla de commitear el export de la sesión anterior se guardó primero en la memoria local del agente. En S1 hubo que pasarla a `CLAUDE.md`, porque esa memoria no viaja con el repositorio y el equipo revisor no la tendría.

## Qué cambiaría si lo hiciera de nuevo

1. **Revisar el README contra la app al cerrar cada tarea con pantallas.** Al cerrar T1, T4 y T5, seguir el README tal cual, solo con textos visibles, y corregirlo en esa misma tarea. Así las diferencias no se acumulan hasta el final.
2. **Decidir en el spec desde S0 cómo se aíslan las pruebas:** qué BD usa cada tipo de test, si corren en serie o en paralelo, qué usuarios y datos usa el e2e y si puede tocar la demo.
3. **Definir en S0 qué ve el usuario cuando no puede hacer nada:** día pasado, no hábil, sin horas libres o sala inactiva. Cada estado con su mensaje y su `data-testid` en el spec, igual que los errores de la API.
4. **Probar en S0 cada pieza del entorno con un ejemplo mínimo**, como se hizo con Playwright: el comando de test con la versión de Node fijada y el healthcheck de cada servicio.
5. **Escribir en el repositorio (`CLAUDE.md`) toda regla de proceso desde S0**, nunca solo en la memoria del agente, para que la tenga cualquiera que reconstruya el proyecto.
