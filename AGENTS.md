# AGENTS.md — Reglas de trabajo en ASOTRACMET

Este archivo define cómo se trabaja en este repositorio. Aplica igual a personas y a agentes de IA
(Claude Code, Copilot, Codex, Cursor u otros). Si una regla y una instrucción puntual chocan, gana
la regla salvo que la instrucción diga explícitamente que la anula y por qué.

Documentos hermanos:

- [ASOTRACMET-enturnamiento-especificacion.md](ASOTRACMET-enturnamiento-especificacion.md) — la especificación funcional y técnica (la "spec").
- [ARCHITECTURE.md](ARCHITECTURE.md) — cómo está construido el sistema hoy y hacia dónde va.
- [ISSUES.md](ISSUES.md) — el backlog: toda unidad de trabajo es una `TASK-XXXX`.

## Arranque rápido

```bash
pnpm install                 # Node >= 24, pnpm 9 (corepack enable)
pnpm dev                     # API en :3001 (almacén en memoria + seed) y web en :5173
pnpm check                   # lint + formato + tipos + tests unitarios (obligatorio antes de cerrar una tarea)
pnpm test:e2e                # Playwright: levanta API en modo e2e y la web
pnpm test:db                 # migraciones + RLS contra DATABASE_URL (se omite si no está definida)
pnpm test:redis              # lock distribuido cola:{clase} contra REDIS_URL (se omite si no está definida)
```

Usuarios de desarrollo (contraseña `Asotracmet2026!`): `superadmin@`, `ops@`, `hseq@`, `finance@`,
`viewer@`, `member.fst189@`, `member.swi750@` (todos `@asotracmet.test`). Solo existen en el seed.

## Reglas

### A. Flujo de trabajo y tareas

**RULE-001 — Fuente de verdad y precedencia.** El orden es: (1) la spec, (2) `ARCHITECTURE.md`,
(3) `ISSUES.md`, (4) el código. Si el código contradice a la spec o a la arquitectura, no se
"arregla" la doc para que cuadre: se abre una `TASK` que decida cuál de los dos cambia y por qué.

**RULE-002 — Nada se implementa sin tarea.** Todo cambio de código, SQL, configuración o
documentación de arquitectura nace como una `TASK-XXXX` en `ISSUES.md` **antes** de escribir código.
Excepción única: correcciones tipográficas en Markdown, con commit marcado `[skip-task]`.

**RULE-003 — Formato de tarea.** Cada tarea en `ISSUES.md` tiene, en este orden:
`ID y título`, `Estado`, `Fase` (0-4 según spec §19), `Prioridad` (crítica | alta | media | baja),
`Contexto` (qué y por qué, con referencia a la sección de la spec), `Criterio de done`
(verificable, en viñetas), `Referencias` (spec, ARCHITECTURE, otras TASK) y `Evidencia`
(comando ejecutado y resultado, fecha). Plantilla al final de `ISSUES.md`.

**RULE-004 — Identificadores.** `TASK-` seguido de cuatro dígitos, secuenciales, nunca reutilizados
ni renumerados. El contador `Próximo ID` en la cabecera de `ISSUES.md` se actualiza al crear una
tarea. Una tarea descartada conserva su número.

**RULE-005 — Estados de tarea.** `pendiente` → `en_progreso` → `hecha`. Desvíos: `bloqueada`
(se indica por qué y qué la desbloquea) y `descartada` (se indica la razón). Un agente trabaja una
sola tarea `en_progreso` a la vez y la marca al empezar, no al terminar.

**RULE-006 — Cierre honesto.** Una tarea pasa a `hecha` solo cuando: todos los criterios de done se
cumplen, `pnpm check` está en verde y la `Evidencia` registra el comando y el resultado real.
Trabajo escrito pero no verificado se queda `en_progreso` con una nota que diga exactamente qué
falta verificar. Nunca se declara verde algo que no se ejecutó.

**RULE-007 — Alcance.** No se amplía ni se recorta una tarea en silencio. Lo que aparece por el
camino (bug, deuda, idea) se registra como nueva `TASK` y se enlaza desde la tarea actual.

### B. Código y dominio

