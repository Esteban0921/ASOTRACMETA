# ISSUES.md — Backlog de ASOTRACMET

**Próximo ID: TASK-0044** · Reglas de este archivo: RULE-002 a RULE-007 en [AGENTS.md](AGENTS.md).

Estados: `pendiente` · `en_progreso` · `bloqueada` · `hecha` · `descartada`.
Fases según spec §19: 0 (diccionario y parámetros), 1 (enturnamiento usable), 2 (viaje y plata),
3 (HSEQ bloqueante), 4 (fuera de núcleo).

## Resumen

| ID        | Título                                                        | Fase | Prioridad | Estado      |
| --------- | ------------------------------------------------------------- | ---- | --------- | ----------- |
| TASK-0001 | Bootstrap del monorepo (pnpm, TypeScript, scripts)            | 0    | alta      | hecha       |
| TASK-0002 | Lint, formato y hooks (ESLint, Prettier, Husky, lint-staged)  | 0    | alta      | hecha       |
| TASK-0003 | `packages/shared`: estados, RBAC, errores, parámetros, Zod    | 1    | alta      | hecha       |
| TASK-0004 | `packages/domain`: tipos, puertos, elegibilidad, invariantes  | 1    | alta      | hecha       |
| TASK-0005 | Motor: `siguienteElegible` + `ofrecer`                        | 1    | crítica   | hecha       |
| TASK-0006 | Motor: aceptar, declinar (políticas), anular, expirar         | 1    | crítica   | hecha       |
| TASK-0007 | Motor: cancelar TR y no tramitar                              | 1    | alta      | hecha       |
| TASK-0008 | Adaptador en memoria transaccional (lock, rollback, audit)    | 1    | alta      | hecha       |
| TASK-0009 | Tests unitarios del motor (spec §16) incl. concurrencia       | 1    | crítica   | hecha       |
| TASK-0010 | API Fastify `/api/v1`: auth dev, RBAC, errores, rutas, jobs   | 1    | alta      | hecha       |
| TASK-0011 | Seed anonimizado de septiembre 2026 (spec §22.4)              | 1    | alta      | hecha       |
| TASK-0012 | Tests de API (viewer no muta, member own, flujo, 20 paralelos)| 1    | crítica   | hecha       |
| TASK-0013 | Web: login, sala de turnos (TM-CBZ primero), Mi turno         | 1    | alta      | hecha       |
| TASK-0014 | Tests unitarios web (formato, OfertaCard)                     | 1    | media     | hecha       |
| TASK-0015 | E2E Playwright: ops ofrece → member acepta → aparece TR       | 1    | crítica   | hecha       |
| TASK-0016 | Migraciones SQL (spec §6), runner y tests db (RLS, audit)     | 1    | alta      | hecha       |
| TASK-0017 | CI GitHub Actions: check, e2e, db                             | 0    | alta      | en_progreso |
| TASK-0018 | Documentación: ARCHITECTURE, AGENTS, ISSUES, README, ADR      | 0    | alta      | hecha       |
| TASK-0019 | Adaptador Postgres de `Transaccion` / `UnidadDeTrabajo`       | 1    | crítica   | hecha       |
| TASK-0038 | Capa de consultas: la API deja de leer el estado en memoria   | 1    | crítica   | hecha       |
| TASK-0039 | Seed de Postgres y `pnpm db:seed`                             | 1    | alta      | hecha       |
| TASK-0040 | Anti-replay del código TOTP y límite de retos por usuario     | 1    | baja      | pendiente   |
| TASK-0041 | Pantalla superadmin: parámetros y auditoría filtrable         | 1    | media     | hecha         |
| TASK-0020 | Lock Redis `cola:{clase}` con reintento                       | 1    | media     | pendiente   |
| TASK-0021 | Auth producto: OTP, 2FA admin, magic link member, revocación  | 1    | alta      | hecha       |
| TASK-0022 | IAM: CRUD usuarios, roles y scope member                      | 1    | alta      | hecha       |
| TASK-0023 | Maestros: CRUD asociados, vehículos, conductores, catálogos   | 1    | alta      | hecha       |
| TASK-0024 | Reset y override de cola auditados (superadmin, 2FA)          | 1    | alta      | hecha       |
| TASK-0025 | Migración controlada desde el Excel + informe de excepciones  | 0-1  | alta      | hecha       |
| TASK-0042 | Puertos del host configurables en `infra/compose.yaml`        | 0    | media     | hecha       |
| TASK-0043 | Soportes HSEQ en object storage (subida de archivos)         | 3    | media     | pendiente   |
| TASK-0026 | Notificaciones (in-app, email, WhatsApp opt-in) con outbox    | 1-2  | media     | pendiente   |
| TASK-0027 | Viajes, tarifas, recaudo 3% y pantalla finance                | 2    | alta      | hecha         |
| TASK-0028 | HSEQ: documentos, semáforo, habilitaciones, job nocturno      | 3    | alta      | hecha         |
| TASK-0029 | Tablero viewer y métricas de equidad (`metricas_mes`)         | 2    | media     | hecha         |
| TASK-0030 | Observabilidad: OpenTelemetry, métricas, readyz, runbooks     | 1-2  | media     | hecha         |
| TASK-0031 | PWA: service worker, instalable, lectura offline              | 1    | media     | hecha         |
| TASK-0032 | Build de producción de la API, Dockerfile y despliegue        | 1    | alta      | hecha         |
| TASK-0033 | Contrato OpenAPI desde Zod y tipos compartidos con la web     | 1    | baja      | pendiente   |
| TASK-0034 | Export CSV por rol con watermark                              | 2    | baja      | hecha         |
| TASK-0035 | Staging anonimizado y simulacro de restore                    | 2    | media     | hecha         |
| TASK-0036 | Habeas data: extracto de TR por asociado                      | 2    | baja      | hecha         |
| TASK-0037 | Bug: cliente web enviaba `content-type: json` sin cuerpo      | 1    | alta      | hecha       |

## Tareas

### TASK-0001 — Bootstrap del monorepo (pnpm, TypeScript, scripts)

- **Estado:** hecha (2026-09-16)
- **Fase:** 0
- **Prioridad:** alta
- **Contexto:** Estructura de repo de spec §17 (`apps/`, `packages/`, `infra/`, `scripts/`, `docs/`) con pnpm workspaces, TypeScript estricto compartido (`tsconfig.base.json`) y scripts raíz (`dev`, `check`, `test`, `test:e2e`, `test:db`, `db:migrate`).
- **Criterio de done:**
  - [x] `pnpm install` resuelve el workspace (5 proyectos)
  - [x] `pnpm typecheck` en verde en todos los paquetes
  - [x] `.gitignore`, `.editorconfig`, `.gitattributes` (LF), `.node-version`, `.env.example`
- **Referencias:** spec §17, §18; ARCHITECTURE §3
- **Evidencia:** `pnpm install` → Done in 52.4s; `pnpm typecheck` → 4 proyectos Done (2026-09-16).

### TASK-0002 — Lint, formato y hooks

- **Estado:** hecha (2026-09-16)
- **Fase:** 0
- **Prioridad:** alta
- **Contexto:** RULE-019. ESLint 10 flat config + typescript-eslint + react-hooks + react-refresh + prettier; Prettier; Husky con `pre-commit` (lint-staged, `--max-warnings=0`) y `commit-msg` (exige `TASK-XXXX` o `[skip-task]`). Regla `no-restricted-imports` que impide a `packages/domain` importar HTTP/DB/UI.
- **Criterio de done:**
  - [x] `pnpm lint` y `pnpm format:check` en verde
  - [x] `core.hooksPath=.husky/_` configurado por `prepare`
  - [x] `commit-msg` rechaza mensajes sin tarea y acepta con tarea
