# Reservas de salas

Aplicación interna para reservar las salas de reunión **sin choques**: es imposible que dos reservas activas de la misma sala se solapen, incluso si dos personas reservan en el mismo instante. La garantía la da PostgreSQL con una restricción de exclusión (ver `docs/01-spec.md` §8).

Stack: Node.js 22 + Express · React 19 + Vite · PostgreSQL 16 · nginx · Playwright (en Docker).

## Instrucción única para el agente

Para reconstruir el producto desde la documentación, da al agente (Claude Code o Codex), en la raíz del repositorio, esta instrucción:

```
Trabaja en modo reconstrucción. Lee CLAUDE.md y sigue sus reglas para ese modo. Ejecuta, en orden y una por una, las tareas T1 a T5 de docs/02-backlog.md conforme a docs/01-spec.md, sin pedir confirmación. No pases a la siguiente tarea sin cumplir sus criterios de aceptación. Escribe tus notas solo en docs/reconstruccion/ y haz un commit local por tarea. Al terminar, comprueba que `docker compose down -v && docker compose up -d --build` deja todo healthy y que los tests de API y de interfaz pasan, y resume el resultado en docs/reconstruccion/resumen.md.
```

En modo reconstrucción el agente no pregunta: si el spec no resuelve algo, elige lo más simple que lo cumpla y lo anota en `docs/reconstruccion/`. El registro original (`docs/00` a `04`, `docs/tareas`, `docs/sesiones`) queda intacto para poder comparar.

## Requisitos

- Docker Desktop (o Docker Engine) con Docker Compose v2.
- Puerto **8080** libre.
- Conexión a internet la primera vez (descarga de imágenes; la de Playwright pesa ~2 GB y solo se usa para las pruebas de interfaz).

## Cómo levantar

```bash
docker compose up
```

Abre **http://localhost:8080**. La base de datos, las migraciones y los datos de prueba se crean solos al arrancar.

Para empezar desde cero (borra los datos): `docker compose down -v && docker compose up`.

### Usuarios de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| RRHH (admin) | `rrhh@empresa.local` | `Rrhh2026!` |
| Empleado | `ana@empresa.local` | `Empleado2026!` |
| Empleado | `luis@empresa.local` | `Empleado2026!` |
| Empleado | `maria@empresa.local` | `Empleado2026!` |

### Probar el choque en 30 segundos

El seed deja una reserva de **Ana** en **Sala 1, el próximo día hábil, de 10:00 a 11:00**.
1. Entra como `luis@empresa.local`.
2. En la agenda elige el próximo día hábil e intenta reservar Sala 1 de 10:00 a 11:00 (o 10:30 a 11:30).
3. Verás: *"Esa sala ya está reservada en ese horario. Elige otro."* De 11:00 a 12:00 sí se puede.

## Cómo probar

Con el sistema levantado (`docker compose up -d`):

```bash
# Tests de API (reglas de negocio + concurrencia: 20 reservas simultáneas → 1 éxito, 19 conflictos)
docker compose exec api npm test

# Tests de interfaz con Playwright dentro de Docker (capturas en e2e/results/)
docker compose --profile e2e run --rm --build e2e
```

Los tests de API usan una base aparte (`reservas_test`) y no tocan los datos de la demo. También prueban que una reserva hecha mientras RRHH desactiva una sala nunca queda activa en la sala inactiva (bloqueo de fila, `docs/01-spec.md` §8.1).

## Documentación

| Archivo | Contenido |
|---|---|
| `CLAUDE.md` | Reglas que el agente lee siempre |
| `docs/00-decisiones.md` | Cada duda, qué se decidió y por qué |
| `docs/01-spec.md` | Reglas de negocio, roles, alcance, modelo de datos, API, pantallas |
| `docs/02-backlog.md` | Tareas en orden con DoR y DoD |
| `docs/03-bitacora.md` | Registro con hora de todo lo ocurrido |
| `docs/04-cierre.md` | Reporte de cierre con la DoD y evidencias |
| `docs/tareas/` | Un archivo por tarea con lo que hizo el agente |
| `docs/sesiones/` | Conversaciones exportadas del agente |
| `docs/reconstruccion/` | Notas del agente cuando reconstruye en modo reconstrucción (vacío en el desarrollo original) |
| `.claude/skills/verificar-ui/` | Skill para verificar la interfaz con Playwright en Docker |
