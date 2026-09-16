# ASOTRACMET — Sistema de enturnamiento y operación gremial

Reemplaza el libro `control de enturnamiento.xlsx` por un sistema de **cola gremial + bitácora de
viajes + recaudo + habilitación HSEQ** con roles. El motor de cola decide quién sigue; nadie edita
celdas.

- Especificación: [ASOTRACMET-enturnamiento-especificacion.md](ASOTRACMET-enturnamiento-especificacion.md)
- Arquitectura: [ARCHITECTURE.md](ARCHITECTURE.md)
- Backlog (`TASK-XXXX`): [ISSUES.md](ISSUES.md)
- Reglas de trabajo (`RULE-NNN`): [AGENTS.md](AGENTS.md)

## Requisitos

Node 24+, pnpm 9 (`corepack enable`). Por defecto la API corre con un almacén en memoria y no
necesita nada más. Para operar sobre Postgres: `docker compose -f infra/compose.yaml up -d`,
`pnpm db:reset` (migra y siembra) y arrancar con `PERSISTENCIA=postgres`.

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
| `pnpm db:seed`       | siembra el conjunto anonimizado en `DATABASE_URL` (idempotente)     |
| `pnpm db:reset`      | migra y siembra                                                     |
| `pnpm lint:fix` / `pnpm format` | corrige lint y formato                                   |
| `pnpm build`         | artefactos de producción sin `tsx` (API esbuild, web Vite, scripts); ver `docs/despliegue.md` |
| `pnpm db:migrate-xlsx` | carga el Excel legado en Postgres con informe de excepciones (`docs/migracion-excel.md`) |

Usuarios de desarrollo (seed). Roles internos con contraseña `Asotracmet2026!`:
`ops@asotracmet.test` (sala de turnos), `viewer@`, `superadmin@`, `finance@` y `hseq@asotracmet.test`.
Asociados sin contraseña: `member.fst189@asotracmet.test` (placas FST189 y TKM221) y
`member.swi750@asotracmet.test`.

Cómo entrar sin SMTP ni app de autenticación (spec §3.3):

- **Equipo interno, código por correo:** escribe el correo, deja la contraseña vacía y pulsa Entrar.
  El código de seis dígitos sale en el log de la API (`[mensajeria] correo -> ops@… · código 123456`).
- **Equipo interno, contraseña + segundo factor:** `hseq@` no tiene segundo factor configurado y lo
  configura en el primer acceso (muestra la clave para Google Authenticator o similar). Los demás
  usuarios internos de la semilla ya lo tienen; usa el camino del código por correo.
- **Asociados:** escribe el correo sin contraseña; el enlace de acceso sale en el log de la API.

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