- **Referencias:** AGENTS RULE-019, RULE-026
- **Evidencia:** `pnpm lint` → 0 problemas; `sh .husky/commit-msg` sin TASK → exit 1, con TASK → exit 0 (2026-09-16).

### TASK-0003 — `packages/shared`

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Lenguaje ubicuo compartido por API y web: estados cerrados (spec §4), matriz RBAC (§3.2) con `own`/`enmascarado`/`override`, `MODULO_AUDIT`, duración de sesión por rol, códigos de error con status HTTP (§8.6), parámetros con Zod y defaults (§10), normalización de placa, enmascarado PII, fechas Bogotá, esquemas de entrada de la API.
- **Criterio de done:**
  - [x] Tests: placa, RBAC (viewer no muta, member own), estados, parámetros, PII/fechas
  - [x] Sin dependencias salvo `zod`
- **Referencias:** spec §3, §4, §8.6, §10; ARCHITECTURE §5.1
- **Evidencia:** `pnpm test` proyecto `shared` → 5 archivos, 21 tests en verde (2026-09-16).

### TASK-0004 — `packages/domain`: tipos, puertos, elegibilidad, invariantes

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Tipos del dominio, puertos `Reloj`, `GeneradorIds`, `Transaccion`, `UnidadDeTrabajo`; `evaluarElegibilidad` pura con los 7 filtros de §7.2 en orden; invariantes de cola (`verificarInvariantesCola`, `renumerar`, `rotarAlFinal`, `moverACabeza`).
- **Criterio de done:**
  - [x] `invariantes.test.ts`: densidad, repetidos, otra clase, renumerar, rotar, mover a cabeza
  - [x] ESLint bloquea imports de infraestructura en `packages/domain`
- **Referencias:** spec §7.1, §7.2; ARCHITECTURE §5.2-5.4
- **Evidencia:** `pnpm test` proyecto `domain` en verde (2026-09-16).

### TASK-0005 — Motor: `siguienteElegible` + `ofrecer`

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** Spec §7.2-7.3 y §22.2. La oferta no avanza la cola. Cupos libres = `cantidad − TR vigentes − ofertas abiertas`. Penalización `penaliza_n` consumida solo cuando otra placa toma el turno; si nadie más puede, la penalizada lo recibe (la cola no se traba).
- **Criterio de done:**
  - [x] Cabeza no habilitada → toma la 2 (`SPS413` no apta HLB → `FST189`)
  - [x] Placa con oferta abierta no recibe otra; placa con TR activo no sale si `un_tr_activo_por_placa`
  - [x] Documento bloqueante vencido salta la placa según parámetro
  - [x] `COLA_VACIA` sin efectos colaterales
- **Referencias:** spec §7.2, §7.3, §16; ARCHITECTURE §5.5
- **Evidencia:** `motor-cola.test.ts` bloque `siguienteElegible` → 6 tests en verde (2026-09-16).

### TASK-0006 — Motor: aceptar, declinar, anular, expirar

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** Spec §7.4. Aceptar crea el TR con código de la secuencia, `turnosTomados++`, rota si `consume_posicion_al_aceptar` y cierra el requerimiento al completar cupos. Declinar exige motivo de catálogo activo, aplica `al_final` / `penaliza_n` / `bloqueo_horas` y reoferta al siguiente **en la misma transacción**. Anular no rota. `expirarOfertas` agrupa por clase y aplica `oferta_expirada_politica`.
- **Criterio de done:**
  - [x] Códigos TR secuenciales `TR-41947`, `TR-41948`; `TR_DUPLICADO` deja todo intacto
  - [x] Oferta vencida no se acepta (`OFERTA_EXPIRADA`)
  - [x] Member ajeno → `FORBIDDEN_OWN_SCOPE`
  - [x] Declinar sin motivo válido → `MOTIVO_REQUERIDO`; rastro con actor, timestamp y motivo
  - [x] Políticas `penaliza_n` (con fallback anti-bloqueo) y `bloqueo_horas`
  - [x] Expirar con `declina` y con `reofertar`
- **Referencias:** spec §7.4, §20.4, §20.6; ARCHITECTURE §5.5
- **Evidencia:** `motor-cola.test.ts` bloques `aceptar`, `declinar`, `anular y expirar` → 15 tests en verde (2026-09-16).

### TASK-0007 — Motor: cancelar TR y no tramitar

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §7.5 y §20.5. Cancelar nunca borra: TR → `cancelado` con actor/timestamp/motivo; si `tr_cancelado_regresa_al_mismo` la placa vuelve a cabeza, si no se reabre el requerimiento y se reoferta. `no_tramitar` sustituye el texto del Excel.
- **Criterio de done:**
  - [x] Historia conservada, cupo reabierto y siguiente ofertado
  - [x] Regreso a cabeza con posiciones densas
  - [x] No se cancela dos veces; motivo obligatorio
- **Referencias:** spec §7.5; ARCHITECTURE §5.5
- **Evidencia:** `motor-cola.test.ts` bloque `cancelar TR` → 4 tests en verde (2026-09-16).

### TASK-0008 — Adaptador en memoria transaccional

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** `AlmacenMemoria` implementa `UnidadDeTrabajo`/`Transaccion` con lock por clase sin espera (`COLA_LOCKED`), rollback por snapshot, auditoría en la transacción, secuencia TR con detección de desfase, `reemplazar` para reset. Más `RelojFijo`, `RelojSistema`, `IdsSecuenciales`. ADR-0002.
- **Criterio de done:**
  - [x] Rollback total si la función lanza
  - [x] Lock por clase: rechazo mientras está tomado, clases distintas no se bloquean
  - [x] Auditoría append-only con actor y timestamp
- **Referencias:** spec §5.3, §7.7; ARCHITECTURE §5.7; ADR-0002
- **Evidencia:** `memoria.test.ts` → 4 tests en verde (2026-09-16).

### TASK-0009 — Tests unitarios del motor (spec §16)

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** Escenario compartido (`escenario.test-util.ts`) con placas del legado y asociados anonimizados. Cubre los casos de §16: cabeza no habilitada, dos TM del mismo asociado, ofrecer+declinar+ofrecer en una transacción, 20 paralelos → 1 oferta y 19 `COLA_LOCKED`, más snapshot con motivo por fila.
- **Criterio de done:**
  - [x] Todos los casos de §16 aplicables al motor tienen un test con su nombre
  - [x] Deterministas (`RelojFijo`, `IdsSecuenciales`)
- **Referencias:** spec §16, §20; AGENTS RULE-017, RULE-020
- **Evidencia:** `pnpm test` → proyecto `domain` 3 archivos, 40 tests en verde (2026-09-16).

### TASK-0010 — API Fastify `/api/v1`

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §8. Login password+scrypt y token HMAC con duración por rol (ADR-0003); guard `exigir(recurso, permiso, { permitirOwn })` sobre la matriz RBAC; contrato de error `{ code, message, details }`; rutas de colas, requerimientos, ofertas (motor, `Idempotency-Key`), TR, `/me/*`, catálogos, parámetros (PATCH auditado), audit acotado por módulo, job de expiración; vistas con PII enmascarada; parser JSON tolerante a cuerpo vacío; endpoint de reset solo en `modoE2e`.
- **Criterio de done:**
  - [x] Todas las rutas de §8.4/§8.5 del alcance fase 1 responden con el guard correcto
  - [x] Errores de dominio mapeados a status por `CODIGOS_ERROR`
  - [x] `pnpm dev` levanta la API y `/healthz` responde
- **Referencias:** spec §3, §8, §12; ARCHITECTURE §6
- **Evidencia:** `app.test.ts` + `tokens.test.ts` en verde; e2e usa la API real en modo e2e (2026-09-16).

