# CLAUDE.md

Lee y aplica [AGENTS.md](AGENTS.md): ahí están las reglas `RULE-001` a `RULE-028` (tareas
`TASK-XXXX` en [ISSUES.md](ISSUES.md), verificación con `pnpm check`, arquitectura en
[ARCHITECTURE.md](ARCHITECTURE.md), spec en
[ASOTRACMET-enturnamiento-especificacion.md](ASOTRACMET-enturnamiento-especificacion.md)).

Resumen operativo:

- Toda unidad de trabajo es una `TASK` en `ISSUES.md` antes de tocar código; se marca
  `en_progreso` al empezar y `hecha` solo con `pnpm check` en verde y evidencia real.
- El motor de cola vive en `packages/domain`; la API orquesta; la web pinta. Estados cerrados,
  parámetros como datos, errores con código estable, auditoría en la misma transacción.
- Verificación: `pnpm check`; `pnpm test:e2e` si tocaste API/web; `pnpm test:db` si tocaste
  `infra/postgres`.
- Commits con referencia `TASK-XXXX` (hook `commit-msg`).
