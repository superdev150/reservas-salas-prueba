# T1 · Esqueleto: Docker Compose, API health, web y e2e smoke

- **Sesión:** S1 · **Fecha:** 2026-11-15 · **Inicio–fin:** ~17:05–17:21
- **Agente:** Claude Code + Opus 5.5
- **Sesión exportada:** `docs/sesiones/S1-t1-esqueleto.txt`

## Qué se pidió
T1 de `02-backlog.md`: que `docker compose up` desde un clon limpio levante db, api y web; que la web muestre el estado de la API; y dejar Playwright funcionando en Docker con un smoke test.

Antes de empezar, el responsable pidió dos cosas. (1) Al iniciar cada sesión, el export de la sesión anterior se mueve a `docs/sesiones/` y se commitea; la regla queda en `CLAUDE.md` para que no dependa de la memoria local del agente. (2) Crear `.dockerignore` y añadirlo al spec.

## Qué hizo el agente
- Commit del export de S0 (`fee0cf4`).
- `CLAUDE.md`: paso 0 del modo Desarrollo (guardar el export de la sesión anterior).
- Docs: D-28 a D-33 en `00-decisiones.md`; `.dockerignore` en spec §5.2; backlog T1 con `.dockerignore` y el script de test corregido.
- Creados:
  - `.gitignore` y `docker-compose.yml`: 4 servicios con sus healthchecks, `depends_on: service_healthy`, `e2e` con `profiles: ["e2e"]` y solo `8080:80` publicado.
  - `api/`:
    - `Dockerfile`, `.dockerignore`, `package.json` y `package-lock.json`.
    - `src/index.js` (espera a la BD, 30×1 s, y escucha), `src/app.js` y `src/db.js` (Pool `max: 10`).
    - `src/errors.js`: `AppError`, 404 `NOT_FOUND` en `/api/*`, JSON inválido → 400 `VALIDATION_ERROR` y el resto → 500 `INTERNAL_ERROR`.
    - `src/routes/health.js` (`SELECT 1` → 200 / 503) y `test/health.test.js`.
  - `web/`:
    - `Dockerfile` multi-stage (`node:22-alpine` → `nginx:1.27-alpine`), `.dockerignore`, `nginx.conf` (proxy `/api/` y fallback de SPA).
    - `package.json`, `package-lock.json`, `vite.config.js` e `index.html`.
    - `src/main.jsx`, `src/App.jsx` (`data-testid="api-status"` → `API: ok` / `API: error`) y `src/styles.css`.
  - `e2e/`:
    - `Dockerfile` (`playwright:v1.65.1-noble`), `.dockerignore`, `package.json` y `package-lock.json`.
    - `playwright.config.js` (chromium, reporter `line`, `outputDir: results/test-results`, `baseURL` desde `BASE_URL`).
    - `tests/smoke.spec.js`.
- Los `package-lock.json` se generaron con `docker run node:22-alpine npm install --package-lock-only`, sin Node ni `node_modules` en el host.

## Decisiones tomadas durante la tarea
- D-28: cada tarea instala solo las dependencias que usa (las versiones siguen siendo las del §5.1).
- D-29: en T1 el arranque solo espera a la BD y escucha; migrar y seed llegan en T2.
- D-30: en T1 el test de health usa la BD `reservas` (`SELECT 1`); `reservas_test` llega en T2.
- D-31: `.dockerignore` en `api/`, `web/` y `e2e/` (añadido al spec §5.2).
- D-32: regla del export de sesión escrita en `CLAUDE.md`.
- D-33: `npm test` = `node --test "test/**/*.test.js"` (`node --test test/` falla en Node 22).

## Verificación
Todo tras `docker compose down -v && docker compose up -d --build`.

| Criterio de aceptación | Comando / evidencia | Resultado |
|---|---|---|
| 1. db, api y web `healthy` | `docker compose ps` | ✅ los tres `(healthy)` |
| 2. Health por nginx | `curl -s http://localhost:8080/api/health` | ✅ `{"status":"ok","db":"ok"}` |
| 3. Tests de API | `docker compose exec api npm test` | ✅ 1 pass, 0 fail |
| 4. Smoke e2e + captura | `docker compose --profile e2e run --rm --build e2e` | ✅ `1 passed`, `e2e/results/smoke.png` creado |
| 5. `up` no arranca e2e | `docker compose config --services` | ✅ `db api web` |

Extra: `curl localhost:8080/x/y` → 200 (fallback de SPA); `curl localhost:8080/api/nada` → `{"error":{"code":"NOT_FOUND",...}}`.

Salida relevante:
```
ok 1 - GET /api/health responde 200 con la BD disponible
# pass 1
# fail 0
[1/1] [chromium] › tests/smoke.spec.js:3:1 › la página inicial muestra API: ok
  1 passed (799ms)
```

Capturas revisadas: `e2e/results/smoke.png`: título "Reservas de salas" y la etiqueta verde "API: ok"; legible, sin solapamientos.

## Problemas y correcciones
1. **`npm test` fallaba** con "Cannot find module '/app/test'": en Node 22, `node --test test/` no acepta un directorio. Se preguntó al responsable y eligió el glob explícito (D-33).
2. **`web` quedaba `unhealthy`**: en alpine `localhost` resuelve primero a `::1` y nginx solo escuchaba en IPv4 (`wget: Connection refused`). Se añadió `listen [::]:80;` a `nginx.conf`, así el healthcheck del spec se mantiene literal.

Sin intervenciones manuales.

## DoD
- [x] Criterios de aceptación cumplidos
- [x] `down -v` + `up --build` sano
- [x] Sin regresiones (primera tarea)
- [x] Bitácora actualizada
- [x] Decisiones registradas
- [x] Commit local: `T1: esqueleto docker compose, API health, web y e2e smoke`