### TASK-0011 — Seed anonimizado

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §22.4: placas reales de septiembre 2026 (10 en TM-CBZ) con asociados `ASOCIADO NN ANONIMIZADO`, clientes, destinos, motivos, dos requerimientos y siete usuarios (uno por rol + dos member). Sin claves de GPS.
- **Criterio de done:**
  - [x] Determinista, reutilizable por API, tests y e2e
  - [x] Incluye un caso no habilitado (`SPS413`), un documento vencido (`UFR114`) y un asociado con dos TM
- **Referencias:** spec §12, §22.4; ARCHITECTURE §6.6
- **Evidencia:** e2e `login ops → …` parte de este seed y pasa (2026-09-16).

### TASK-0012 — Tests de API

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** Criterios de aceptación §20 verificables por API: viewer no muta (403), member no lista TR ajenos ni lee la cola completa, PII enmascarada por rol, flujo ofrecer → aceptar/declinar, cancelar TR, idempotencia, parámetros auditados, job de expiración, 20 POST paralelos → 1×201 + 19×409 con transacciones lentas.
- **Criterio de done:**
  - [x] 18 tests con `app.inject`, sin red ni DB
  - [x] Rate limit de login parametrizable para no falsear los tests
- **Referencias:** spec §16, §20; AGENTS RULE-017
- **Evidencia:** `pnpm test` → proyecto `api` 2 archivos, 22 tests en verde (2026-09-16).

### TASK-0013 — Web: login, sala de turnos, Mi turno

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §9 y §22.5. React 19 + Vite + TanStack Query; router por rol; `Ops` con requerimientos (Ofrecer cupo solo si el rol puede), colas por clase/cliente con cabeza elegible y motivos, actividad con anular y TR; `Me` con posición, `OfertaCard` (motivo obligatorio) y Mis TR; colores de §9.3; manifest PWA.
- **Criterio de done:**
  - [x] El frontend nunca decide "quién sigue": solo llama `POST /requerimientos/:id/ofertas`
  - [x] Sin input numérico de posición
  - [x] Traducción de códigos de error en un solo lugar
- **Referencias:** spec §9, §22.5; ARCHITECTURE §7
- **Evidencia:** e2e 4/4 en verde sobre estas pantallas (2026-09-16).

### TASK-0014 — Tests unitarios web

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** media
- **Contexto:** `formato.test.ts` (texto de posición, rutas por rol, traducción de errores, tonos) y `OfertaCard.test.tsx` (declinar exige motivo, acciones deshabilitadas mientras ocupa).
- **Criterio de done:**
  - [x] Vitest con jsdom + Testing Library, limpieza entre tests
- **Referencias:** spec §9.2, §9.3
- **Evidencia:** `pnpm test` → proyecto `web` 2 archivos, 9 tests en verde (2026-09-16).

### TASK-0015 — E2E Playwright

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** Spec §16: `login ops → ofrecer → login member → aceptar → aparece TR`. Además: declinar con motivo pasa la oferta a la siguiente placa (misma asociada, `TKM221`); viewer sin botones y 403 en API con PII enmascarada; credenciales inválidas. La API arranca en modo e2e con reset por test.
- **Criterio de done:**
  - [x] `pnpm test:e2e` levanta API y web solo
  - [x] 4 flujos en verde en Chromium
- **Referencias:** spec §16, §20.1-20.3; AGENTS RULE-017
- **Evidencia:** `pnpm test:e2e` → 4 passed (11.7s) (2026-09-16). Encontró el bug TASK-0037.

### TASK-0016 — Migraciones SQL, runner y tests de base de datos

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §6 completo en `infra/postgres/migrations/0001-0010`: maestros, IAM, HSEQ, catálogos, operación (unicidad de posición diferible, una oferta abierta por placa, checks de rastro en TR), audit append-only por trigger, índices, RLS con `app.rol`/`app.vehiculo_ids` y rol `asotracmet_app`, datos base. Runner `migrar.ts` (`pnpm db:migrate`) y proyecto Vitest `db` (se omite sin `DATABASE_URL`).
- **Criterio de done:**
  - [x] Las 10 migraciones aplican en Postgres real y son idempotentes
  - [x] `audit_log` rechaza UPDATE/DELETE
  - [x] RLS: member solo ve TR de sus placas y no inserta; verificado con rol no superusuario
  - [x] Checks de placa y coherencia clase/clase_cola
- **Referencias:** spec §3.3, §6; ARCHITECTURE §8; ADR-0004
- **Evidencia:** Postgres embebido 18 (UTF8) en la máquina de desarrollo (Docker no disponible): `pnpm db:migrate` → 10 aplicadas, 0 omitidas; `pnpm test:db` → 7 passed (2026-09-16). La primera pasada detectó dos defectos reales que se corrigieron: la política de `documentos` referenciaba `vehiculo_id` (ahora políticas propias por `sujeto_id`) y el superusuario se salta RLS (ahora existe `asotracmet_app` y el test usa `set local role`). CI repite la verificación con Postgres 16 (job `db`).

### TASK-0017 — CI GitHub Actions

- **Estado:** en_progreso
- **Fase:** 0
- **Prioridad:** alta
- **Contexto:** `.github/workflows/ci.yml` con tres jobs: `check` (lint, formato, tipos, unit con cobertura), `e2e` (Chromium) y `db` (servicio Postgres 16 → `db:migrate` + `test:db`). Artefactos: cobertura e informe de Playwright.
- **Criterio de done:**
  - [x] Workflow escrito y equivalente a los comandos locales
  - [ ] Primer push a GitHub con los tres jobs en verde
- **Referencias:** AGENTS RULE-018; ARCHITECTURE §10
- **Evidencia:** Los mismos comandos pasan en local (ver TASK-0009, 0012, 0014, 0015). El repositorio aún no tiene remoto; bloqueo suave hasta el primer push.

### TASK-0018 — Documentación

- **Estado:** hecha (2026-09-16)
- **Fase:** 0
- **Prioridad:** alta
- **Contexto:** `ARCHITECTURE.md` (vista actual y objetivo, capas, motor, API, web, modelo de datos, seguridad, tests, runbooks), `AGENTS.md` (RULE-001 a RULE-028, plantilla y checklist), este `ISSUES.md`, `README.md`, `CLAUDE.md` y cuatro ADR.
- **Criterio de done:**
  - [x] Cada módulo, tabla, endpoint y parámetro existente está descrito
  - [x] Cada regla tiene ID y es verificable
- **Referencias:** AGENTS RULE-024
- **Evidencia:** Archivos presentes y enlazados entre sí (2026-09-16).

### TASK-0019 — Adaptador Postgres de `Transaccion` / `UnidadDeTrabajo`

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** `AlmacenPostgres` (`apps/api/src/persistencia/postgres.ts`) sobre `pg`: una transacción por acción con `set local role asotracmet_app`, `set_config` de `app.rol` / `app.vehiculo_ids` (contexto por `AsyncLocalStorage` fijado en el hook de auth), `pg_try_advisory_xact_lock('cola:<clase>')` + `select … for update nowait` (→ `COLA_LOCKED`), audit en la misma transacción, secuencia TR atómica con `jsonb_set`, mapeo de tipos del dominio y traducción de errores de Postgres a códigos estables. Escrituras del motor con rol de servicio y lecturas con el rol del actor (ADR-0005). `UsuariosPostgres` lee `usuarios` + `usuario_vehiculos`. Migración `0011` (`audit_log.actor_id` a texto, grant del rol de aplicación, `cola_total()`). Selección por `PERSISTENCIA=postgres`; el modo memoria sigue intacto para dev, unit y e2e.
- **Criterio de done:**
  - [x] La API completa pasa los criterios de la spec §20 con el adaptador inyectado (`infra/postgres/api-postgres.test.ts`, 10 tests)
  - [x] Concurrencia contra Postgres real: con la clase bloqueada por otra transacción → 409 `COLA_LOCKED`; 20 coordinadores en paralelo sobre un cupo → una sola oferta
  - [x] `readyz` reporta la DB
  - [x] Los 92 tests unitarios y los 4 e2e siguen en verde sobre memoria
