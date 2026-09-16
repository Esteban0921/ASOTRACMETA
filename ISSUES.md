# ISSUES.md — Backlog de ASOTRACMET

**Próximo ID: TASK-0038** · Reglas de este archivo: RULE-002 a RULE-007 en [AGENTS.md](AGENTS.md).

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
| TASK-0019 | Adaptador Postgres de `Transaccion` / `UnidadDeTrabajo`       | 1    | crítica   | pendiente   |
| TASK-0020 | Lock Redis `cola:{clase}` con reintento                       | 1    | media     | pendiente   |
| TASK-0021 | Auth producto: OTP, 2FA admin, magic link member, refresh     | 1    | alta      | pendiente   |
| TASK-0022 | IAM: CRUD usuarios, roles y scope member                      | 1    | alta      | pendiente   |
| TASK-0023 | Maestros: CRUD asociados, vehículos, conductores, catálogos   | 1    | alta      | pendiente   |
| TASK-0024 | Reset y override de cola auditados (superadmin, 2FA)          | 1    | alta      | pendiente   |
| TASK-0025 | Migración controlada desde el Excel + informe de excepciones  | 0-1  | alta      | pendiente   |
| TASK-0026 | Notificaciones (in-app, email, WhatsApp opt-in) con outbox    | 1-2  | media     | pendiente   |
| TASK-0027 | Viajes, tarifas, recaudo 3% y pantalla finance                | 2    | alta      | pendiente   |
| TASK-0028 | HSEQ: documentos, semáforo, habilitaciones, job nocturno      | 3    | alta      | pendiente   |
| TASK-0029 | Tablero viewer y métricas de equidad (`metricas_mes`)         | 2    | media     | pendiente   |
| TASK-0030 | Observabilidad: OpenTelemetry, métricas, readyz, runbooks     | 1-2  | media     | pendiente   |
| TASK-0031 | PWA: service worker, instalable, lectura offline              | 1    | media     | pendiente   |
| TASK-0032 | Build de producción de la API, Dockerfile y despliegue        | 1    | alta      | pendiente   |
| TASK-0033 | Contrato OpenAPI desde Zod y tipos compartidos con la web     | 1    | baja      | pendiente   |
| TASK-0034 | Export CSV por rol con watermark                              | 2    | baja      | pendiente   |
| TASK-0035 | Staging anonimizado y simulacro de restore                    | 2    | media     | pendiente   |
| TASK-0036 | Habeas data: extracto de TR por asociado                      | 2    | baja      | pendiente   |
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

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** Sustituir `AlmacenMemoria` en la API por un adaptador sobre `pg` (o Drizzle) que abra una transacción por acción, ejecute `set local role asotracmet_app`, `set local app.rol` y `set local app.vehiculo_ids`, tome `SELECT … FOR UPDATE NOWAIT` sobre `cola_posiciones` de la clase (→ `COLA_LOCKED`), inserte `audit_log` en la misma transacción y mapee los tipos del dominio. Los usuarios pasan a la tabla `usuarios`.
- **Criterio de done:**
  - [ ] Los tests del motor y de la API pasan con el adaptador inyectado (mismo escenario)
  - [ ] Test de concurrencia contra Postgres real: 20 paralelos → 1 + 19 `COLA_LOCKED`
  - [ ] `readyz` reporta la DB
- **Referencias:** spec §5.1, §5.3, §7.7; ARCHITECTURE §5.7, §8; ADR-0001, ADR-0002, ADR-0004; TASK-0016
- **Evidencia:** —

### TASK-0020 — Lock Redis `cola:{clase}` con reintento

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** media
- **Contexto:** Spec §7.7: lock distribuido además del row lock, con espera de 2 s y reintento en el cliente. Necesario solo con más de una instancia de API.
- **Criterio de done:**
  - [ ] Lock con TTL y liberación segura; `COLA_LOCKED` estable
  - [ ] Runbook "cola trabada" actualizado
- **Referencias:** spec §7.7, §15; ARCHITECTURE §14; TASK-0019
- **Evidencia:** —

