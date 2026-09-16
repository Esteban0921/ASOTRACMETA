# scripts/

| Script               | Estado    | Uso                                                                 |
| -------------------- | --------- | ------------------------------------------------------------------- |
| `migrate-db.ts`      | hecho     | `pnpm db:migrate` — aplica `infra/postgres/migrations` (TASK-0011)  |
| `migrate-xlsx.ts`    | pendiente | Migración controlada del Excel legado (TASK-0021, spec §13)         |
| `anonymize-staging.ts` | pendiente | Copia anonimizada para staging (TASK-0022, spec §15)              |

Regla: todo script es repetible y produce un informe de excepciones; nunca importa contraseñas (spec §13.1.7).