- **Referencias:** spec §5.1, §5.3, §7.7; ARCHITECTURE §2.1, §5.7, §6.1, §8; ADR-0001, ADR-0002, ADR-0004, ADR-0005; TASK-0016, TASK-0038, TASK-0039
- **Evidencia:** Postgres embebido 18 (UTF8) en la máquina de desarrollo: `pnpm db:migrate` → 11 aplicadas; `pnpm db:seed` → 10 asociados, 17 vehículos, 8 usuarios, 2 requerimientos; `pnpm test:db` → 2 archivos, 17 passed (2026-09-16). `pnpm check` en verde (92 unit) y `pnpm test:e2e` → 4 passed. El adaptador pasó sus 10 tests de API en la primera ejecución; los dos fallos de esa pasada eran tests de migraciones que asumían la base vacía y se hicieron independientes de la semilla.

### TASK-0020 — Lock Redis `cola:{clase}` con reintento

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** media
- **Contexto:** Spec §7.7: lock distribuido además del advisory lock de Postgres (que ya cubre una sola base con varias instancias de API, porque vive en el servidor), con espera de 2 s y reintento en el cliente web. Prioridad baja mientras haya una sola base; el reintento en la UI sí aporta desde ya.
- **Criterio de done:**
  - [ ] Lock con TTL y liberación segura; `COLA_LOCKED` estable
  - [ ] Runbook "cola trabada" actualizado
- **Referencias:** spec §7.7, §15; ARCHITECTURE §14; TASK-0019
- **Evidencia:** —

### TASK-0021 — Auth de producto

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §3.3 y §12. `ServicioAuth` (`apps/api/src/auth/servicio.ts`): roles internos con contraseña + TOTP (RFC 6238, `totp.ts`, secreto cifrado AES-256-GCM en `usuarios.totp_secret_enc`, enrolamiento obligatorio en el primer acceso) o código de un solo uso por correo (10 min, cinco intentos); `member` con enlace mágico de un solo uso (15 min); sesiones opacas con hash en `sesiones` (migración `0012`), expiración por rol y revocación real en logout; `POST /auth/reauth` + guard `exigirReauth` para acciones sensibles; respuestas anti-enumeración; puerto `Mensajeria` (`consola` en dev, `memoria` en tests/e2e). Web: login en dos pasos y ruta `/entrar` para el enlace. El bearer se mantiene (sin cookies, sin CSRF); WhatsApp/SMS como canal real queda en TASK-0026. Sustituye ADR-0003.
- **Criterio de done:**
  - [x] Login sin contraseña estática para member (enlace mágico; la contraseña se rechaza)
  - [x] 2FA obligatorio para todo rol interno (`admin_*`, `superadmin`, `viewer`) con contraseña; alternativa de código por correo
  - [x] Logout revoca; sesiones expiran por rol; re-autenticación para acciones sensibles
  - [x] Tests unitarios (TOTP con vectores del RFC, cifrado, tokens), de API (11 casos de acceso), sobre Postgres y e2e (3 flujos nuevos) en verde
- **Referencias:** spec §3.3, §8.1, §12; ARCHITECTURE §6.2, §8, §9; ADR-0003
- **Evidencia:** `pnpm check` → lint, formato, tipos y 108 tests unitarios en verde; `pnpm test:db` sobre Postgres embebido → 12 migraciones, semilla, 19 tests; `pnpm test:e2e` → 7 passed (2026-09-16). En el servidor de desarrollo, `POST /auth/login` sin contraseña responde `codigo_enviado` y el código sale por el log de la API.

### TASK-0040 — Anti-replay del código TOTP y límite de retos por usuario

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** baja
- **Contexto:** Descubierto al cerrar TASK-0021 (RULE-007). RFC 6238 recomienda no aceptar dos veces el mismo código dentro de su ventana; hoy un código válido podría reutilizarse durante ~90 s. También conviene limitar los retos de 2FA vivos por usuario para que un atacante con la contraseña no pueda pedir retos sin fin.
- **Criterio de done:**
  - [ ] Guardar el último paso TOTP aceptado por usuario y rechazar códigos de pasos ≤ al último
  - [ ] Test: el mismo código no entra dos veces
- **Referencias:** ARCHITECTURE §6.2; TASK-0021
- **Evidencia:** —

### TASK-0022 — IAM: CRUD de usuarios, roles y scope member

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §8.2: `GET /usuarios`, `GET /usuarios/:id`, `POST /usuarios`, `PATCH /usuarios/:id`, `POST /usuarios/:id/roles` (solo superadmin, revoca sesiones y limpia placas al salir de `member`), `POST /usuarios/:id/vehiculos` (scope member, placas validadas). `RepositorioUsuarios` gana `listar`, `crear` y `actualizar` en memoria y Postgres (transacción con `usuario_vehiculos`). Reglas en la API: `member` sin contraseña, correo único (`EMAIL_EN_USO`), desactivar revoca sesiones, nadie se desactiva ni se cambia el rol a sí mismo; todo auditado sin secretos. Web: página `/admin/usuarios` (superadmin) con alta por rol, cambio de rol con confirmación, activar/desactivar y placas del asociado. La auditoría se escribe tras la escritura del usuario (dos operaciones; el repositorio de usuarios no forma parte de la transacción del dominio).
- **Criterio de done:**
  - [x] Un rol primario por usuario; cambios auditados
  - [x] Test: solo superadmin cambia roles (y crea); los admins solo leen; viewer nada
  - [x] El usuario nuevo entra por su método (código por correo o enlace) y ve su scope
- **Referencias:** spec §3.1, §3.3, §8.2, §9.2 Superadmin; ARCHITECTURE §6.4, §6.8, §7
- **Evidencia:** `pnpm check` → 122 tests unitarios en verde (6 nuevos de IAM en la API); `pnpm test:db` sobre Postgres embebido → 13 migraciones, 21 tests (usuarios y placas persistidos, cambio de rol revoca); `pnpm test:e2e` → 9 passed, incluido "superadmin da de alta un asociado con placa y el asociado entra con su enlace" (2026-09-16).

### TASK-0023 — Maestros: CRUD

- **Estado:** hecha
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §8.3: asociados, vehículos (placa normalizada, clase → clase_cola), conductores, clientes, destinos, transportadoras, tarifas con vigencia, `PUT /vehiculos/:id/habilitaciones/:clienteId`. Soft delete. Cifrado AES-GCM de `cuenta_bancaria_enc` con clave del entorno.
- **Criterio de done:**
  - [x] Guards por rol según §3.2 (hseq CRUD flota; finance CRUD tarifas)
  - [x] Nunca `DELETE` físico con TR históricos
- **Referencias:** spec §6.2-6.4, §8.3, §12
- **Evidencia:** `rutas/maestros.ts` + `maestros/{tipos,memoria,postgres,vistas}.ts` + `schemas-maestros.ts` + pantalla `/hseq`. `pnpm check` (2026-09-16) → 146 passed: en `app.test.ts` el bloque «maestros» cubre alta de placa al final de su cola y baja lógica que conserva la ficha, cambio de estado/clase con motivo entre colas, SOAT vencido → no elegible → renovar → elegible, ficha (asociado, conductores, documentos, habilitaciones, posición) con viewer enmascarado y member solo lo suyo, documento único y cuenta bancaria que nunca sale, y «finance crea tarifas, ops solo actualiza, hseq no ve tarifas» (guards §3.2). E2E «HSEQ da de alta una placa…» en `e2e/enturnamiento.spec.ts`. Ningún DELETE físico: todas las bajas son `deleted_at`/`estado`.