### TASK-0021 — Auth de producto

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §3.3 y §12: OTP por correo para todo rol no member, TOTP (2FA) para admin y superadmin, magic link al celular para member, refresh tokens con revocación (`refresh_tokens`, `otp_codes`), re-auth para borrar o resetear cola, cookies httpOnly + CSRF si se deja el bearer puro. Sustituye ADR-0003.
- **Criterio de done:**
  - [ ] Login sin contraseña estática para member
  - [ ] 2FA obligatorio para `admin_*` y `superadmin`
  - [ ] Logout revoca; tests de API y e2e actualizados
- **Referencias:** spec §3.3, §12; ADR-0003
- **Evidencia:** —

### TASK-0022 — IAM: CRUD de usuarios, roles y scope member

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §8.2: `GET/POST/PATCH /usuarios`, `POST /usuarios/:id/roles` (solo superadmin), `POST /usuarios/:id/vehiculos` (scope member). Pantalla superadmin de usuarios y roles.
- **Criterio de done:**
  - [ ] Un rol primario por usuario; cambios auditados
  - [ ] Test: solo superadmin cambia roles
- **Referencias:** spec §3.1, §8.2, §9.2 Superadmin
- **Evidencia:** —

### TASK-0023 — Maestros: CRUD

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §8.3: asociados, vehículos (placa normalizada, clase → clase_cola), conductores, clientes, destinos, transportadoras, tarifas con vigencia, `PUT /vehiculos/:id/habilitaciones/:clienteId`. Soft delete. Cifrado AES-GCM de `cuenta_bancaria_enc` con clave del entorno.
- **Criterio de done:**
  - [ ] Guards por rol según §3.2 (hseq CRUD flota; finance CRUD tarifas)
  - [ ] Nunca `DELETE` físico con TR históricos
- **Referencias:** spec §6.2-6.4, §8.3, §12
- **Evidencia:** —

### TASK-0024 — Reset y override de cola auditados

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Spec §7.1.5 y §9.2: acción `cola.override` (mover una placa con motivo) y reset por clase (doble confirmación, 2FA, texto "RESETEAR"), ambas como acciones de dominio en el motor con audit visible para el veedor. Nunca un input numérico de posición.
- **Criterio de done:**
  - [ ] Acciones en `MotorCola` con invariantes verificadas
  - [ ] Visibles en `GET /audit` para viewer (la feature más política es el audit, §21)
- **Referencias:** spec §7.1, §9.2, §21; AGENTS RULE-014
- **Evidencia:** —

### TASK-0025 — Migración controlada desde el Excel

- **Estado:** pendiente
- **Fase:** 0-1
- **Prioridad:** alta
- **Contexto:** Spec §13: `scripts/migrate-xlsx.ts` repetible con dry-run e informe de excepciones (placas sin asociado, TR duplicados, `TR-` vacío, `DECLINO` vs `DECLINA`, destinos no canónicos). Decisiones de §13.2 firmadas antes de codificar. Nunca importa contraseñas.
- **Criterio de done:**
  - [ ] Dry-run sobre el xlsx real con snapshot de excepciones (test)
  - [ ] Criterios de §13.3 cumplidos y diferencias listadas, no silenciadas
- **Referencias:** spec §13, §19 Fase 0, §23
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

- **Estado:** pendiente
- **Fase:** 2
- **Prioridad:** alta
- **Contexto:** Spec §6.5, §8.4, §9.2 Finance y §20.7: alta de viaje desde TR, flete acordado vs tarifa sugerida, `porcentaje_aplicado` snapshot al liquidar, recaudos y estado de cobro. Import de `SERV MAY–SEPT`.
- **Criterio de done:**
  - [ ] Cambiar `recaudo_porcentaje` afecta solo viajes nuevos (test)
  - [ ] "El 3% del mes sale del sistema"
- **Referencias:** spec §6.4-6.5, §10, §19 Fase 2, §20.7
- **Evidencia:** —

### TASK-0028 — HSEQ bloqueante