**RULE-008 — Lenguaje ubicuo.** Se usan las palabras de la spec §4 en código, UI, SQL y
documentación: `asociado`, `vehiculo`, `placa`, `clase_cola`, `habilitacion`, `requerimiento`,
`cola_posicion`, `oferta`, `tr`, `viaje`, `recaudo`, `declinacion`, `cancelacion`. El dominio se
escribe en español; los identificadores impuestos por librerías quedan en inglés.

**RULE-009 — Estados cerrados.** Todo estado es un valor de las listas de
`packages/shared/src/estados.ts`. Nunca texto libre como estado. Cualquier implementación que
conserve celdas `DECLINA` como estado no es este sistema (spec, cierre).

**RULE-010 — El motor decide.** `siguienteElegible`, `ofrecer`, `aceptar`, `declinar`, `expirar`,
`cancelarTr` viven en `packages/domain`. La API orquesta y el frontend pinta. `packages/domain` no
importa HTTP, base de datos ni UI (ESLint lo bloquea con `no-restricted-imports`). Nunca se expone
un input numérico para editar `posicion`.

**RULE-011 — Transacción + auditoría.** Toda mutación de dominio se ejecuta dentro de
`UnidadDeTrabajo.ejecutar(claseCola, fn)`: lock por clase de cola, rollback si falla y evento de
`audit_log` en la misma transacción. La auditoría es append-only; no se edita ni se borra.

**RULE-012 — Reglas de negocio como datos.** Porcentajes, TTL, políticas y secuencias viven en
`parametros` (`packages/shared/src/parametros.ts` + tabla `parametros`). Un `0.03` o un `120`
suelto en el código es un bug. Cada parámetro nuevo trae default, validación Zod y test.

**RULE-013 — Errores con código estable.** Todo error de negocio es un `ErrorDominio` con un
`CodigoError` de `packages/shared/src/codigos-error.ts`. La API responde
`{ code, message, details }`; el frontend traduce en `apps/web/src/utils/formato.ts`. No se inventan
códigos en las rutas ni en la UI.

**RULE-014 — Invariantes de cola.** Posiciones `1..N` densas por clase, una placa activa en una
sola clase, cabeza elegible = menor posición que pasa filtros. Toda escritura de posiciones pasa por
`verificarInvariantesCola`. Reordenar "a mano" es una acción de dominio auditada con motivo y
re-autenticación (`cola.override`, `cola.reset`), visible para el veedor, nunca un UPDATE.

**RULE-015 — Identificadores.** IDs internos UUID v7. Códigos de negocio (`TR-41946`, placa) son
atributos únicos, no llaves primarias. El código TR lo genera la secuencia de `parametros`; si
choca, se lanza `TR_DUPLICADO` y se sigue el runbook "secuencia TR desfasada".

**RULE-016 — Puertos y adaptadores.** La persistencia implementa `Transaccion` y `UnidadDeTrabajo`
(`packages/domain/src/puertos.ts`). Cambiar de memoria a Postgres es escribir un adaptador; no se
toca el motor. Si un cambio obliga a tocar el motor y el adaptador a la vez, se discute primero en
la tarea.

### C. Calidad

**RULE-017 — Pirámide de tests.** Unit (`packages/*`, utilidades web), integración de API
(`apps/api` con `app.inject`), base de datos (`infra/postgres`: migraciones, RLS, audit append-only)
y e2e (`e2e/` con Playwright, flujos completos por rol). Los tests del motor se nombran con el caso
de la spec que cubren (§16, §20). Tocar el motor exige test unitario; tocar una ruta exige test de
API; tocar un flujo de pantalla exige e2e.

**RULE-018 — Verificación obligatoria.** Antes de marcar `hecha`: `pnpm check`. Si se tocó API o
web: además `pnpm test:e2e`. Si se tocó `infra/postgres`: además `pnpm test:db` con Postgres real
(local, `docker compose -f infra/compose.yaml up -d`, o el job `db` de CI). Se pega el resultado en
la `Evidencia`.

**RULE-019 — Lint y formato.** ESLint (flat config en `eslint.config.js`) y Prettier son
obligatorios; el hook `pre-commit` corre `lint-staged` con `--max-warnings=0`. Prohibido `any`.
Desactivar una regla requiere comentario con la razón y la `TASK` que lo justifica.