### TASK-0024 — Reset y override de cola auditados

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §7.1.5, §9.2, §13.3 y §21. `MotorCola.override` (mover una placa a una posición, `moverAPosicion` con invariantes) y `MotorCola.resetCola` (la cola pasa a ser los vehículos activos de la clase, en el orden dado y luego por placa, contadores de ronda a cero; el antes queda en audit con contadores). Rutas `POST /colas/:clase/override` y `/reset` solo para superadmin con re-autenticación; el reset exige confirmación literal `RESETEAR` y, si `reset_cola_requiere_2fa`, que la re-autenticación haya sido con TOTP (`sesiones.reauth_factor`, migración `0013`). `GET /colas/:clase/intervenciones` expone esos eventos a todo el que ve la cola, veedor incluido. Web: página `/admin` (superadmin) y lista de intervenciones en la sala de turnos. Nunca un input numérico sobre `posicion`: la posición destino se elige de una lista dentro de una acción con motivo.
- **Criterio de done:**
  - [x] Acciones en `MotorCola` con invariantes verificadas (5 tests de dominio, incluido el lock de clase)
  - [x] Visibles para viewer vía `GET /colas/:clase/intervenciones` (API y e2e)
  - [x] Re-autenticación obligatoria; segundo factor obligatorio para reset según parámetro
- **Referencias:** spec §7.1, §9.2, §10, §13.3, §21; ARCHITECTURE §5.5, §6.4, §7; AGENTS RULE-014; TASK-0021
- **Evidencia:** `pnpm check` → 116 tests unitarios en verde; `pnpm test:db` sobre Postgres embebido → 13 migraciones, 20 tests; `pnpm test:e2e` → 8 passed, incluido "superadmin resetea la cola con motivo, confirmación y segundo factor; el veedor lo ve" (2026-09-16).

### TASK-0041 — Pantalla superadmin: parámetros y auditoría filtrable

- **Estado:** hecha
- **Fase:** 1
- **Prioridad:** media
- **Contexto:** Spec §9.2 Superadmin: editar parámetros de cola y recaudo desde la web (hoy solo por `PATCH /parametros`) y consultar la auditoría con filtros (entidad, id, acción). La API ya lo soporta; falta la pantalla en `/admin`.
- **Criterio de done:**
  - [x] Formulario de parámetros con validación Zod compartida y confirmación
  - [x] Tabla de auditoría filtrable con before/after legibles
  - [x] e2e: cambiar `oferta_ttl_minutos` desde la web queda auditado
- **Referencias:** spec §9.2, §10; ARCHITECTURE §7; TASK-0024
- **Evidencia (2026-09-17):** Pantallas `/admin/parametros` (`Parametros.tsx`: formulario con `PatchParametrosSchema` compartido, confirmación con el detalle de cambios, solo envía las claves modificadas, historial de `parametros.cambiar`) y `/admin/auditoria` (`Auditoria.tsx`: filtros por entidad, id, acción y límite; antes/después legible con `resumenCambios`, JSON desplegable). Unit test de `resumenCambios` en `formato.test.ts` (10 passed en `web`). E2E «superadmin cambia oferta_ttl_minutos desde la web y el cambio queda auditado con antes y después» → 13 passed. `pnpm check` → 165 passed.

### TASK-0025 — Migración controlada desde el Excel

- **Estado:** hecha
- **Fase:** 0-1
- **Prioridad:** alta
- **Contexto:** Spec §13. El Excel legado (`RECURSOS/control de enturnamiento.xlsx`, 17 hojas, fuera de git por contener PII y credenciales de GPS) es a la vez la fuente de los maestros reales y la evidencia del "método antiguo". `pnpm db:migrate-xlsx` (`scripts/migrate-xlsx.ts` sobre `infra/migracion/`) lo lee con `exceljs`, construye un plan puro (`modelo.ts`), lo carga en Postgres en una sola transacción (`cargar.ts`) y emite un informe de excepciones (`informe.ts`). Repetible (UUID v5 por llave de negocio), con `--dry-run` (rollback) y `--sin-db` (solo informe). Nunca lee las columnas de contraseña de GPS ni de correo. Decisiones de §13.2 tomadas y listadas en `docs/migracion-excel.md`: un asociado / N placas; `TM-CBZ` unificado; TR del SERV siempre sintéticos (`TR-1AAAAMMNNN`) porque las planillas `CONTROL TURNOS` no traen placa; flete del SERV gana como `flete` y la tarifa queda referencial; la cola se reconstruye desde el `TURNERO` (foto del 16/09/26: disponibles en orden, luego en ruta, luego el resto de activos).
- **Criterio de done:**
  - [x] `pnpm db:migrate-xlsx --sin-db` sobre el xlsx real produce el informe con las excepciones de §13.1.8 (placas sin asociado, TR duplicados, `TR-` vacío, `DECLINO` vs `DECLINA`, destinos no canónicos)
  - [x] Test unitario de los normalizadores (placa, fecha serial, marcas X/NA/NO, clase) y snapshot del informe cuando el xlsx está presente (se omite si no)
  - [x] Criterios de §13.3: toda placa de SERV AGOS/SEPT existe en `vehiculos`; `valor_recaudo` recalculado desde `parametros.recaudo_porcentaje` y comparado con el 3 % legado, diferencias listadas; cola por clase con N = vehículos activos de la clase
  - [x] Carga real en el Postgres de `infra/compose.yaml` y API en modo `postgres` mostrando los datos
  - [x] `docs/migracion-excel.md` (mapeo hoja → tabla, decisiones, qué no se migra y por qué) y ARCHITECTURE §6.6/§13 actualizados
- **Referencias:** spec §13, §19 Fase 0, §23; ARCHITECTURE §6.6, §11; TASK-0039, TASK-0042
- **Evidencia (2026-09-16):** `pnpm db:migrate-xlsx --sin-db` → 17 hojas, plan de 27 asociados, 59 vehículos (51 activos), 33 conductores, 53 documentos, 244 habilitaciones, 70 destinos, 1211 tarifas, 51 posiciones (TM-CBZ 32, MM 8, C100 7, C350 4), 265 viajes, 27 usuarios member, 371 excepciones (257 destinos no canónicos agrupados, 10 TR duplicados, 1 `TR-` vacío, 1 `DECLINO`, 1 sufijo, 8 placas de terceros). `--dry-run` y carga real contra Postgres 16 (`infra/compose.yaml` en 5434): "Carga confirmada: 265 TR, 257 recaudos, 33 usuarios"; conteos verificados por SQL y cabeza de `TM-CBZ` = orden del TURNERO (TGM586, SWI750, SPS413…). API en `PERSISTENCIA=postgres`: `/healthz` → `{"ok":true,"modo":"postgres"}`, login `ops@` por código y `GET /api/v1/colas/TM-CBZ` → 32 placas reales. `vitest run --project migracion` → 13/13. `pnpm test:db` sobre la base `asotracmet_test` → 22/22. `pnpm lint` ✓, `pnpm typecheck` ✓. Cierre: tras formatear los 14 archivos pendientes y corregir el documento esperado en `app.test.ts` (`10020000202`, el que genera `seed.ts`), `pnpm check` → 146 passed, 22 skipped (db sin `DATABASE_URL`).

### TASK-0042 — Puertos del host configurables en `infra/compose.yaml`