- **Estado:** pendiente
- **Fase:** 3
- **Prioridad:** alta
- **Contexto:** Spec §6.3, §9.2 HSEQ, §14: documentos con soporte en object storage, semáforo 30/7/vencido, job nocturno `documentos_recalcular_estado`, alertas, toggle `apto` con motivo. El motor ya filtra por documento vencido y habilitación.
- **Criterio de done:**
  - [ ] Ficha de placa con documentos, conductores y habilitaciones por cliente
  - [ ] "La cola rechaza sola una placa vencida" (ya cubierto en motor; verificar con datos reales)
- **Referencias:** spec §6.3, §9.2, §14, §19 Fase 3
- **Evidencia:** —

### TASK-0029 — Tablero viewer y métricas de equidad

- **Estado:** pendiente
- **Fase:** 2
- **Prioridad:** media
- **Contexto:** Spec §8.5 `GET /tablero?mes=`, §9.2 Viewer, §14 snapshot mensual (`metricas_mes`): viajes del mes, declinaciones, turnos tomados vs ofrecidos por placa (ya se acumulan en `cola_posiciones`).
- **Criterio de done:**
  - [ ] Tablero solo lectura con PII enmascarada
  - [ ] Snapshot mensual reproducible
- **Referencias:** spec §8.5, §9.2, §14
- **Evidencia:** —

### TASK-0030 — Observabilidad y runbooks

- **Estado:** pendiente
- **Fase:** 1-2
- **Prioridad:** media
- **Contexto:** Spec §15: `/readyz` con DB y Redis, métricas (ofertas abiertas, tiempo de respuesta, declinaciones/día, `COLA_LOCKED`, latencia de `ofrecer`), trazas en la transacción de cola, logs sin PII, runbooks completos.
- **Criterio de done:**
  - [ ] OpenTelemetry exportando trazas y métricas
  - [ ] Runbooks en `docs/runbooks/`
- **Referencias:** spec §15; ARCHITECTURE §14
- **Evidencia:** —

### TASK-0031 — PWA completa

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** media
- **Contexto:** Spec §9.1: "Mi turno" instalable; service worker con caché de shell y lectura offline de posición/ofertas; aviso de sin conexión.
- **Criterio de done:**
  - [ ] Lighthouse PWA instalable
  - [ ] E2E de instalación no rompe los flujos actuales
- **Referencias:** spec §9.1, §9.2 Member
- **Evidencia:** —

### TASK-0032 — Build de producción, Dockerfile y despliegue

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Hoy la API corre con `tsx`. Empaquetar con tsup/esbuild, imagen Docker (API + web estática), variables de entorno y despliegue en un VPS o Fly/Render (spec §18). Backups cifrados.
- **Criterio de done:**
  - [ ] `pnpm build` produce artefactos ejecutables sin `tsx`
  - [ ] Despliegue documentado y reproducible
- **Referencias:** spec §18, §15
- **Evidencia:** —

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

- **Estado:** pendiente
- **Fase:** 2
- **Prioridad:** baja
- **Contexto:** Spec §8.5 y §12: `GET /export/viajes.csv` gated por rol, watermark de usuario y fecha, viewer sin PII, member solo lo propio.
- **Criterio de done:**
  - [ ] Test por rol del contenido exportado
- **Referencias:** spec §3.2 export, §12
- **Evidencia:** —

### TASK-0035 — Staging anonimizado y simulacro de restore

- **Estado:** pendiente
- **Fase:** 2
- **Prioridad:** media
- **Contexto:** Spec §15 y §20.8: `scripts/anonymize-staging.ts`, backup continuo y restore en staging < 2 h, trimestral.
- **Criterio de done:**
  - [ ] Procedimiento documentado y ejecutado una vez con evidencia
- **Referencias:** spec §15, §20.8
- **Evidencia:** —

### TASK-0036 — Habeas data: extracto de TR por asociado

- **Estado:** pendiente
- **Fase:** 2
- **Prioridad:** baja
- **Contexto:** Spec §12: el asociado puede pedir extracto de sus TR; propósito, acceso y cancelación.
- **Criterio de done:**
  - [ ] Endpoint y pantalla en "Mi turno"; auditado
- **Referencias:** spec §12
- **Evidencia:** —

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
