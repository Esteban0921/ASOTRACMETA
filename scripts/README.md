# scripts/

| Script               | Estado    | Uso                                                                 |
| -------------------- | --------- | ------------------------------------------------------------------- |
| `migrate-db.ts`      | hecho     | `pnpm db:migrate` — aplica `infra/postgres/migrations` (TASK-0011)  |
| `migrate-xlsx.ts`    | hecho     | `pnpm db:migrate-xlsx` — Excel legado → Postgres + informe (TASK-0025, spec §13, `docs/migracion-excel.md`) |
| `anonymize-staging.ts` | hecho     | `pnpm db:anonymize-staging --confirmo <base>` — deja una copia sin PII ni secretos (TASK-0035, spec §15) |
| `backup-db.sh`       | hecho     | Backup cifrado (pg_dump → gzip → AES-256) del Postgres de producción (TASK-0032) |
| `restore-db.sh`      | hecho     | Restaura un backup en una base nueva y cuenta filas (simulacro §20.8, TASK-0032) |

Regla: todo script es repetible y produce un informe de excepciones; nunca importa contraseñas (spec §13.1.7).