- **Estado:** hecha
- **Fase:** 0
- **Prioridad:** media
- **Contexto:** Descubierto en TASK-0025 (RULE-007): en la máquina de desarrollo el 5432 y el 6379 ya los ocupan contenedores de otro proyecto y `docker compose up` falla al publicar el puerto. Los puertos del host pasan a ser `ASOTRACMET_PG_PORT` y `ASOTRACMET_REDIS_PORT` (por defecto 5432 y 6379, así CI y la documentación no cambian).
- **Criterio de done:**
  - [x] `ASOTRACMET_PG_PORT=5434 ASOTRACMET_REDIS_PORT=6381 docker compose -f infra/compose.yaml up -d` levanta ambos servicios
  - [x] `.env.example` y ARCHITECTURE §11 documentan las variables
- **Referencias:** ARCHITECTURE §11; TASK-0025
- **Evidencia (2026-09-16):** con 5432/6379 ocupados por otro proyecto, `docker compose up` fallaba con "Bind for 0.0.0.0:5432 failed: port is already allocated"; con `ASOTRACMET_PG_PORT=5434 ASOTRACMET_REDIS_PORT=6381` → `infra-postgres-1 Up (healthy) 0.0.0.0:5434->5432/tcp`, `infra-redis-1 Up (healthy) 0.0.0.0:6381->6379/tcp`; `pnpm db:migrate` → 13 aplicadas. Sin variables el compose mantiene 5432/6379 (CI sin cambios). `pnpm check` en verde (ver TASK-0025).

### TASK-0043 — Soportes HSEQ en object storage (subida de archivos)

- **Estado:** pendiente
- **Fase:** 3
- **Prioridad:** media
- **Contexto:** Descubierto al cerrar TASK-0028 (RULE-007). Hoy `documentos.archivo_url` acepta una URL ya alojada (spec §6.3: el archivo nunca va dentro de la base). Falta el flujo de subida real: bucket S3-compatible (spec §18), URL prefirmada desde la API, límite de tamaño y tipo, y descarga con el rol del actor. Sin claves en la base (spec §12).
- **Criterio de done:**
  - [ ] `POST /documentos/:id/soporte` devuelve URL prefirmada y guarda `archivo_url` al confirmar
  - [ ] Tests de API con un almacén S3 falso; e2e sube un PDF desde `/hseq`
  - [ ] Variables `S3_*` documentadas en `docs/despliegue.md` y ARCHITECTURE §11
- **Referencias:** spec §6.3, §12, §18; TASK-0028
- **Evidencia:** —

### TASK-0026 — Notificaciones

- **Estado:** pendiente
- **Fase:** 1-2
- **Prioridad:** media
- **Contexto:** Spec §11: eventos `oferta.abierta`, `oferta.por_expirar`, `oferta.declinada`, `tr.asignado`, `tr.cancelado`, `documento.por_vencer`, `recaudo.pendiente`; canales in-app, email, WhatsApp opt-in; plantillas; outbox simple. WhatsApp es canal, no estado.
- **Criterio de done:**
  - [ ] Outbox transaccional y worker (BullMQ)
  - [ ] Preferencias de canal por usuario
- **Referencias:** spec §11, §14, §18
- **Evidencia:** —

### TASK-0027 — Viajes, tarifas, recaudo y pantalla finance

- **Estado:** hecha
- **Fase:** 2
- **Prioridad:** alta
- **Contexto:** Spec §6.5, §8.4, §9.2 Finance y §20.7: alta de viaje desde TR, flete acordado vs tarifa sugerida, `porcentaje_aplicado` snapshot al liquidar, recaudos y estado de cobro. Import de `SERV MAY–SEPT`.
- **Criterio de done:**
  - [x] Cambiar `recaudo_porcentaje` afecta solo viajes nuevos (test)
  - [x] "El 3% del mes sale del sistema"
  - [x] Alta de viaje desde TR, flete acordado vs tarifa sugerida, liquidación con `porcentaje_aplicado` snapshot, pagos y anulación (API memoria y Postgres con RLS)
  - [x] Pantalla `/finance` con e2e; ARCHITECTURE §6.4, §6.9 y §7 actualizados
- **Referencias:** spec §6.4-6.5, §10, §19 Fase 2, §20.7
- **Evidencia (2026-09-16):** `packages/shared/src/recaudo.ts` (`calcularRecaudo`, `estadoRecaudoSegunPago`, 3 tests), `schemas-viajes.ts`, `apps/api/src/viajes/{tipos,memoria,postgres}.ts`, `rutas/viajes.ts`, pantalla `/finance`. `apps/api/src/viajes.test.ts` (6): alta desde TR con tarifa sugerida, liquidación con snapshot y TR cumplido, **cambiar `recaudo_porcentaje` a 0,05 solo afecta al viaje nuevo (75.000) y el viejo conserva 0,03 (45.000)**, pagos parcial/total con `PAGO_INVALIDO` y `RECAUDO_CERRADO`, `VIAJE_YA_EXISTE`/`TR_NO_VIAJABLE`/`VIAJE_NO_LIQUIDABLE`, anular castiga el recaudo, RBAC (ops no crea ni liquida, viewer y member enmascarados, member solo lo suyo). `pnpm test:db` → 24 passed con el caso «viajes y recaudos persisten con RLS». E2E «finance crea el viaje del TR, liquida el 3 % y registra el pago» → 11 passed. Con los datos reales migrados, `GET /viajes/resumen?mes=2026-09` → 42 viajes, flete 118.232.405, recaudo 3.546.975, pagado 3.029.308, pendiente 517.667: el 3 % del mes sale del sistema. `pnpm check` → 162 passed.

### TASK-0028 — HSEQ bloqueante

- **Estado:** hecha
- **Fase:** 3
- **Prioridad:** alta
- **Contexto:** Spec §6.3, §9.2 HSEQ, §14: documentos con soporte en object storage, semáforo 30/7/vencido, job nocturno `documentos_recalcular_estado`, alertas, toggle `apto` con motivo. El motor ya filtra por documento vencido y habilitación.
- **Criterio de done:**
  - [x] Ficha de placa con documentos, conductores y habilitaciones por cliente
  - [x] "La cola rechaza sola una placa vencida" (ya cubierto en motor; verificar con datos reales)
  - [x] Alertas de vencimiento (API + `/hseq` + `/me`) y job nocturno de recálculo, auditado
  - [x] Semáforo 30/7/vencido y toggle `apto` con motivo (ya en TASK-0023, verificados aquí)
- **Referencias:** spec §6.3, §9.2, §14, §19 Fase 3
- **Evidencia (2026-09-16):** `GET /documentos/alertas?dias=` (vencidos y por vencer, ordenados por urgencia, member solo sus placas, número enmascarado para viewer) y `POST /jobs/recalcular-documentos` + job diario en `index.ts` (`recalcularEstadosDocumentos`: `documentos_recalcular_estado` en Postgres, calculado al leer en memoria). Alertas en `/hseq` y semáforo propio en `/me`. `apps/api/src/hseq.test.ts` (3): UFR114 vencido y QOR007 por vencer, ventana de 7 días, el tiempo pasa sin escribir nada, member solo lo suyo, job auditado y ops no puede. `pnpm test:db` → 24 passed con «el job nocturno actualiza documentos.estado». E2E HSEQ comprueba las alertas en pantalla → 11 passed. **Datos reales**: `GET /colas/TM-CBZ` deja no elegibles por `DOCUMENTO_VENCIDO` a TFW559, NUX418, STO024, SKG606, LPY429, THQ894, SYU007 y TFW561; `GET /documentos/alertas` → 45 alertas; el job recalculó 53 documentos. La subida de soportes a object storage queda en TASK-0043. `pnpm check` → 162 passed.

### TASK-0029 — Tablero viewer y métricas de equidad

