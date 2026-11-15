---
name: verificar-ui
description: Verifica la interfaz web de reservas de salas ejecutando Playwright dentro de Docker (servicio e2e del compose) y revisando las capturas. Usar al cerrar tareas que tocan la UI (T1, T4, T5), cuando se pida "verifica la interfaz", "corre los e2e" o "revisa la UI".
---

# Verificar la interfaz con Playwright en Docker

Playwright corre en el contenedor `e2e` (imagen `mcr.microsoft.com/playwright:v1.65.1-noble`), en la misma red que `web`, contra `http://web`. No instales Playwright ni navegadores en la máquina anfitriona.

## Pasos

1. **Levantar el sistema sano**
   ```bash
   docker compose up -d --build
   docker compose ps
   ```
   `db`, `api` y `web` deben estar `healthy`. Si no lo están, revisa `docker compose logs api web` y arregla eso antes de seguir: un e2e contra un sistema roto no aporta nada.

2. **Limpiar resultados anteriores**
   ```bash
   rm -rf e2e/results/*
   ```

3. **Ejecutar los tests**
   - Suite completa: `docker compose --profile e2e run --rm --build e2e`
   - Un archivo: `docker compose --profile e2e run --rm --build e2e npx playwright test tests/empleado.spec.js`

4. **Mirar las capturas** de `e2e/results/*.png` con la herramienta Read (es obligatorio, no basta con el "passed"). Revisa:
   - Que muestran lo que el escenario promete (p. ej. el mensaje de choque, el bloque de la reserva).
   - Que la pantalla es legible: nada superpuesto, textos no cortados, la rejilla de la agenda alineada.
   - Si falla un test, abre las capturas de fallo en `e2e/results/test-results/`.

5. **Registrar** en el archivo de la tarea, sección "Verificación" (modo Desarrollo: `docs/tareas/TX-*.md`; modo Reconstrucción: `docs/reconstruccion/TX.md`):
   - Comando ejecutado y salida resumida (`N passed` / fallos).
   - Lista de capturas revisadas y qué se observó en cada una.
   - Problemas visuales encontrados y si se corrigieron.

## Reglas para escribir tests e2e

- Selecciona **solo** por `data-testid` (spec §9.1); nada de selectores CSS o textos frágiles, salvo para comprobar mensajes exactos del spec.
- Cada test debe poder repetirse: antes de empezar, cancela vía API (`request` de Playwright contra `/api`) las reservas futuras de los usuarios que usa, sin tocar la reserva demo de Ana.
- Calcula fechas relativas a hoy (próximo día hábil en `America/Tegucigalpa`), nunca fijas.
- Guarda capturas con nombre descriptivo: `await page.screenshot({ path: 'results/<archivo>-<paso>.png', fullPage: true })`.
