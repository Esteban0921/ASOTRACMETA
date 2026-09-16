# ASOTRACMET — Sistema de enturnamiento y operación gremial

Reemplaza el libro `control de enturnamiento.xlsx` por un sistema de **cola gremial + bitácora de
viajes + recaudo + habilitación HSEQ** con roles. El motor de cola decide quién sigue; nadie edita
celdas.

- Especificación: [ASOTRACMET-enturnamiento-especificacion.md](ASOTRACMET-enturnamiento-especificacion.md)
- Arquitectura: [ARCHITECTURE.md](ARCHITECTURE.md)
- Backlog (`TASK-XXXX`): [ISSUES.md](ISSUES.md)
- Reglas de trabajo (`RULE-NNN`): [AGENTS.md](AGENTS.md)

## Requisitos

Node 24+, pnpm 9 (`corepack enable`). Docker solo para Postgres/Redis (`infra/compose.yaml`); la API
corre hoy con un almacén en memoria y no lo necesita.

## Comandos

| Comando              | Qué hace                                                            |
| -------------------- | ------------------------------------------------------------------- |
| `pnpm install`       | instala el monorepo                                                 |
| `pnpm dev`           | API en `http://127.0.0.1:3001` y web en `http://localhost:5173`     |
| `pnpm check`         | lint + formato + tipos + tests unitarios                            |
| `pnpm test`          | tests unitarios e integración (Vitest, proyectos)                   |
| `pnpm test:e2e`      | Playwright (levanta API en modo e2e y web)                          |
| `pnpm test:db`       | migraciones + RLS contra `DATABASE_URL`                             |
| `pnpm db:migrate`    | aplica `infra/postgres/migrations`                                  |
| `pnpm lint:fix` / `pnpm format` | corrige lint y formato                                   |

Usuarios de desarrollo (seed, contraseña `Asotracmet2026!`): `ops@asotracmet.test` (sala de turnos),
`member.fst189@asotracmet.test` (Mi turno, placas FST189 y TKM221), `member.swi750@asotracmet.test`,
`viewer@asotracmet.test`, `superadmin@asotracmet.test`, `hseq@…`, `finance@…`.

## Estructura

```text
apps/api        Fastify · /api/v1 · auth · RBAC · seed
apps/web        React PWA · /login /ops /me
packages/shared estados, roles, códigos de error, parámetros, Zod
packages/domain motor de cola, invariantes, puertos, almacén en memoria
infra/postgres  migraciones SQL, runner, tests db
e2e             Playwright
```

## Flujo que no puede mentir

`login ops → Ofrecer cupo → login member → Aceptar → aparece TR-41947`. Está cubierto por tests
unitarios del motor, de la API y por e2e. Si ese loop falla, nada más importa.