- **Estado:** hecha
- **Fase:** 2
- **Prioridad:** media
- **Contexto:** Spec §8.5 `GET /tablero?mes=`, §9.2 Viewer, §14 snapshot mensual (`metricas_mes`): viajes del mes, declinaciones, turnos tomados vs ofrecidos por placa (ya se acumulan en `cola_posiciones`).
- **Criterio de done:**
  - [x] Tablero solo lectura con PII enmascarada
  - [x] Snapshot mensual reproducible
  - [x] Tablero solo lectura con PII enmascarada (no expone cédulas; member no lo ve)
- **Referencias:** spec §8.5, §9.2, §14
- **Evidencia (2026-09-17):** `GET /tablero?mes=` (cálculo puro `calcularTablero`: ofertas por estado, por clase y por motivo de declinación; TR por estado; viajes liquidados; equidad ofrecidas/tomadas por placa), `GET /tablero/snapshots`, `POST /jobs/snapshot-metricas` (auditado `metricas.snapshot`) y snapshot automático el día 1 en `index.ts`; migración `0014_metricas_mes` con RLS; pantalla `/tablero`. `apps/api/src/tablero.test.ts` (2): equidad FST189 1/1, TKM221 declinó, SWI750 abierta, member 403; **el snapshot es reproducible**: dos corridas iguales y equivalentes al tablero en vivo. `pnpm test:db` → 25 passed con «el snapshot mensual de equidad se persiste en metricas_mes». E2E «el veedor ve en el tablero la equidad del mes» → 13 passed. `pnpm check` → 165 passed. Corregido de paso el fin de mes (`finDeMes`) que fallaba con `-31`.

### TASK-0030 — Observabilidad y runbooks

- **Estado:** hecha
- **Fase:** 1-2
- **Prioridad:** media
- **Contexto:** Spec §15: `/readyz` con DB y Redis, métricas (ofertas abiertas, tiempo de respuesta, declinaciones/día, `COLA_LOCKED`, latencia de `ofrecer`), trazas en la transacción de cola, logs sin PII, runbooks completos.
- **Criterio de done:**
  - [x] OpenTelemetry exportando trazas y métricas
  - [x] Runbooks en `docs/runbooks/`
  - [x] `/readyz` con base y Redis (503 si falla), `/metrics` Prometheus sin PII con `METRICS_TOKEN`, contadores COLA_LOCKED, latencia de ofrecer, declinaciones y ofertas abiertas
- **Referencias:** spec §15; ARCHITECTURE §14
- **Evidencia (2026-09-17):** `observabilidad.ts` (registro Prometheus + `pingRedis` por TCP), `telemetria.ts` (`NodeTracerProvider` + `MeterProvider` OTLP/HTTP solo con `OTEL_EXPORTER_OTLP_ENDPOINT`; `trazarUnidadDeTrabajo` envuelve cada transacción de cola en el span `cola.transaccion` con clase y código de error), hooks en `app.ts` (respuestas HTTP, errores de dominio, latencia de `ofrecer`, declinaciones). `apps/api/src/observabilidad.test.ts` (4): formato Prometheus, PING a un Redis falso y a un puerto cerrado, `/readyz` con base y Redis, `/metrics` con token, `COLA_LOCKED` contado bajo 3 ofertas en paralelo, latencia y declinaciones. Bundle: `/readyz` → `{ok, db:{ok,ms}, redis:'n/a'}`, `/metrics` 401 sin token y texto con token; API real en Postgres: `db.ms=59`. Runbooks en `docs/runbooks/` (cola trabada, secuencia TR, member ve placa ajena, restore, observabilidad). `pnpm test:db` → 25 passed; e2e → 14 passed; `pnpm check` → 173 passed.

### TASK-0031 — PWA completa

- **Estado:** hecha
- **Fase:** 1
- **Prioridad:** media
- **Contexto:** Spec §9.1: "Mi turno" instalable; service worker con caché de shell y lectura offline de posición/ofertas; aviso de sin conexión.
- **Criterio de done:**
  - [x] Lighthouse PWA instalable
  - [x] E2E de instalación no rompe los flujos actuales
  - [x] Service worker con caché del shell y lectura offline de posición/ofertas; aviso de sin conexión
- **Referencias:** spec §9.1, §9.2 Member
- **Evidencia (2026-09-17):** `vite-plugin-pwa` (manifest con iconos PNG 192/512 y SVG, `standalone`; service worker Workbox con el shell precacheado y `NetworkFirst` para `/api/v1/me/*`, alertas y motivos), `registerSW` en `main.tsx`, `EstadoConexion` (aviso de sin conexión). `pnpm build` → `dist/sw.js` + `manifest.webmanifest` + 8 entradas precacheadas. E2E «PWA: manifest instalable, service worker activo y Mi turno legible sin conexión» corre contra el build servido por `vite preview` (`preview:e2e`, tercer `webServer` de Playwright): manifest `standalone` con 192x192/512x512, SW `activated`, y sin red (`context.setOffline`) el aviso aparece, `/index.html` y `/api/v1/me/cola` responden 200 desde la caché sin token mientras `/api/v1/colas/TM-CBZ` (no cacheado) falla. **Lighthouse no se ejecutó en esta máquina**: los criterios de instalabilidad de Chrome (manifest válido con iconos PNG, `start_url`, `display`, service worker con fetch, HTTPS por el proxy) están cubiertos y verificados por el e2e. Los 15 e2e existentes siguen en verde.

### TASK-0032 — Build de producción, Dockerfile y despliegue

- **Estado:** hecha
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Hoy la API corre con `tsx`. Empaquetar con tsup/esbuild, imagen Docker (API + web estática), variables de entorno y despliegue en un VPS o Fly/Render (spec §18). Backups cifrados.
- **Criterio de done:**
  - [x] `pnpm build` produce artefactos ejecutables sin `tsx`
  - [x] Despliegue documentado y reproducible
  - [x] La API sirve el build de la web (`WEB_DIR`) con fallback SPA y `/api` intacto (test)
  - [x] Backups cifrados y restore documentados y scriptados
- **Referencias:** spec §18, §15
- **Evidencia (2026-09-16):** `pnpm build` → `apps/api/dist/index.mjs` (esbuild ESM, 235 KB, dominio y shared empaquetados; fastify/pg/zod externos), `apps/web/dist` (Vite) y `dist/scripts/{migrate-db,seed-db}.mjs`. `node apps/api/dist/index.mjs` con `WEB_DIR=apps/web/dist` sirve `/` y `/ops` como HTML, `/assets/*` como JS y `/api/v1/*` como JSON (401 sin token); `node dist/scripts/migrate-db.mjs` con `MIGRACIONES_DIR` → "13 omitidas" sobre una base ya migrada. `docker build -t asotracmet:local .` (multi-stage, `pnpm deploy --prod`, 316 MB) y `docker run -e PERSISTENCIA=memoria` → `/healthz` ok, `/` y `/ops` 200 text/html, API 401 JSON. Test `apps/api/src/web-estatica.test.ts` (4) cubre SPA, estáticos y que `/api` no cae al SPA. CI: paso `pnpm build` en `check` y job `imagen` que construye y arranca el contenedor. `infra/compose.prod.yaml`, `scripts/backup-db.sh` (pg_dump → gzip → AES-256) y `scripts/restore-db.sh`; guía en `docs/despliegue.md`. `pnpm check` → 162 passed.

### TASK-0033 — Contrato OpenAPI y tipos compartidos

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** baja
- **Contexto:** Generar OpenAPI desde los esquemas Zod y derivar los tipos de `apps/web/src/api/tipos.ts` en lugar de mantenerlos a mano.
- **Criterio de done:**
  - [ ] `GET /api/v1/openapi.json` y tipos generados en build
