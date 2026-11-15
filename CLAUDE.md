# CLAUDE.md — Reglas para el agente

Proyecto: aplicación interna de reservas de salas de reunión (80 personas, 5 salas, RRHH administra). Node.js + React + PostgreSQL, todo con `docker compose up`.

## Lee siempre primero

1. `docs/01-spec.md`: **fuente de verdad**. No construyas nada que no esté ahí.
2. `docs/02-backlog.md`: tareas en orden, DoR y DoD.
3. `docs/00-decisiones.md`: el porqué de cada decisión. No reabras decisiones ya tomadas.

## Modos de trabajo

Hay dos modos. **Por defecto estás en modo Desarrollo.** Solo pasas a modo Reconstrucción si la instrucción que recibes dice explícitamente "modo reconstrucción".

### Modo Desarrollo (por defecto)

Trabajo normal con el responsable, una tarea por sesión.

1. **Plan corto antes de escribir código:** al empezar una tarea, presenta un plan breve (archivos que vas a crear o cambiar, pasos, cómo lo vas a verificar y dudas abiertas) y **espera el OK del responsable**. No escribas código antes de ese OK.
2. **Si el spec no resuelve algo, pregunta.** No lo decidas tú. Con la respuesta, **primero** escribe la decisión en `docs/00-decisiones.md` → "Decisiones durante la ejecución" (fecha, tarea, duda, decisión, porqué) y **después** escribe el código.
3. Al cerrar cada tarea, haz el registro obligatorio (ver abajo).

### Modo Reconstrucción (solo si la instrucción lo dice)

Lo usa el equipo revisor para reconstruir el producto desde la documentación, sin nadie a quien preguntar.

1. **No preguntes ni esperes OK.** Ejecuta T1 → T5 seguidas.
2. Si el spec no resuelve algo, **elige la opción más simple que cumpla el spec** y sigue.
3. **Escribe tus notas solo en `docs/reconstruccion/`**: un archivo por tarea (`TX.md`) con lo hecho, las decisiones que tomaste y su porqué, y la verificación con su resultado, más un `resumen.md` final. **No modifiques** `docs/00-decisiones.md`, `01-spec.md`, `02-backlog.md`, `03-bitacora.md`, `04-cierre.md`, `docs/tareas/` ni `docs/sesiones/`: son el registro original y deben quedar intactos.
4. El resto de reglas (abajo) se aplican igual.

## Reglas no negociables (ambos modos)

1. **La garantía anti-choque vive en PostgreSQL** (`EXCLUDE ... bookings_no_overlap`, spec §6.1). Nunca la sustituyas ni la "refuerces" con un SELECT previo de disponibilidad, un lock en memoria o una comprobación en el frontend. El SQL del §6.1 se copia **literal**. El único bloqueo previo permitido es el de la fila de la sala (`FOR SHARE` / `FOR UPDATE`, spec §8.1), que protege "sala activa", no el solapamiento.
2. **Una tarea a la vez, en orden** (T1 → T5). No adelantes trabajo de tareas futuras. No empieces una tarea si la anterior no cumple su DoD.
3. **Versiones exactas** del spec §5.1. No añadas dependencias que no estén listadas. En Desarrollo, pregunta; en Reconstrucción, anótalo en `docs/reconstruccion/`.
4. **Contratos exactos:** rutas, JSON, códigos de error, mensajes y `data-testid` como dice el spec. Mismo nombre, misma forma.
5. **Todo debe funcionar con `docker compose up`** desde un clon limpio, sin `.env` ni pasos manuales.
6. **Verifica antes de declarar algo hecho:** ejecuta los comandos de "Cómo se verifica" de la tarea y registra el resultado. Si algo falla, dilo; no lo maquilles.
7. **Interfaz:** en las tareas que tocan la UI (T1, T4, T5) usa la skill `.claude/skills/verificar-ui` y **mira las capturas** antes de cerrar.
8. **Git:** solo commits locales, un commit al cerrar cada tarea con el mensaje `TX: <resumen>`. **Nunca hagas `git push`** ni configures remotos salvo que el responsable lo pida explícitamente en ese momento.
9. Código e identificadores en inglés; textos de UI, errores y documentación en español.

## Registro obligatorio al cerrar cada tarea (modo Desarrollo)

1. `docs/tareas/TX-<nombre-corto>.md` con la plantilla `docs/tareas/_plantilla.md`.
2. Entrada en `docs/03-bitacora.md` con fecha y hora (`date '+%Y-%m-%d %H:%M'`). Solo se añade, nunca se reescribe.
3. Decisiones nuevas en `docs/00-decisiones.md` (ya escritas antes del código, según el punto 2 del modo Desarrollo).
4. Commit local.
5. Recordar al responsable que exporte la sesión (`/export` → `docs/sesiones/`).

## Comandos útiles

```bash
docker compose up -d --build                          # levantar
docker compose ps                                     # estado y healthchecks
docker compose logs -f api                            # logs
docker compose exec api npm test                      # tests de API (BD reservas_test)
docker compose --profile e2e run --rm --build e2e     # tests de interfaz (Playwright en Docker)
docker compose down -v                                # reiniciar desde cero (borra datos)
```

Usuarios de prueba: `rrhh@empresa.local` / `Rrhh2026!` (admin) · `ana@`, `luis@`, `maria@empresa.local` / `Empleado2026!`.