**RULE-020 — Tests deterministas.** Se usa `RelojFijo` e `IdsSecuenciales` del dominio; nada
depende de la hora real ni de `Math.random`. No hay `sleep` salvo para simular solape de
transacciones en tests de concurrencia. El seed es anonimizado y estable.

### D. Seguridad y datos

**RULE-021 — Secretos y PII.** Prohibido persistir contraseñas de terceros (GPS, portales de
clientes): no existe columna para ello y no se crea. Sin PII cruda en logs. `.env` nunca se
commitea (`.env.example` sí). Claves de cifrado y `AUTH_SECRET` vienen del entorno.

**RULE-022 — RBAC en la API y RLS en la base.** Toda ruta lleva `exigir(recurso, permiso)` y las
rutas `own` filtran por `actor.vehiculoIds`. La base aplica Row Level Security con `app.rol` y
`app.vehiculo_ids`; la API opera siempre como `asotracmet_app` (nunca como owner ni superusuario,
que se saltan RLS) y las rutas leen a través del puerto `Consultas`, nunca del almacén directamente.
Un `member` que vea datos de una placa ajena es un incidente de seguridad: se abre `TASK` con
prioridad `crítica` antes que cualquier otra cosa.

**RULE-023 — Endpoints de prueba.** `/api/v1/__e2e/*` y cualquier atajo de test se registran solo
cuando `modoE2e` está activo (`--e2e` o `ASOTRACMET_E2E=1`). Jamás en producción.

### E. Documentación, datos y Git

**RULE-024 — Arquitectura viva.** Añadir un módulo, tabla, endpoint, parámetro, job o dependencia
de infraestructura obliga a actualizar `ARCHITECTURE.md` en la misma tarea. Una decisión con
alternativas descartadas se documenta en `docs/adr/NNNN-titulo.md`.

**RULE-025 — Migraciones append-only.** `infra/postgres/migrations/NNNN_nombre.sql`, numeradas y
ordenadas. Una migración aplicada no se edita: se escribe otra. El runner (`pnpm db:migrate`)
aplica cada archivo en su propia transacción y registra `schema_migrations`.

**RULE-026 — Commits y ramas.** Conventional Commits (`feat`, `fix`, `test`, `docs`, `chore`,
`refactor`) con ámbito (`domain`, `api`, `web`, `shared`, `infra`, `docs`) y referencia a la tarea:
`feat(domain): política penaliza_n (TASK-0006)`. El hook `commit-msg` rechaza commits sin
`TASK-XXXX` ni `[skip-task]`. Ramas `task/TASK-0007-cancelar-tr`. La rama principal es `main`.

**RULE-027 — Idioma.** Documentación, tareas, mensajes de UI y dominio en español. Los comentarios
de código explican el porqué y citan la sección de la spec cuando aplica.

**RULE-028 — Protocolo del agente.** Antes de tocar código: leer este archivo, la `TASK` objetivo
en `ISSUES.md` y la sección pertinente de `ARCHITECTURE.md`. Durante: marcar la tarea
`en_progreso`, no ampliar alcance (RULE-007). Al terminar: ejecutar las verificaciones de RULE-018,
pegar la salida real en `Evidencia`, actualizar `ARCHITECTURE.md` si aplica (RULE-024) y marcar
`hecha` (RULE-006). Un agente que no pueda ejecutar una verificación lo dice y deja la tarea
`en_progreso`.

## Plantilla de tarea

```markdown
### TASK-0042 — Título corto en imperativo

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Qué se necesita y por qué. Referencia a spec §x.y.
- **Criterio de done:**
  - [ ] Condición verificable 1
  - [ ] Test que lo cubre
  - [ ] ARCHITECTURE.md actualizado (si aplica)
- **Referencias:** spec §7.5, ARCHITECTURE §6, TASK-0007
- **Evidencia:** _(comando + resultado + fecha al cerrar)_
```

## Checklist de cierre

1. `pnpm check` en verde (y `pnpm test:e2e` / `pnpm test:db` según RULE-018).
2. Criterios de done marcados y `Evidencia` con salida real.
3. `ARCHITECTURE.md` y `docs/adr/` al día si cambió estructura, contratos o decisiones.
4. Nuevas tareas descubiertas registradas en `ISSUES.md` con ID nuevo.
5. Commit(s) con referencia `TASK-XXXX`.