- **Referencias:** ARCHITECTURE §6.4, §7
- **Evidencia:** —

### TASK-0034 — Export CSV por rol con watermark

- **Estado:** hecha
- **Fase:** 2
- **Prioridad:** baja
- **Contexto:** Spec §8.5 y §12: `GET /export/viajes.csv` gated por rol, watermark de usuario y fecha, viewer sin PII, member solo lo propio.
- **Criterio de done:**
  - [x] Test por rol del contenido exportado
  - [x] Marca de agua de usuario y fecha; auditado
- **Referencias:** spec §3.2 export, §12
- **Evidencia (2026-09-17):** `GET /export/viajes.csv?mes=` (`rutas/export.ts`): CSV RFC 4180 con marca de agua `# ASOTRACMET · exportado por <email> (<rol>) el <instante>` en la primera línea, viewer con cédula enmascarada, member solo sus placas, auditado `export.viajes`; botón «Exportar CSV» en `/finance` con `descargar()` (fetch con Bearer). `apps/api/src/export.test.ts`: escape CSV, finance completo con auditoría, viewer sin PII, member ajeno solo cabecera y dueño con su fila. E2E «finance exporta el CSV del mes con marca de agua…» comprueba la descarga real → 14 passed. `pnpm check` → 169 passed.

### TASK-0035 — Staging anonimizado y simulacro de restore

- **Estado:** hecha
- **Fase:** 2
- **Prioridad:** media
- **Contexto:** Spec §15 y §20.8: `scripts/anonymize-staging.ts`, backup continuo y restore en staging < 2 h, trimestral.
- **Criterio de done:**
  - [x] Procedimiento documentado y ejecutado una vez con evidencia
  - [x] `scripts/anonymize-staging.ts` repetible, con prueba en base aparte
- **Referencias:** spec §15, §20.8
- **Evidencia (2026-09-17):** `infra/postgres/anonimizar.ts` + `pnpm db:anonymize-staging --confirmo <base>`: nombres, documentos, celulares, correos y direcciones deterministas; cuentas bancarias, secretos TOTP, teléfonos y `last_login` a null; sesiones y códigos truncados; PII de la auditoría de maestros/IAM vaciada (trigger append-only reactivado); roles internos con la contraseña de desarrollo; rechaza `asotracmet`/`postgres` y exige repetir el nombre de la base. Test `infra/postgres/anonimizar.test.ts` en una base propia (`<base>_anonimizar`) → `pnpm test:db` 27 passed. **Simulacro ejecutado el 2026-09-17** sobre la copia local con los datos reales del Excel: `pg_dump asotracmet | psql asotracmet_staging` (3 s) + anonimizar → 27 asociados, 33 conductores, 59 vehículos, 33 usuarios, 4 sesiones borradas; verificación SQL: 0 documentos reales, 0 cuentas, 0 correos reales, 0 secretos TOTP, 0 sesiones; 59 vehículos, 265 TR, 265 viajes y 257 recaudos intactos. Tiempo total 8 s (objetivo < 2 h). Procedimiento en `docs/runbooks/restore-en-staging.md`.

### TASK-0036 — Habeas data: extracto de TR por asociado

- **Estado:** hecha
- **Fase:** 2
- **Prioridad:** baja
- **Contexto:** Spec §12: el asociado puede pedir extracto de sus TR; propósito, acceso y cancelación.
- **Criterio de done:**
  - [x] Endpoint y pantalla en "Mi turno"; auditado
- **Referencias:** spec §12
- **Evidencia (2026-09-17):** `GET /me/extracto` (solo member): placas, TR, viajes, recaudos y textos de habeas data (propósito, acceso, cancelación), auditado `habeas.extracto` sobre `asociados`; internos reciben 403. Botón «Descargar mi extracto» en Mi turno. Test en `export.test.ts` y e2e (descarga del JSON con placas FST189/TKM221) → 14 passed. `pnpm check` → 169 passed.

### TASK-0037 — Bug: el cliente web enviaba `content-type: application/json` sin cuerpo

- **Estado:** hecha (2026-09-16)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Descubierto por el e2e (RULE-007: trabajo encontrado → tarea nueva). Fastify rechazaba el POST vacío de "Ofrecer cupo" con 400 y la UI mostraba "Datos inválidos". Corrección doble: el cliente solo envía el header cuando hay cuerpo, y la API acepta cuerpo vacío como `{}` (JSON malformado sigue siendo 400).
- **Criterio de done:**
  - [x] e2e `login ops → ofrecer → …` en verde
  - [x] Test de API: POST de acción con `content-type: application/json` y cuerpo vacío responde 200
- **Referencias:** ARCHITECTURE §6.1; TASK-0015
- **Evidencia:** `pnpm test:e2e` → 4 passed; `app.test.ts` caso "acepta POST de acción sin cuerpo" en verde (2026-09-16).

### TASK-0038 — Capa de consultas: la API deja de leer el estado en memoria

- **Estado:** hecha
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** Descubierto al abordar TASK-0019 (RULE-007). Las rutas componían las respuestas leyendo `almacen.estado.*`, lo que ata la API al almacén en memoria. Se introduce el puerto de lectura `Consultas` (`apps/api/src/consultas/tipos.ts`) con dos adaptadores (`ConsultasMemoria`, `ConsultasPostgres`) que devuelven exactamente las mismas vistas; las rutas dependen de él y, tras cada acción del motor, vuelven a consultar por id. `Almacenamiento` agrupa `uow`, `consultas` y `usuarios`.
- **Criterio de done:**
  - [x] Ninguna ruta accede a `almacen.estado`
  - [x] Los 22 tests de API siguen en verde contra memoria
  - [x] Las mismas vistas se obtienen contra Postgres
- **Referencias:** ARCHITECTURE §6.1, §6.7; TASK-0019
- **Evidencia:** `pnpm test` → proyecto `api` 22 passed sin tocar los tests; `api-postgres.test.ts` comprueba las mismas formas de respuesta sobre Postgres (2026-09-16).

### TASK-0039 — Seed de Postgres y `pnpm db:seed`

- **Estado:** hecha
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** El mismo conjunto anonimizado de septiembre 2026 que usa el almacén en memoria, volcado a Postgres con UUID deterministas (uuid v5 sobre los identificadores legibles) para que ambos almacenes contengan los mismos datos y los tests puedan resolver ids por llave de negocio. `sembrarPostgres` en `apps/api/src/persistencia/seed-postgres.ts`; `scripts/seed-db.ts`; `pnpm db:seed` y `pnpm db:reset`.
- **Criterio de done:**
  - [x] `pnpm db:seed` es idempotente (upserts por llave de negocio)
  - [x] Usuario de servicio `sistema@asotracmet.test` para los jobs, sin contraseña y sin login
  - [x] Sin contraseñas de terceros (spec §12)
- **Referencias:** spec §22.4; ARCHITECTURE §6.6; TASK-0011
- **Evidencia:** `pnpm db:seed` → "Semilla aplicada: 10 asociados, 17 vehículos, 8 usuarios, 2 requerimientos"; los tests de `api-postgres.test.ts` la reaplican antes de cada caso sin duplicados (2026-09-16). CI la ejecuta en el job `db`.

## Plantilla

```markdown
### TASK-00NN — Título corto en imperativo

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Qué se necesita y por qué. Referencia a spec §x.y.
- **Criterio de done:**
  - [ ] Condición verificable
  - [ ] Test que lo cubre
  - [ ] ARCHITECTURE.md actualizado (si aplica)
- **Referencias:** spec §…, ARCHITECTURE §…, TASK-…
- **Evidencia:** _(comando + resultado + fecha al cerrar)_
```
