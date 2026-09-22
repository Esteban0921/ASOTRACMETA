# ISSUES.md — Backlog de ASOTRACMET

**Próximo ID: TASK-0072** · Reglas de este archivo: RULE-002 a RULE-007 en [AGENTS.md](AGENTS.md).

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
| TASK-0017 | CI GitHub Actions: check, e2e, db                             | 0    | alta      | hecha       |
| TASK-0018 | Documentación: ARCHITECTURE, AGENTS, ISSUES, README, ADR      | 0    | alta      | hecha       |
| TASK-0019 | Adaptador Postgres de `Transaccion` / `UnidadDeTrabajo`       | 1    | crítica   | hecha       |
| TASK-0038 | Capa de consultas: la API deja de leer el estado en memoria   | 1    | crítica   | hecha       |
| TASK-0039 | Seed de Postgres y `pnpm db:seed`                             | 1    | alta      | hecha       |
| TASK-0040 | Anti-replay del código TOTP y límite de retos por usuario     | 1    | baja      | hecha         |
| TASK-0041 | Pantalla superadmin: parámetros y auditoría filtrable         | 1    | media     | hecha         |
| TASK-0020 | Lock Redis `cola:{clase}` con reintento                       | 1    | media     | hecha         |
| TASK-0021 | Auth producto: OTP, 2FA admin, magic link member, revocación  | 1    | alta      | hecha       |
| TASK-0022 | IAM: CRUD usuarios, roles y scope member                      | 1    | alta      | hecha       |
| TASK-0023 | Maestros: CRUD asociados, vehículos, conductores, catálogos   | 1    | alta      | hecha       |
| TASK-0024 | Reset y override de cola auditados (superadmin, 2FA)          | 1    | alta      | hecha       |
| TASK-0025 | Migración controlada desde el Excel + informe de excepciones  | 0-1  | alta      | hecha       |
| TASK-0042 | Puertos del host configurables en `infra/compose.yaml`        | 0    | media     | hecha       |
| TASK-0043 | Soportes HSEQ en object storage (subida de archivos)         | 3    | media     | hecha         |
| TASK-0026 | Notificaciones (in-app, email, WhatsApp opt-in) con outbox    | 1-2  | media     | hecha         |
| TASK-0027 | Viajes, tarifas, recaudo 3% y pantalla finance                | 2    | alta      | hecha         |
| TASK-0028 | HSEQ: documentos, semáforo, habilitaciones, job nocturno      | 3    | alta      | hecha         |
| TASK-0029 | Tablero viewer y métricas de equidad (`metricas_mes`)         | 2    | media     | hecha         |
| TASK-0030 | Observabilidad: OpenTelemetry, métricas, readyz, runbooks     | 1-2  | media     | hecha         |
| TASK-0031 | PWA: service worker, instalable, lectura offline              | 1    | media     | hecha         |
| TASK-0032 | Build de producción de la API, Dockerfile y despliegue        | 1    | alta      | hecha         |
| TASK-0033 | Contrato OpenAPI desde Zod y tipos compartidos con la web     | 1    | baja      | hecha         |
| TASK-0034 | Export CSV por rol con watermark                              | 2    | baja      | hecha         |
| TASK-0035 | Staging anonimizado y simulacro de restore                    | 2    | media     | hecha         |
| TASK-0036 | Habeas data: extracto de TR por asociado                      | 2    | baja      | hecha         |
| TASK-0037 | Bug: cliente web enviaba `content-type: json` sin cuerpo      | 1    | alta      | hecha       |
| TASK-0044 | Sistema de diseño "Llano Abierto": tokens, base, tipografía, marca | 1 | crítica | en_progreso |
| TASK-0045 | Primitivos `ui/*` (Icono, Boton, Chip, Placa, TablaDensa, …)  | 1    | crítica   | en_progreso |
| TASK-0046 | Dialogo, DialogoMotivo, HojaInferior, Drawer y Avisador        | 1    | alta      | en_progreso |
| TASK-0047 | AppShell: navegación única por rol, lazy routes, refresco, reloj | 1 | alta     | pendiente   |
| TASK-0048 | Sala de turnos v2 (paneles, requerimientos, cola, actividad)  | 1    | crítica   | pendiente   |
| TASK-0049 | Mi turno v2 móvil (oferta, posición hero, semáforo, TR)       | 1    | crítica   | pendiente   |
| TASK-0050 | HSEQ, Finanzas, Tablero, Avisos, Login y Entrar sobre el sistema | 1-3 | media   | pendiente   |
| TASK-0051 | Administración, Usuarios, Parámetros y Auditoría sobre el sistema | 1 | media   | pendiente   |
| TASK-0052 | Accesibilidad, rendimiento y regresión visual en CI           | 1    | alta      | pendiente   |
| TASK-0053 | Acta de turno: motor explicable, `esperado`/firma, saltos     | 1    | crítica   | en_progreso   |
| TASK-0054 | Acta de turno: API `/siguiente`, `/acta`, `/me/saltos`, tablero | 1  | crítica   | pendiente   |
| TASK-0055 | Acta de turno: PanelSiguiente, ActaTurno, mis saltos, Saltadas | 1   | alta      | pendiente   |
| TASK-0056 | Acta del mes imprimible para la asamblea                      | 2    | media     | pendiente   |
| TASK-0057 | Alertas proactivas: `cola.proximo`, `documento.bloquea_turno`, `cola.sin_elegibles` | 1-3 | alta | en_progreso |
| TASK-0058 | Reloj de servidor y CuentaRegresiva sincronizada              | 1    | alta      | pendiente   |
| TASK-0059 | Catálogo de motivos de bloqueo HSEQ                           | 3    | media     | en_progreso   |
| TASK-0060 | Tiempo real opcional por SSE con polling de respaldo          | 2    | media     | pendiente   |
| TASK-0061 | `pnpm test:db` solo contra una base de pruebas `*_test`      | 0    | alta      | hecha       |
| TASK-0062 | GPS: ADR-0007, esquema compartido, tabla e ingesta con token  | 4    | media     | hecha       |
| TASK-0063 | GPS: lectura por la API (últimas, ficha), frescura y purga    | 4    | media     | hecha       |
| TASK-0064 | Agente GPS satélite: ciclo de 20 min y adaptador simulado     | 4    | media     | hecha       |
| TASK-0065 | Web: última ubicación en ficha, Mi turno y sala de turnos     | 4    | media     | hecha       |
| TASK-0066 | Historial por placa y mapa de la flota (`/mapa`)              | 4    | baja      | hecha       |
| TASK-0067 | Adaptador GPS real: Vía GPS (`gpsmobile.net`)                 | 4    | media     | bloqueada   |
| TASK-0068 | Adaptador GPS real de la segunda plataforma                   | 4    | baja      | bloqueada   |
| TASK-0069 | Habeas data: supresión de ubicaciones de un vehículo          | 4    | baja      | hecha       |
| TASK-0070 | Aviso `gps.sin_senal` por la outbox                           | 4    | baja      | pendiente   |
| TASK-0071 | Bug: `CodigoTr.tsx` no compila (`data-testid` sobre `resto`)  | 1    | alta      | hecha       |

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

- **Estado:** hecha (2026-09-17)
- **Fase:** 0
- **Prioridad:** alta
- **Contexto:** `.github/workflows/ci.yml` con cuatro jobs: `check` (lint, formato, tipos, build, contrato OpenAPI al día, unit con cobertura), `e2e` (Chromium), `db` (servicios Postgres 16 y Redis 7 → `db:migrate` + `db:seed` + `test:db` + `test:redis`) e `imagen` (build Docker + `/healthz`). Artefactos: cobertura e informe de Playwright.
- **Criterio de done:**
  - [x] Workflow escrito y equivalente a los comandos locales
  - [x] Primer push a GitHub con los cuatro jobs en verde
- **Referencias:** AGENTS RULE-018; ARCHITECTURE §10
- **Evidencia:** Los mismos comandos pasan en local (última corrida completa 2026-09-17: `pnpm check` 234 passed, `pnpm test:db` 28, `pnpm test:redis` 7, `pnpm test:e2e` 16, `pnpm build` e imagen Docker en verde). Primer push 2026-09-17: `git push -u origin main` → `f5d39ef..8ef9f33 main -> main` (14 commits). Run de CI #2 sobre `8ef9f33` (<https://github.com/Esteban0921/ASOTRACMETA/actions/runs/35255029966>): `conclusion: success`, los cuatro jobs en `success`: `Lint · Formato · Tipos · Unit` (57 s), `E2E Playwright` (1 min 04 s), `Migraciones Postgres y lock Redis` (40 s) e `Imagen Docker` (40 s) (leído por la API de GitHub Actions).

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

- **Estado:** hecha (2026-09-17)
- **Fase:** 1
- **Prioridad:** media
- **Contexto:** Spec §7.7: lock distribuido además del advisory lock de Postgres (que ya cubre una sola base con varias instancias de API, porque vive en el servidor), con espera de 2 s y reintento en el cliente web. Prioridad baja mientras haya una sola base; el reintento en la UI sí aporta desde ya.
- **Criterio de done:**
  - [x] Lock con TTL y liberación segura; `COLA_LOCKED` estable
  - [x] Runbook "cola trabada" actualizado
  - [x] Reintento en el cliente web: escritura con `COLA_LOCKED` espera 2 s y reintenta (dos veces)
- **Referencias:** spec §7.7, §15; ARCHITECTURE §5.6, §14; TASK-0019
- **Evidencia:** `apps/api/src/lock-cola.ts`: `conLockDistribuido` envuelve la unidad de trabajo y toma `cola:{clase}` en Redis (`SET NX PX`, token único, `LOCK_TTL_MS` 10 s, liberación compare-and-delete en Lua) antes del advisory lock de Postgres; `COLA_LOCKED` con `details.origen = 'redis'` sin abrir transacción; con Redis caído o mudo (`commandTimeout` 1 s) sigue con Postgres y lo cuenta en `asotracmet_lock_redis_errores_total`. Se activa con `REDIS_URL` (`app.ts`); `ioredis` externo en el bundle. `lock-cola.test.ts` (7 tests): toma/suelta también si falla, ajeno → 409 sin transacción, TTL vence huérfanos, nadie suelta token ajeno, fail-open con Redis caído y con Redis mudo (< 3 s); contra Redis real (`pnpm test:redis`, `REDIS_URL`): dos clientes → uno entra, TTL libera, y la API responde 409 `{origen: redis}` mientras otra instancia tiene la clave y 201 al soltarla. Web: `api()` reintenta escrituras ante `COLA_LOCKED` (2 s, dos veces) y nunca lecturas ni otros códigos (`cliente.test.ts`, 3 tests). Runbook `docs/runbooks/cola-trabada.md` con `PTTL cola:{clase}`; CI job `db` con servicio Redis 7 + `test:redis`. `pnpm check` → 186 passed (2026-09-17); `pnpm test:db` → 27 passed sin y con `REDIS_URL` (lock Redis + Postgres); `pnpm test:e2e` → 15 passed; `pnpm build` en verde.

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

- **Estado:** hecha (2026-09-17)
- **Fase:** 1
- **Prioridad:** baja
- **Contexto:** Descubierto al cerrar TASK-0021 (RULE-007). RFC 6238 recomienda no aceptar dos veces el mismo código dentro de su ventana; hoy un código válido podría reutilizarse durante ~90 s. También conviene limitar los retos de 2FA vivos por usuario para que un atacante con la contraseña no pueda pedir retos sin fin.
- **Criterio de done:**
  - [x] Guardar el último paso TOTP aceptado por usuario y rechazar códigos de pasos ≤ al último
  - [x] Test: el mismo código no entra dos veces
  - [x] Máximo 5 retos de 2FA vivos por usuario (`MAX_RETOS_TOTP`); el sexto responde 429 `DEMASIADOS_INTENTOS`
- **Referencias:** ARCHITECTURE §6.2; TASK-0021
- **Evidencia:** Migración `0015_totp_anti_replay` (`usuarios.totp_ultimo_paso`); `pasoTotpValido` en `auth/totp.ts` devuelve el paso que casa y `ServicioAuth` lo compara con el último aceptado en login y en re-autenticación (memoria y Postgres). `auth/anti-replay.test.ts` (5 tests): el mismo código no entra dos veces y un paso anterior tampoco; el código de entrar no sirve para `reauth` pero el siguiente sí; con cinco retos vivos el sexto da 429 y se libera al resolver uno o al caducar (5 min); el atajo e2e `/__e2e/totp` devuelve el siguiente paso no usado. Los helpers de login de los tests avanzan el reloj fijo 30 s por acceso. `pnpm check` → 178 passed (2026-09-17); `pnpm test:db` → 27 passed (15 migraciones); `pnpm test:e2e` → 15 passed.

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

- **Estado:** hecha (2026-09-17)
- **Fase:** 3
- **Prioridad:** media
- **Contexto:** Descubierto al cerrar TASK-0028 (RULE-007). Hoy `documentos.archivo_url` acepta una URL ya alojada (spec §6.3: el archivo nunca va dentro de la base). Falta el flujo de subida real: bucket S3-compatible (spec §18), URL prefirmada desde la API, límite de tamaño y tipo, y descarga con el rol del actor. Sin claves en la base (spec §12).
- **Criterio de done:**
  - [x] `POST /documentos/:id/soporte` devuelve URL prefirmada (S3) o ruta de la API (local) y `POST .../confirmar` guarda `archivo_url` tras verificar el objeto
  - [x] Tests de API con un almacén S3 falso (`fetch` simulado) y con el almacén local en un directorio temporal; e2e sube un PDF desde `/hseq`
  - [x] Variables `S3_*` y `SOPORTES_DIR` documentadas en `docs/despliegue.md`, ARCHITECTURE §11 y `.env.example`
  - [x] Descarga con el rol del actor (`GET /documentos/:id/soporte`: member solo sus placas) y auditada; límite de 10 MB y tipos PDF/JPG/PNG
- **Referencias:** spec §6.3, §12, §18; ARCHITECTURE §6.12; TASK-0028
- **Evidencia:** Puerto `AlmacenSoportes` (`apps/api/src/soportes/tipos.ts`) con `SoportesS3` (AWS Signature V4 a mano: URL prefirmada de PUT con `content-type` firmado, HEAD firmado por cabecera, URL prefirmada de GET; path-style para MinIO) y `SoportesLocales` (disco, `PUT /soportes/*`, `<clave>.meta.json`). Rutas en `rutas/soportes.ts`; `subirSoporte()` y botón "Descargar" en la ficha de `/hseq`. `soportes/s3.test.ts` (5): reproduce la URL prefirmada del vector oficial de AWS (firma `aeeed9bb…`), codificación RFC 3986, firma por cabecera, MinIO path-style con HEAD/404/403 simulados, AWS virtual-hosted. `soportes.test.ts` (3): pedir → subir → confirmar → `archivoUrl = local://…`, descarga en PDF para hseq y para el asociado dueño, 403 para otro asociado, 401 sin token, auditoría `documento.soporte` y `documento.descargar`; rechazos de tipo, tamaño, clave ajena, cuerpo vacío, traversal (`..%2F`) y rol sin permiso; `archivoUrl` externa → 302. Contrato OpenAPI con las 4 rutas nuevas (`docs/openapi.json`: 80 rutas, 85 esquemas). Infra: `.datos/` ignorado, volumen `soportes` y variables `S3_*` en `compose.prod.yaml`, `/app/datos` del usuario `node` en el `Dockerfile`. `pnpm check` → 234 passed (2026-09-17); `pnpm test:db` → 28 passed; `pnpm test:e2e` → 16 passed (el test de HSEQ sube `soat.pdf` y ve el botón de descarga); imagen Docker construida y arrancada en memoria (healthz, openapi.json, /app/datos escribible por node).

### TASK-0026 — Notificaciones

- **Estado:** hecha (2026-09-17)
- **Fase:** 1-2
- **Prioridad:** media
- **Contexto:** Spec §11: eventos `oferta.abierta`, `oferta.por_expirar`, `oferta.declinada`, `tr.asignado`, `tr.cancelado`, `documento.por_vencer`, `recaudo.pendiente`; canales in-app, email, WhatsApp opt-in; plantillas; outbox simple. WhatsApp es canal, no estado.
- **Criterio de done:**
  - [x] Outbox transaccional y worker (sin BullMQ: la outbox en Postgres es la cola, ADR-0006)
  - [x] Preferencias de canal por usuario
  - [x] Eventos §11: `oferta.abierta`, `oferta.por_expirar`, `oferta.declinada`, `tr.asignado`, `tr.cancelado`, `documento.por_vencer`, `recaudo.pendiente`; canales in-app, correo (SMTP) y WhatsApp (Cloud API) opt-in; plantillas con variables
- **Referencias:** spec §11, §14, §18; ARCHITECTURE §6.11, §12; ADR-0006
- **Evidencia:** Migración `0016_notificaciones` (`notificaciones_outbox`, `notificaciones` con RLS por `app_usuario_id()`, `usuarios.preferencias_notificacion`). El motor escribe el aviso con `tx.notificar` en la misma transacción (`packages/domain/src/notificaciones.test.ts`: el rollback se lleva el aviso, la clave deduplica). `WorkerNotificaciones` (`apps/api/src/notificaciones/`) consume la outbox (`for update skip locked`), resuelve destinatarios por rol/asociado/placa, redacta (`plantillas.ts`) y deja la bandeja por usuario enviando correo/WhatsApp según preferencias; jobs `avisos.ts` idempotentes por clave. Rutas `GET/POST /me/notificaciones`, `GET/PATCH /me/preferencias`, `POST /jobs/notificar`, `POST /jobs/avisos`. Proveedores `mensajeria/proveedores.ts` (SMTP con nodemailer, WhatsApp Cloud API, enrutada; sin configuración cae a consola). Web: `/notificaciones` (bandeja + preferencias) y enlace "Avisos (n)" para todos los roles. Tests: `apps/api/src/notificaciones.test.ts` (5: entrega a bandeja + correo, bandeja personal, leída idempotente; tr.asignado a asociado y ops; declinar avisa a ops; preferencias con validación y auditoría sin PII; canal caído → `fallida`, repositorio caído → reintento y cierre; jobs por tiempo idempotentes), `mensajeria/proveedores.test.ts` (3), dominio (3), Postgres (`api-postgres.test.ts`: outbox en la transacción, RLS de la bandeja, skip locked). `pnpm check` → 197 passed (2026-09-17); `pnpm test:db` → 28 passed (16 migraciones); `pnpm test:e2e` → 16 passed (incluye "el asociado recibe en su bandeja el aviso de su turno, ops el de la declinación, y las preferencias se guardan"); `pnpm build` en verde (`nodemailer` externo). Fuera de alcance: plantillas aprobadas de WhatsApp fuera de la ventana de 24 h (documentado en despliegue.md).

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

- **Estado:** hecha (2026-09-17)
- **Fase:** 1
- **Prioridad:** baja
- **Contexto:** Generar OpenAPI desde los esquemas Zod y derivar los tipos de `apps/web/src/api/tipos.ts` en lugar de mantenerlos a mano.
- **Criterio de done:**
  - [x] `GET /api/v1/openapi.json` (público, OpenAPI 3.1 generado del código) y `docs/openapi.json` regenerado en `pnpm build` (`build:contrato`; CI falla si no está al día)
  - [x] Tipos compartidos: las vistas de respuesta viven en Zod (`packages/shared/src/vistas.ts`); `apps/web/src/api/tipos.ts` solo reexporta sus `z.infer` (nada mantenido a mano)
  - [x] El contrato se prueba: cada ruta registrada en Fastify está documentada y viceversa, y 26 respuestas reales cumplen las vistas
- **Referencias:** ARCHITECTURE §6.4, §7, §10
- **Evidencia:** `apps/api/src/openapi/contrato.ts` (98 entradas: guard, cuerpo/query Zod del handler, vista de respuesta), `documento.ts` (`z.toJSONSchema` 2020-12 → OpenAPI 3.1 con componentes, parámetros de ruta y query, `bearerAuth`, `x-guard`, `x-reauth`, `ErrorApi` en `default`), `GET /api/v1/openapi.json` en `app.ts`, `scripts/openapi.ts` (`pnpm build:contrato` → `docs/openapi.json`, 77 rutas y 81 esquemas). `apps/api/src/openapi.test.ts` (29 tests): rutas registradas ⇔ contrato (`rutasRegistradas` vía `onRoute`), documento sin `$ref` colgantes e idéntico al generado, y `it.each` con 26 respuestas reales validadas contra `vistas.ts` (sesión, cola, ofertas, TR, ficha, documentos, alertas, viajes, tablero, usuarios, notificaciones...). Web: `tipos.ts` pasa de 429 líneas a mano a reexports. Decisión: no se usa `openapi-typescript` porque los tipos ya se derivan de Zod (`z.infer`) sin paso de codegen; `docs/openapi.json` queda para clientes externos. `pnpm check` → 226 passed (2026-09-17); `pnpm test:db` → 28 passed; `pnpm test:e2e` → 16 passed; `pnpm build` en verde (genera el contrato).

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

### TASK-0044 — Sistema de diseño "Llano Abierto": tokens, base, tipografía y marca

- **Estado:** en_progreso
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** El propietario califica la web de "demasiado básica y plana". Un panel de cinco propuestas juzgadas (2026-09-17) eligió la identidad "Llano Abierto": verde profundo del morichal como familia tonal (continuidad con `#0f3d3e`), ocre de amanecer como acento (que además es el ámbar obligatorio de §9.3), papel cálido en vez de gris de dashboard, placas y códigos como objetos tipográficos (`.codigo`, tabular). El color solo significa estado (ámbar oferta abierta, verde TR asignado, rojo cancelado/declinado/intervención, gris no habilitado); la cabeza elegible se marca con marca, no con verde. Modo claro y oscuro con contraste AA verificado por test; una sola fuente variable autohospedada (Inter, latín) precacheada por Workbox, nunca Google Fonts; marca propia en SVG (`componentes/Marca.tsx`) reutilizada en favicon e iconos PWA. Densidades `operacion` (14 px) y `bolsillo` (16 px). Arquitectura CSS: `estilos/tokens.css`, `base.css`, `componentes.css`, `pantallas/*.css`; CSS moderno (nesting, container queries, `color-mix`), cero librerías CSS.
- **Criterio de done:**
  - [ ] `tokens.css` con la tabla de tokens claro/oscuro (fondo, superficie, texto, marca 50-900, acción, ámbar/verde/rojo/gris/info con texto/fondo/borde/sólido, foco, espaciado 4 px, radios, sombras, movimiento, capas) y `base.css` (reset, `color-scheme`, `:focus-visible`, `tabular-nums`, reduced-motion)
  - [ ] Test unitario de contraste WCAG: todo par texto/fondo de tokens ≥ 4,5:1 en ambos modos (corrige `.badge.ambar` 3,4:1 y `.badge.gris` 4,2:1 actuales)
  - [ ] Inter variable en `apps/web/public/fonts` (o paquete npm autohospedado), `font-display: swap`, preload, precacheada
  - [ ] `Marca.tsx` e iconos PWA 192/512 regenerados del mismo símbolo; `theme-color` doble en `index.html`
  - [ ] `pnpm test:e2e` en verde sin tocar marcado; capturas claro/oscuro de `/ops` y `/me` en `docs/ui/`
- **Referencias:** spec §9.1, §9.3; ARCHITECTURE §7; TASK-0045..0052
- **Evidencia:** _(pendiente)_

### TASK-0045 — Primitivos `ui/*`

- **Estado:** en_progreso
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** Hoy cada página compone HTML crudo con clases globales; los estados llegan como enum crudo (`Ops.tsx:237`, `Me.tsx:155`), el badge de Avisos no tiene tono (`Notificaciones.tsx:90`), la elegibilidad usa `title=` inaccesible (`Ops.tsx:181`) y la fila seleccionada de Finanzas usa una clase que no existe (`Finance.tsx:185`). Componentes reutilizables en `apps/web/src/componentes/ui/`: `Icono` (mapa cerrado de paths SVG propios), `Marca`, `Boton` (variantes, tamaños, `cargando`), `Chip`, `ChipElegibilidad` (Tooltip en vez de `title`), `Placa`, `CodigoTr` (copiable con confirmación), `Tarjeta`, `Campo`, `Pestanas` (tablist con teclado), `TablaDensa` (cabecera sticky, scroll interno, fila seleccionada, esqueleto, vacío, tarjetas bajo 560 px), `Tooltip`, `Esqueleto`, `EstadoVacio`, `EstadoError`, `Avatar`, `TileMetrica`, `SelectorTema`. Todos aceptan `data-testid` y lo pasan al control interno.
- **Criterio de done:**
  - [ ] Cada componente con test de Testing Library (roles ARIA, teclado en `Pestanas`, copiar en `CodigoTr`, `Tooltip` por foco y Esc)
  - [ ] Ruta `/dev/ui` solo en `import.meta.env.DEV` con todos los estados
  - [ ] Ningún enum crudo en pantalla: `Chip` siempre con `textoEstado*`
  - [x] `pnpm check` y `pnpm test:e2e` en verde
- **Referencias:** spec §9.3; ARCHITECTURE §7; TASK-0044
- **Evidencia:** _(pendiente)_

### TASK-0046 — Dialogo, DialogoMotivo, DialogoConfirmar, HojaInferior, Drawer y Avisador

- **Estado:** en_progreso
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Los motivos y confirmaciones van por `window.prompt` / `window.confirm` (`Ops.tsx:222`, `Hseq.tsx:495`, `Usuarios.tsx:217`, `Admin.tsx:104`, `Parametros.tsx:188`): no accesibles, no estilizables, no testeables sin `page.once('dialog')`. `Dialogo` sobre `<dialog>` nativo con foco atrapado y Esc; presets `DialogoMotivo` (textarea ≥ 3 caracteres, contador, `data-testid="dialogo-motivo"`) y `DialogoConfirmar` (`dialogo-confirmar` / `dialogo-cancelar`); `HojaInferior` anclada abajo en móvil; `Drawer` lateral de 420 px; `Avisador` + `useAvisar()` (región `aria-live`, cola máx. 3, autocierre). Los mensajes con `data-testid` (`hseq-mensaje`, `finance-mensaje`, `usuarios-mensaje`, `admin-mensaje`, `param-mensaje`, `pref-mensaje`, `error-ops`, `error-me`) se mantienen inline además del toast.
- **Criterio de done:**
  - [ ] `grep -r "window.prompt\|window.confirm" apps/web/src` vacío
  - [ ] En el mismo commit, `e2e/enturnamiento.spec.ts` l. 255 y 381 pasan de `page.once('dialog')` a clic en `dialogo-confirmar`
  - [ ] Tests de `DialogoMotivo` (mínimo 3 caracteres, Esc cancela) y de `Avisador`
  - [ ] `pnpm test:e2e` en verde
- **Referencias:** spec §9.3; TASK-0044, TASK-0045
- **Evidencia:** _(pendiente)_

### TASK-0047 — AppShell: navegación única por rol, rutas lazy, refresco y reloj

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** `Layout.tsx` pinta hasta 10 enlaces planos en la cabecera y el rol crudo (`Layout.tsx:120`); `App.tsx` importa las 12 páginas en el bundle del asociado. `AppShell` monta UNA sola navegación según `useMediaQuery('(min-width: 768px)')` (nunca sidebar y barra inferior ocultas por CSS a la vez: duplicaría `nav-*` y rompe el modo estricto de Playwright): `BarraLateral` de 240 px (grupos Operación / Flota / Recaudo / Gobierno, colapsable a raíl de 64 px), `BarraInferior` de 56 px en móvil y siempre para `member`, `PaginaCabecera` sticky con `IndicadorActualizacion` (`estado-actualizacion`: verde/ámbar/rojo + banda `sin-conexion`), `MenuUsuario` con `textoRol`, enlace "Saltar al contenido", `document.title` por pantalla. `React.lazy` + `Suspense` por ruta. `useRefresco(baseMs)` pausa el polling con la pestaña oculta. `useReloj()` con desfase del servidor (cabecera `date`) para las cuentas regresivas.
- **Criterio de done:**
  - [ ] `nav-*`, `usuario-actual`, `logout`, `sin-conexion` y el texto exacto `Avisos` / `Avisos (n)` conservados; e2e en verde a 1280×720
  - [ ] E2E nuevo a 390×844: member entra y navega por la barra inferior
  - [ ] `vite build` muestra que el chunk de `/me` no incluye Finance/Hseq/Admin
  - [ ] Tests de `useRefresco` (pestaña oculta → `false`) y `useReloj` (desfase)
- **Referencias:** spec §9.1; ARCHITECTURE §7; TASK-0045
- **Evidencia:** _(pendiente)_

### TASK-0048 — Sala de turnos v2

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** Pantalla principal del producto (spec §9.2). Rejilla `320px minmax(0,1fr) 340px` con scroll interno por panel (la sala nunca desplaza la página); < 1000 px pestañas Requerimientos | Cola | Actividad. Requerimientos: botón "Nuevo requerimiento" (`POST /requerimientos` existe y hoy no tiene UI), `TarjetaRequerimiento` con `BarraCupos` y botón `ofrecer-<id>` en un solo clic. Cola: `Pestanas` con contador de elegibles, `cola-cliente` con etiqueta visible, búsqueda por placa/asociado y "solo elegibles" (filtro en cliente sin tocar el orden), `TablaDensa` con `Placa` + nombre completo (§9.3), cabeza con marca y `data-cabeza`, `ChipElegibilidad`, acción "Ver ficha" en `Drawer` (`GET /vehiculos/:id/ficha`), filas que cambian resaltadas; tira de intervenciones siempre visible (§21). Actividad: `LineaTiempo` con `CuentaRegresiva`, `CodigoTr` copiable, "Anular" con `DialogoMotivo`, "Cancelar TR" / "No tramitar" (rutas existentes sin UI); `GET /trs` acotado (`desde`, `limite`). Refresco adaptativo: 4 s con ofertas abiertas, 8 s en reposo.
- **Criterio de done:**
  - [ ] Todos los `data-testid` y textos de la sala intactos (el primer `td` de `cola-fila-*` sigue siendo solo la posición); los 16 e2e en verde
  - [ ] E2E nuevo: ops crea un requerimiento MM desde la web, ofrece, cancela el TR con motivo y ve la reoferta
  - [ ] Semilla de 60 placas (script en `scripts/`) sin scroll de página a 1366×768
  - [ ] axe sin violaciones serias en `/ops`
- **Referencias:** spec §9.2 Ops, §9.3, §21; ARCHITECTURE §7; TASK-0045, TASK-0046, TASK-0047
- **Evidencia:** _(pendiente)_

### TASK-0049 — Mi turno v2 móvil

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** El asociado usa un celular de gama media con datos móviles (spec §9.1 PWA). Densidad `bolsillo`, 360 px primero. Orden: `OfertaCard` (Tarjeta ámbar a sangre con `CuentaRegresiva` de 64 px, "Te tocó porque: …" cuando exista el acta, botón `aceptar-oferta` ancho completo, bloque de declinación siempre visible con `motivo-declinacion` y `nota-declinacion` — el e2e selecciona sin abrir nada —, botones deshabilitados sin red), posición por placa (número `--t-display`, `MedidorPosicion`, `ChipElegibilidad` propia con enlace a Mis documentos, "Eres el siguiente"; `mi-posicion` conserva literalmente `Tu posición: N de M en CLASE · PLACA`), Mis documentos como `Semaforo`, Mis TR con `CodigoTr`, Tus datos. Al llegar una oferta: `navigator.vibrate`, `document.title`, toast. Polling 15 s con pausa por visibilidad.
- **Criterio de done:**
  - [ ] E2E de member y de PWA offline en verde; `mi-posicion` con el texto literal
  - [ ] Viewport 360×640 sin scroll horizontal; objetivos táctiles ≥ 44 px (Aceptar/Declinar 52 px)
  - [ ] Chunk de `/me` + shell ≤ 120 KB gzip (límite en el build)
  - [ ] Lighthouse móvil: rendimiento ≥ 90, accesibilidad ≥ 95
- **Referencias:** spec §9.1, §9.2 Member, §9.3; TASK-0045, TASK-0046, TASK-0047, TASK-0058
- **Evidencia:** _(pendiente)_

### TASK-0050 — HSEQ, Finanzas, Tablero, Avisos, Login y Entrar sobre el sistema

- **Estado:** pendiente
- **Fase:** 1-3
- **Prioridad:** media
- **Contexto:** Migrar las pantallas secundarias al sistema de diseño. HSEQ: maestro-detalle con `TablaDensa` + `Semaforo`, ficha con `Pestanas` Documentos / Habilitaciones (interruptores con `DialogoMotivo`) / Conductores, zona de arrastre para soportes, renovación por fecha con `DialogoConfirmar`. Finanzas: TR sin viaje como tarjetas, tabla con fila seleccionada visible y `button` en celda (no `tr onClick`), ficha en `Drawer`, resumen con `TileMetrica`, polling 30 s. Tablero: `TileMetrica`, `BarraEquidad` en la celda "Tomó" (texto `100 %` intacto), esqueleto al cargar (hoy no pinta nada). Avisos: agrupados por día, `Chip` por evento, "Marcar todas", fecha con `formatearFechaHora` (elimina el duplicado sin `timeZone` de `Notificaciones.tsx:10-18`). Login/Entrar: pantalla dividida con `Marca`, ilustración SVG y lema "La cola es de todos"; modo oscuro.
- **Criterio de done:**
  - [ ] `hseq-*`, `ficha-*`, `doc-*`, `hab-*`, `finance-*`, `tablero-*` (nth 1/2/5 intactos), `aviso-*`, `pref-*`, `login-*`, `entrar-*` conservados; e2e en verde
  - [ ] Capturas claro/oscuro en `docs/ui/`
- **Referencias:** spec §9.2; TASK-0044..0047
- **Evidencia:** _(pendiente)_

### TASK-0051 — Administración, Usuarios, Parámetros y Auditoría sobre el sistema

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** media
- **Contexto:** Administración: override como "Mover <placa> antes de <placa>" con vista previa del orden leída de la API (se elimina la lista numérica "Nueva posición", que parece editar `posicion`, §9.3) y reset en pasos numerados con `DialogoConfirmar`. Usuarios: `Campo`, chips de placas elegidas sobre el `<select multiple>` (el e2e hace `selectOption`), cambio de rol con `DialogoConfirmar`. Parámetros: tarjetas por grupo (Cola, Ofertas, Recaudo, Avisos), etiquetas legibles de políticas, diff en `DialogoConfirmar`. Auditoría: filtros como `Campo`, acción y actor traducidos (`textoAccionAudit`), antes/después como chips, JSON con scroll.
- **Criterio de done:**
  - [ ] `admin-*`, `override-*`, `reset-*`, `usuario-*`, `param-*`, `audit-*` conservados; textos `120 → 90` y `Reset de cola` intactos; e2e en verde
  - [ ] Ningún control numérico de posición en `/admin`
- **Referencias:** spec §9.2 Superadmin, §9.3; TASK-0044..0047
- **Evidencia:** _(pendiente)_

### TASK-0052 — Accesibilidad, rendimiento y regresión visual en CI

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Que el rediseño no se degrade: `@axe-core/playwright` sobre `/login`, `/ops`, `/me`, `/hseq`, `/finance`, `/tablero`, `/notificaciones`, `/admin` en claro y oscuro; test de teclado en la sala (tablist, Tooltip, Dialogo); test de contraste de tokens dentro de `pnpm check`; límite de tamaño por chunk que rompe el build; Lighthouse CI móvil para `/me` y `/ops`; `toHaveScreenshot` a 390×844 y 1280×720 con máscaras sobre relojes y umbral 0,2 % en el job `e2e`.
- **Criterio de done:**
  - [ ] axe sin violaciones serias/críticas en las ocho rutas y dos modos
  - [ ] Lighthouse móvil `/me` y `/ops`: rendimiento ≥ 90, accesibilidad ≥ 95, en CI
  - [ ] Capturas de referencia versionadas y comparadas en CI
- **Referencias:** AGENTS RULE-017, RULE-018; ARCHITECTURE §10; TASK-0044..0051
- **Evidencia:** _(pendiente)_

### TASK-0053 — Acta de turno: motor explicable, `esperado` + firma y saltos persistidos

- **Estado:** en_progreso
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** Innovación elegida por el panel (2026-09-17): quién sigue, por qué y a quién se saltó, antes y después de ofrecer. Hoy `siguienteElegible` (`motor-cola.ts:647-697`) calcula `descartes[placa] = motivo` y los tira salvo en `COLA_VACIA`; `oferta.crear` audita la oferta a secas. Dominio: `evaluarCola(posiciones, ctx) → { candidato, descartes, penalizadas }` pura en `elegibilidad.ts`; `siguienteElegible` devuelve `{ candidato, descartes }`; `previsualizarOferta(requerimientoId, actor)` de solo lectura (sin lock); `firmaCola` (FNV-1a pura sobre `vehiculoId:ciclo:saltosPendientes:turnosOfrecidos` + ofertas abiertas); `ofrecer` acepta `esperado: { vehiculoId, firma }` y, si la cola cambió, lanza `CANDIDATO_CAMBIO` (409) **antes** de `consumirSaltos` y sin auditar; `crearOferta` persiste los descartes con `tx.guardarSaltos` en la misma transacción; `oferta.crear.after` incluye `claseCola`, `clienteId`, `posicionElegida`, `descartes`, `firma` y `parametrosAplicados`. Puertos: `Transaccion.guardarSaltos`, `Consultas.saltosDeOferta`, `saltosDeVehiculos`, `saltosPorClase`. Migración `0017_oferta_saltos.sql` (append-only, unique `(oferta_id, vehiculo_id)`, índices por vehículo y oferta, trigger inmutable, RLS: member solo sus placas). El frontend sigue sin decidir (RULE-010): afirma lo que vio y el motor verifica.
- **Criterio de done:**
  - [ ] Tests de dominio: `evaluarCola` devuelve descartes en orden con motivo y detalle; con la semilla SPS413 sale saltada por `VEHICULO_NO_HABILITADO` y FST189 elegida; `esperado` equivocado → `CANDIDATO_CAMBIO` sin oferta, sin saltos consumidos y sin audit; `COLA_VACIA` conserva descartes; la oferta crea N saltos; `firmaCola` cambia con el orden, una oferta abierta o un salto pendiente
  - [ ] Adaptadores memoria y Postgres; `pnpm test:db` en verde (RLS y append-only de `oferta_saltos`)
  - [ ] `CANDIDATO_CAMBIO` en `codigos-error.ts`; ARCHITECTURE §5.5 y §8 actualizados
- **Referencias:** spec §7.2, §7.3, §7.7, §21; AGENTS RULE-010, RULE-011, RULE-014, RULE-016; TASK-0054, TASK-0055
- **Evidencia:** _(pendiente)_

### TASK-0054 — Acta de turno: API y contrato

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** crítica
- **Contexto:** `GET /requerimientos/:id/siguiente` (`ofertas R`, no member; caché de 1,5 s por clase+cliente) → `VistaSiguiente { candidato, descartes, firma, cuposDisponibles, calculadoEn }`; `POST /requerimientos/:id/ofertas` acepta `OfrecerSchema { esperado? }`; `GET /ofertas/:id/acta` (member solo si es suya o está en los saltos, con los saltos ajenos reducidos a conteo; viewer con etiqueta enmascarada); `GET /me/saltos?desde&hasta` (own, bajo la caché NetworkFirst `/me/*`); `GET /colas/:clase/saltos?mes`; `tablero/calcular.ts` con `saltadas` y `saltadasPorMotivo`; migración `0018_metricas_saltos.sql`. Vistas Zod en `packages/shared/src/vistas.ts`; contrato OpenAPI regenerado.
- **Criterio de done:**
  - [ ] Tests de API: viewer lee el acta enmascarada; member solo sus saltos + agregado; hseq no lee `/siguiente`; 20 `POST …/ofertas` paralelos con la misma firma → una gana y el resto `CANDIDATO_CAMBIO` o `COLA_LOCKED`
  - [ ] `openapi.test.ts` en verde y `docs/openapi.json` al día
  - [ ] Mismas vistas en memoria y Postgres (`api-postgres.test.ts`)
- **Referencias:** spec §8.4, §8.5, §3.2; ARCHITECTURE §6.4, §6.7; TASK-0053
- **Evidencia:** _(pendiente)_

### TASK-0055 — Acta de turno: web

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** `PanelSiguiente` en cada requerimiento ("Saldrá FST189 · ASOCIADO 02 · se salta SPS413: no habilitada para HLB"; estados esqueleto / "Nadie elegible: …" / sin cupos); `ofrecer-<id>` envía `esperado` desde el panel ya cargado (si aún no cargó, ofrece sin `esperado`); ante `CANDIDATO_CAMBIO` invalida `cola` y `siguiente`, resalta la nueva cabeza y avisa ("La cola cambió: ahora sigue TKM221"); el cliente no reintenta ese 409 (test). `ActaTurno` en `Drawer` desde `oferta-abierta`, `tr-item`, `aviso-oferta.abierta` y Tablero. Mi turno: sección `mis-saltos` con `textoSalto` en lenguaje llano y enlace a Mis documentos si el motivo es documental; `/me/historial` como `LineaTiempo`. Tablero: columna "Saltadas" como 10.ª celda (nth 1/2/5 intactos) y barras por motivo.
- **Criterio de done:**
  - [ ] E2E nuevo: superadmin crea por API un member para `a-01` con `veh-SPS413`; ops ve "Saldrá FST189" y "SPS413" antes de ofrecer, ofrece y lee el acta; el member ve en `mis-saltos` "No habilitada para HLB"; los e2e existentes intactos
  - [ ] Tests de `PanelSiguiente`, `textoSalto` y no-reintento de `CANDIDATO_CAMBIO`
- **Referencias:** spec §9.2, §9.3, §21; TASK-0048, TASK-0049, TASK-0054
- **Evidencia:** _(pendiente)_

### TASK-0056 — Acta del mes imprimible para la asamblea

- **Estado:** pendiente
- **Fase:** 2
- **Prioridad:** media
- **Contexto:** `GET /colas/:clase/acta-mes?mes` (`cola R`, JSON) y `GET /export/acta-mes.html?clase&mes` (`export A`, HTML imprimible con la misma marca de agua que el CSV, auditado `export.acta_mes`): equidad con "saltada por motivo", intervenciones con motivo y TR del mes. `ActaMes.tsx` en `/libro/:clase/acta` con `@media print`, botones Imprimir y Descargar; botón "Acta del mes" en Tablero. Sin cadena de hashes ni compartir por WhatsApp (§21).
- **Criterio de done:**
  - [ ] Test de API: export auditado; viewer con PII enmascarada
  - [ ] E2E: el veedor abre el acta del mes y ve "Saltadas"
  - [ ] Captura de impresión en `docs/ui/`
- **Referencias:** spec §9.2 Viewer, §21; TASK-0034, TASK-0054, TASK-0055
- **Evidencia:** _(pendiente)_

### TASK-0057 — Alertas proactivas por outbox

- **Estado:** en_progreso
- **Fase:** 1-3
- **Prioridad:** alta
- **Contexto:** Tres avisos nuevos sobre la outbox y el job de avisos existentes (`notificaciones/avisos.ts`, claves idempotentes): `cola.proximo:{vehiculoId}:{ciclo}` cuando una placa entra en las primeras N posiciones elegibles ("Estás de 2.º: alista el vehículo"; parámetro `aviso_proximo_turno_posiciones`, default 2, con Zod y test); `documento.bloquea_turno:{vehiculoId}:{documentoId}:{ciclo}` al asociado y a admin_hseq cuando una placa en posición ≤ 3 tiene un documento bloqueante vencido; `cola.sin_elegibles:{requerimientoId}:{fecha}` a admin_ops y admin_hseq cuando un requerimiento con cupo no tiene candidato. Plantillas sin PII más allá de la placa; la de `oferta.abierta` añade "Te tocó porque: …". Check de `notificaciones_outbox.evento` ampliado; `param-aviso_proximo_turno_posiciones` en Parámetros.
- **Criterio de done:**
  - [ ] Tests en `notificaciones.test.ts`: top-2 recibe `cola.proximo` una vez por ciclo; SOAT vencido en posición 3 avisa a asociado y HSEQ; requerimiento con cupo y sin elegibles avisa a ops y HSEQ
  - [ ] `pnpm test:db` con el check ampliado
  - [ ] Parámetro nuevo auditado en `PATCH /parametros` y editable desde la web
- **Referencias:** spec §10, §11, §14; AGENTS RULE-012; TASK-0026, TASK-0028
- **Evidencia:** _(pendiente)_

### TASK-0058 — Reloj de servidor y CuentaRegresiva sincronizada

- **Estado:** pendiente
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** "A mí me marcaba que aún tenía tiempo": la cuenta regresiva de la oferta debe ser la misma en la sala y en el celular. `useReloj()` (un solo `setInterval`) calcula el desfase con la cabecera `date` de las respuestas de `api()` (mismo origen, sin peticiones nuevas) y avisa si supera 5 min. `CuentaRegresiva` (anillo SVG + mm:ss, verde > 15 min, ámbar ≤ 15, rojo ≤ 5, `role=timer`, anuncios `aria-live` en 15/5/1, "Expirada") en la sala y en `OfertaCard`.
- **Criterio de done:**
  - [ ] Test con reloj falso: desfase +90 s, cambio de tono 15/5, anuncio `aria-live`, "Expirada"
  - [ ] Sin peticiones adicionales a la API
- **Referencias:** spec §9.2 Member, §9.3; TASK-0047, TASK-0049
- **Evidencia:** _(pendiente)_

### TASK-0059 — Catálogo de motivos de bloqueo HSEQ

- **Estado:** en_progreso
- **Fase:** 3
- **Prioridad:** media
- **Contexto:** `motivoBloqueo` de las habilitaciones es texto libre; en el acta de turno el `detalle` de un salto podría arrastrar datos sensibles (p. ej. tipos de documento médico). Catálogo de motivos de bloqueo (tabla o parámetro) con `hab-*` como select + nota; el `detalle` del acta nunca contiene datos clínicos.
- **Criterio de done:**
  - [ ] Catálogo con Zod, seed y migración; `PUT /vehiculos/:id/habilitaciones/:clienteId` exige motivo del catálogo
  - [ ] Test: el `detalle` del salto no incluye tipos de documento médicos
- **Referencias:** spec §6.3, §12; TASK-0023, TASK-0053
- **Evidencia:** _(pendiente)_

### TASK-0060 — Tiempo real opcional por SSE con polling de respaldo

- **Estado:** pendiente
- **Fase:** 2
- **Prioridad:** media
- **Contexto:** Solo tras TASK-0044..0058. `GET /api/v1/eventos` por SSE (LISTEN/NOTIFY sin PII, replay por `Last-Event-ID`, filtro por rol y placas), la web invalida las consultas afectadas y el `IndicadorActualizacion` pasa a "En vivo"; si el stream cae, vuelve al polling. Requiere enriquecer `oferta.crear.after` con `claseCola` (lo hace TASK-0053) y extender `openapi/documento.ts` para rutas de stream.
- **Criterio de done:**
  - [ ] Test de API: member no recibe eventos ajenos
  - [ ] E2E existente en verde con polling a 60 s (configuración de test gateada como RULE-023)
  - [ ] Runbook en ARCHITECTURE §14; nada empeora si el stream cae
- **Referencias:** spec §5.1, §15; ARCHITECTURE §12; TASK-0053
- **Evidencia:** _(pendiente)_

### TASK-0061 — `pnpm test:db` solo contra una base de pruebas `*_test`

- **Estado:** hecha (2026-09-18)
- **Fase:** 0
- **Prioridad:** alta
- **Contexto:** `infra/postgres/api-postgres.test.ts` trunca ofertas, TR, requerimientos, cola, viajes y recaudos (`truncate … cascade`) y vuelve a sembrar la semilla anonimizada. El 2026-09-18 una corrida con el `DATABASE_URL` del `.env` local (base `asotracmet`, con el Excel legado cargado en TASK-0025) borró 265 viajes, 265 TR, 257 recaudos y la cola del TURNERO. Se restauró con `pnpm db:migrate-xlsx` (carga repetible por UUID v5) tras un `pg_dump` de respaldo. Los tests deben rechazar cualquier base que no sea de pruebas (RULE-021: los datos reales no se pisan por descuido).
- **Criterio de done:**
  - [x] `infra/postgres/base-pruebas.ts`: `urlBasePruebas()` lee `DATABASE_URL_TEST` (precedencia) o `DATABASE_URL` y lanza si el nombre de la base no termina en `_test`; los tres tests del proyecto `db` la usan
  - [x] Test unitario de la guardia que corre sin Postgres (`base-pruebas.test.ts`)
  - [x] CI (`ci.yml`: `POSTGRES_DB` y `DATABASE_URL` → `asotracmet_test`), `.env.example` (`DATABASE_URL_TEST`) y el arranque rápido de AGENTS.md actualizados
- **Referencias:** AGENTS RULE-018, RULE-021; ARCHITECTURE §10; TASK-0025, TASK-0039
- **Evidencia (2026-09-18):** `DATABASE_URL_TEST=postgres://…/asotracmet_test pnpm exec vitest run --project db` → 4 archivos, 30 passed. Con `DATABASE_URL=postgres://…/asotracmet` (base de desarrollo) → falla en el arranque con «solo corre contra una base cuyo nombre termine en "_test"» y la base queda intacta (265 viajes, 52 posiciones). Restauración previa: `pnpm db:migrate-xlsx` → «Carga confirmada: 265 TR, 257 recaudos, 33 usuarios»; cabeza TM-CBZ = TGM586 (orden del TURNERO). `pnpm exec eslint infra/postgres` ✓.

### TASK-0062 — GPS: decisión, esquema compartido, tabla de ubicaciones e ingesta con token

- **Estado:** hecha (2026-09-22)
- **Fase:** 4
- **Prioridad:** media
- **Contexto:** La asociación necesita ver dónde está cada tractocamión. Las plataformas de GPS de
  los propietarios no tienen API pública y cada propietario tiene su usuario y su clave. La spec
  §2 (línea 66) declara la telemetría GPS en vivo como no-objetivo del MVP y §19 Fase 4 admite las
  integraciones GPS «como satélites»; §12 (línea 777) y el criterio §20.9 prohíben persistir
  claves de terceros. Por RULE-001 esta tarea decide explícitamente el cambio de alcance en
  `docs/adr/0007-ubicacion-gps-por-agente-satelite.md`: entra «última ubicación periódica por
  agente satélite», las claves siguen fuera de la base (archivo de secretos montado solo en el
  agente) y la API solo recibe posiciones ya normalizadas. Esta tarea entrega la decisión, el
  lenguaje compartido, la tabla con RLS y la ruta de ingesta; leer y pintar son TASK-0063/0065.
- **Criterio de done:**
  - [x] ADR-0007 con decisión, alternativas descartadas (claves cifradas en la base, job dentro de
        la API, navegador por defecto) y consecuencias (excepción a RULE-022, rol RLS `gps_ingesta`,
        sin auditoría por lote, prerrequisito de autorización del propietario)
  - [x] Spec §2 y §19 anotadas con el cambio de alcance; criterio nuevo §20.11 («un viewer no
        obtiene coordenadas; un member no obtiene ubicación ajena»); §12 y §20.9 intactas
  - [x] `packages/shared`: `FRESCURAS_GPS` en `estados.ts`, `gps.ts` con los esquemas `.strict()`
        del lote y `frescuraDe`, cuatro parámetros `gps_*` con default, Zod y test
  - [x] Migración `0021_vehiculo_ubicaciones.sql`: tabla con `unique (vehiculo_id, capturada_en)`,
        RLS forzada (member solo sus placas, inserción solo `gps_ingesta`, borrado `sistema`/
        `superadmin`), `revoke update`, defaults de los parámetros; ninguna columna de credenciales
  - [x] `RepositorioUbicaciones` con adaptador en memoria y Postgres, enganchado en `Almacenamiento`
  - [x] `POST /api/v1/gps/ubicaciones` con token de servicio (comparación timing-safe), rate limit,
        contexto RLS `gps_ingesta`, idempotente por `(placa, capturadaEn)`, ignora placas
        desconocidas, vehículos inactivos y capturas futuras, y responde `intervaloMinutos`
  - [x] Test de API (401 sin token y con token malo, lote repetido no duplica, ignorados contados,
        rate limit, log sin coordenadas ni token) y test de base (RLS por rol, unique, privilegios)
  - [x] `pnpm check` y `pnpm test:db` en verde; `docs/openapi.json` regenerado; ARCHITECTURE.md
        actualizado (RULE-024)
- **Referencias:** spec §2, §12, §19, §20.9; ARCHITECTURE §6.13, §8, §11, §12; AGENTS RULE-001,
  RULE-012, RULE-021, RULE-022, RULE-025; ADR-0005, ADR-0006; TASK-0071 (desbloqueó la verificación)
- **Evidencia (2026-09-22):** `pnpm exec vitest run --project shared --project domain
  --project api` → 32 archivos, 266 passed (2 skipped), con `gps.test.ts` (20 casos: token de
  servicio, idempotencia, descartes contados, log sin PII) y `openapi.test.ts` validando la
  respuesta real contra la vista compartida. `DATABASE_URL_TEST=…/asotracmet_test pnpm test:db`
  → 6 archivos, 41 passed, incluida `vehiculo-ubicaciones.test.ts`: ninguna columna de
  credenciales, unicidad por placa e instante, `distinct on` devuelve la última, la purga
  conserva la última de cada placa, RLS (`gps_ingesta` inserta ubicaciones pero no cola;
  `sistema` no inserta; member solo lee las suyas y no escribe) y `asotracmet_app` sin UPDATE.
  La primera corrida de `test:db` falló por una carrera entre dos suites que aplicaban la misma
  migración a la vez; con 0021 ya aplicada, verde. `pnpm check` completo en verde: 38 archivos, 400 passed (41 skipped, los de base sin
  `DATABASE_URL`), lint 0 errores, «All matched files use Prettier code style!».
  `DATABASE_URL_TEST=…/asotracmet_test pnpm test:db` → 6 archivos, 41 passed. `pnpm test:e2e`
  → 16 passed. `pnpm build:contrato` → «83 rutas, 89 esquemas (v1.1.0)». Commit `a8687e5` en la rama
  `task/TASK-0062-gps-ingesta`.

### TASK-0063 — GPS: lectura por la API (últimas, ficha), frescura y purga

- **Estado:** hecha (2026-09-22)
- **Fase:** 4
- **Prioridad:** media
- **Contexto:** Con las ubicaciones ya guardadas (TASK-0062), la API debe exponerlas con el mismo
  reparto de permisos que el resto de la flota (spec §3.2): los roles internos ven la posición
  exacta, el `member` solo sus placas y el `viewer` (`R*`) solo la frescura, sin coordenadas. La
  frescura se calcula en el servidor con el reloj de la API y los parámetros, no en el navegador.
  Incluye la purga por retención, que es lo que impide que la tabla crezca sin control.
- **Criterio de done:**
  - [x] `VistaUbicacionSchema` en `vistas.ts` y `ubicacion` en la ficha del vehículo
  - [x] `GET /api/v1/vehiculos/ubicaciones` con scope `own` y enmascarado del veedor
  - [x] La ficha enmascara la ubicación igual que las demás sub-vistas (el veedor la alcanza)
  - [x] Purga por `gps_retencion_dias` conservando la última captura de cada placa, en el job
        diario y por `POST /api/v1/jobs/purgar-ubicaciones` (auditado)
  - [x] `/metrics` expone `asotracmet_gps_ultimo_lote_segundos` y `asotracmet_gps_placas_sin_senal`
  - [x] `GET /me/extracto` menciona la ubicación y su retención (habeas data, spec §12)
  - [x] Tests de API por rol (viewer sin coordenadas en lista y ficha, member solo sus placas) y
        `pnpm test:db` con RLS; `docs/openapi.json` regenerado
- **Referencias:** spec §3.2, §12; ARCHITECTURE §6.4, §6.13, §12; TASK-0062
- **Evidencia (2026-09-22):** siete casos nuevos en `apps/api/src/gps.test.ts`: un rol interno
  ve las tres placas con coordenadas; `member.fst189` solo `FST189` y `TKM221`, nunca `SWI750`;
  el veedor recibe `enmascarada: true` con latitud, longitud y velocidad en nulo, en la lista y
  en la ficha de `FST189`; la frescura pasa de `reciente` a `desactualizada` (45 min) y a
  `sin_senal` (5 h) moviendo solo el reloj del servidor; la purga con `gps_retencion_dias: 1`
  borra la lectura vieja, conserva las tres últimas y deja `gps.purgar` en `GET /audit`; un
  coordinador recibe 403 al dispararla. `pnpm check` completo en verde: 38 archivos, 400 passed (41 skipped, los de base sin
  `DATABASE_URL`), lint 0 errores, «All matched files use Prettier code style!».
  `DATABASE_URL_TEST=…/asotracmet_test pnpm test:db` → 6 archivos, 41 passed. `pnpm test:e2e`
  → 16 passed. `pnpm build:contrato` → «83 rutas, 89 esquemas (v1.1.0)». Commit `a8687e5` en la rama
  `task/TASK-0062-gps-ingesta`.

### TASK-0064 — Agente GPS satélite: ciclo de 20 minutos, cuentas en archivo de secretos y adaptador simulado

- **Estado:** hecha (2026-09-22)
- **Fase:** 4
- **Prioridad:** media
- **Contexto:** El proceso que entra a las plataformas de GPS corre aparte de la API (spec §19
  «satélites»): así el archivo con las claves de los propietarios solo se monta en su contenedor
  (RULE-021) y una plataforma caída o lenta no toca la cola. Se empaqueta como un script más de la
  imagen existente (`dist/scripts`), con la lógica probada en `apps/api/src/gps/agente/` y un
  cerco de ESLint que le impide importar Fastify, pg o Redis. El adaptador `simulado` permite
  probar el circuito completo antes de conocer las plataformas reales (TASK-0067/0068).
- **Criterio de done:**
  - [x] Ciclo reentrante que relee el archivo de cuentas, consulta por cuenta con timeout, envía un
        lote por cuenta y adopta el intervalo que devuelve la API
  - [x] Backoff por cuenta ante credenciales inválidas (no se repite el login que puede bloquear la
        cuenta del propietario) y verificación del token con un lote vacío antes de consultar
  - [x] Log estructurado con lista blanca de campos: test que afirma que no aparecen usuario,
        clave, token ni coordenadas
  - [x] Servicio `gps-agente` en `infra/compose.prod.yaml` (perfil `gps`, sin puertos, solo
        lectura, con el archivo de cuentas montado `:ro`), `.env.example` y `docs/despliegue.md`
  - [x] `docs/runbooks/gps-agente.md` indexado en `docs/runbooks/README.md` y ARCHITECTURE §14
  - [ ] Los términos y condiciones de asociado mencionan la ubicación del vehículo, su finalidad,
        su retención y cómo pedir la supresión (la autorización sale de ahí, ADR-0007). **No es
        código:** lo revisa la asociación; el extracto de habeas data y el ADR ya lo describen
  - [x] `pnpm check` en verde y prueba manual con el adaptador simulado contra la API local
- **Referencias:** spec §12, §19; ARCHITECTURE §3, §11, §12, §14; AGENTS RULE-019, RULE-020,
  RULE-021; ADR-0007; TASK-0062, TASK-0067
- **Evidencia (2026-09-22):** 20 casos en `apps/api/src/gps/agente/agente.test.ts`, todos con
  dobles (ni red, ni reloj real, ni credenciales): el ejemplo versionado
  `infra/gps-cuentas.example.json` valida y trae las 17 placas de la semilla; un archivo con
  formato inválido falla sin mencionar usuario ni clave; avisa si los permisos no son 0400; el
  proveedor simulado es determinista por placa y ventana; el ciclo comprueba el token con un
  lote vacío antes de consultar nada y, si la API lo rechaza, no toca ninguna plataforma; manda
  un lote por cuenta y adopta el `intervaloMinutos` de la respuesta; respeta la lista de placas
  de la cuenta; una plataforma caída no impide que las demás entreguen; unas credenciales
  inválidas apartan la cuenta varios ciclos (un fallo pasajero se reintenta en el siguiente); si
  el archivo desaparece no se reutilizan las credenciales anteriores; el log no contiene
  usuario, clave, placas ni coordenadas; el cliente reintenta una vez ante caída de red y ni una
  ante token rechazado; el bucle programa la vuelta siguiente, no solapa dos y deja de programar
  al detenerse.
  **Prueba manual de punta a punta (2026-09-22):** API en memoria en el puerto 3099 y
  `GPS_CUENTAS_ARCHIVO=infra/gps-cuentas.example.json GPS_PROVEEDOR_FORZADO=simulado pnpm gps:agente`
  → el log del agente muestra «ciclo terminado» con `cuentas: 3, consultadas: 3, enviadas: 3,
  recibidas: 17, guardadas: 17`; `GET /api/v1/vehiculos/ubicaciones` como coordinador devuelve
  las 17 placas con coordenadas y `frescura: reciente`; como veedor, las mismas 17 con cero
  coordenadas; `/metrics` muestra `asotracmet_gps_lotes_total 4`,
  `asotracmet_gps_ubicaciones_total{resultado="guardadas"} 17` y
  `asotracmet_gps_ultimo_lote_segundos 9`; una segunda corrida del agente devuelve
  `duplicadas: 17` y `guardadas: 0` (idempotencia real). Corregido de paso un fallo que la
  prueba destapó: la métrica recorría todo el resultado de la ingesta y acababa concatenando el
  identificador del lote; ahora solo cuenta guardadas, duplicadas e ignoradas.
  `pnpm build:scripts` → `dist/scripts/gps-agente.mjs` (51,4 kb, sin `fastify` ni `pg` dentro).
  `docker compose -f infra/compose.prod.yaml --profile gps config` válido. `pnpm check` → 39
  archivos, 420 passed (41 skipped), lint 0 errores, formato limpio. `pnpm test:db` → 41 passed.
  `pnpm test:e2e` → 16 passed.

### TASK-0065 — Web: última ubicación en ficha HSEQ, Mi turno y sala de turnos

- **Estado:** hecha (2026-09-22)
- **Fase:** 4
- **Prioridad:** media
- **Contexto:** La ubicación solo sirve si se ve donde se trabaja: la ficha del vehículo (HSEQ), la
  sala de turnos y «Mi turno» del asociado. Un componente autocontenido (`UltimaUbicacion`)
  minimiza el conflicto con el rediseño en curso (TASK-0048/0049/0050), que al empezar esta
  tarea todavía no había reescrito ninguna de las tres pantallas. El veedor no recibe
  coordenadas de la API, así que la UI no puede enlazar a un mapa externo para ese rol.
- **Criterio de done:**
  - [x] `textoHace`, `tonoFrescura` y `urlMapaExterno` en `utils/formato.ts` con test
  - [x] `UltimaUbicacion` con chip de frescura, «hace X min» y enlace externo solo si no está
        enmascarada; «Sin GPS» cuando no hay lecturas
  - [x] Integrado en ficha HSEQ, sala de turnos y Mi turno, con refresco de 60 s
  - [x] E2E: ops ve la ubicación, el asociado solo las suyas, el veedor ningún enlace con coordenadas
  - [x] `pnpm check` y `pnpm test:e2e` en verde
- **Referencias:** spec §9, §3.2; ARCHITECTURE §7; ADR-0007; TASK-0063, TASK-0048, TASK-0050
- **Evidencia (2026-09-22):** componente `apps/web/src/componentes/UltimaUbicacion.tsx` con dos
  variantes (completa en la ficha y en Mi turno, chip en las listas), integrado en la ficha de
  HSEQ, en la lista de la flota, en la fila de la cola de la sala de turnos y en un bloque «Tu
  camión» de Mi turno, todos con refresco de 60 s (el dato cambia cada 20 min, no cada 4 s).
  Cinco casos nuevos en `UltimaUbicacion.test.tsx`: pinta estado, «hace X» y enlace al mapa; con
  la ubicación enmascarada no pinta coordenadas ni enlace; una placa sin lecturas dice «Sin GPS»
  en vez de parecer un error; distingue reporte atrasado de sin señal; `textoHace` redacta
  minutos, horas y días. E2E nuevo `e2e/ubicaciones.spec.ts` (3 casos, navegador real): el
  coordinador ve «Reportando» en la cola; el asociado ve sus dos placas con enlace al mapa y
  `SWI750` no aparece; el veedor ve «Reportando» y la página no contiene **ningún** enlace a
  Google Maps. `pnpm check` → 40 archivos, 425 passed (41 skipped), lint 0 errores, formato
  limpio. `pnpm test:e2e` → 19 passed. `pnpm test:db` → 41 passed.

### TASK-0066 — Historial por placa y mapa de la flota

- **Estado:** hecha (2026-09-22)
- **Fase:** 4
- **Prioridad:** baja
- **Contexto:** Ver el recorrido de un camión y la flota sobre un mapa. Añade la primera
  dependencia de cartografía del proyecto (Leaflet + teselas OpenStreetMap), con ruta perezosa y
  fuera del precache de la PWA para no engordar el arranque ni filtrar coordenadas al service
  worker. El veedor no entra: no recibe coordenadas (spec §3.2).
- **Criterio de done:**
  - [x] `GET /api/v1/vehiculos/:id/ubicaciones` con rango, límite y scope `own`; veedor rechazado
  - [x] Ruta `/mapa` perezosa con marcadores y recorrido de la placa seleccionada
  - [x] El chunk del mapa queda fuera del precache; las teselas nunca se cachean
  - [x] E2E mínimo del mapa; `pnpm check` y `pnpm test:e2e` en verde; ARCHITECTURE §7 actualizado
- **Referencias:** spec §9, §12, §3.2; ARCHITECTURE §7; ADR-0007; TASK-0065
- **Evidencia (2026-09-22):** `GET /api/v1/vehiculos/:id/ubicaciones` (últimas 24 h por defecto,
  `desde`/`hasta`/`limite`, máximo 2000) con un caso de API que cubre los cuatro roles: el
  coordinador recibe los tres puntos ordenados del más reciente al más antiguo y con
  coordenadas; el dueño de la placa, 200; otro asociado, 403 `FORBIDDEN_OWN_SCOPE`; el veedor,
  403 `FORBIDDEN` (hace falta comprobarlo a mano: `exigir('vehiculos','R')` lo dejaría pasar
  porque su concesión es `R*`, y un recorrido sin coordenadas no se puede pintar); `?limite=1`
  devuelve un punto. Web: `paginas/Mapa.tsx` con Leaflet y teselas de OpenStreetMap
  (`VITE_MAPA_TILES_URL` para cambiarlas), ruta `/mapa` perezosa y enlace en la barra solo para
  quien recibe coordenadas; un punto por placa coloreado por frescura y, al tocarlo, la línea de
  su recorrido. `pnpm --filter @asotracmet/web build` → `mapa-DkHcbhq7.js` 148,72 kB en su
  propio trozo y **fuera del precache**: el service worker solo lista `index-*.js`,
  `index-*.css` y workbox (13 entradas), así que «Mi turno» sin conexión no engorda y las
  teselas nunca se guardan. E2E nuevo (teselas bloqueadas para no depender de la red ni molestar
  al servidor público): el coordinador abre el mapa y ve el lienzo y «placas con ubicación»; al
  veedor no le aparece ni el enlace. `pnpm check` → 40 archivos, 426 passed (41 skipped), lint 0
  errores, formato limpio. `pnpm test:e2e` → 20 passed. `pnpm build:contrato` → «84 rutas, 89
  esquemas (v1.1.0)». Commit `a8687e5` en la rama `task/TASK-0062-gps-ingesta`.

### TASK-0067 — Adaptador GPS real: Vía GPS (`gpsmobile.net`)

- **Estado:** bloqueada
- **Fase:** 4
- **Prioridad:** media
- **Contexto:** La plataforma que usan los propietarios es **Vía GPS** (viagps.co, Bogotá). No
  opera plataforma propia: su portal es `https://gpsmobile.net/Default.aspx?userlogo=177` (el
  `userlogo` identifica al revendedor). Reconocimiento público del 2026-09-22, sin credenciales:
  IIS 10 con ASP.NET WebForms 4.0.30319, tema `App_Themes/theme7`, jQuery UI 1.8.6; sesión por
  cookie `ASP.NET_SessionId`; el formulario (`id="Login"`, POST a `./Default.aspx?userlogo=177`)
  lleva `txtUsername`, `txtPassword`, `btnSubmit=Ingresar` y los campos de estado de WebForms
  `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION` y `CheckJS1$hfClientJSEnabled`. No
  hay captcha ni segundo factor, así que el acceso es automatizable: GET a la página para tomar
  cookie y campos de estado, y POST con esos campos más usuario y clave. `/api` y `/swagger` no
  existen (404) y las rutas `.aspx`/`.asmx` responden 302 al login, así que no hay API pública que
  descubrir sin credenciales.
  **Bloqueada** solo por una cuenta de prueba: falta saber qué página o petición devuelve las
  posiciones una vez dentro, y eso se ve con las herramientas de desarrollo del navegador en una
  sesión real. Conviene además pedir a Vía GPS una API o un usuario de solo lectura: el acceso
  automatizado a una página puede chocar con sus términos de servicio y esa página puede cambiar
  sin aviso.
- **Criterio de done:**
  - [ ] Procedimiento de inspección (qué petición devuelve las posiciones, con qué formato y en qué
        zona horaria) anotado en `docs/runbooks/gps-agente.md`
  - [ ] Adaptador `viagps` con cookie propia, timeout, un solo acceso por ciclo y errores tipados
        (`credenciales_invalidas`, `formato_inesperado`)
  - [ ] Fixtures anonimizadas de las respuestas reales y tests con `fetch` falso
  - [ ] Verificado contra la cuenta de prueba, con evidencia de una corrida real
- **Referencias:** spec §12, §19; ADR-0007; TASK-0064
- **Evidencia:** _(pendiente)_

### TASK-0068 — Adaptador GPS real de la segunda plataforma

- **Estado:** bloqueada
- **Fase:** 4
- **Prioridad:** baja
- **Contexto:** Igual que TASK-0067 para la segunda plataforma que usen los propietarios. Bloqueada
  por los mismos tres requisitos.
- **Criterio de done:**
  - [ ] Adaptador, fixtures y tests como en TASK-0067
  - [ ] Verificado contra una cuenta de prueba autorizada
- **Referencias:** TASK-0064, TASK-0067
- **Evidencia:** _(pendiente)_

### TASK-0069 — Habeas data: supresión de las ubicaciones de un vehículo

- **Estado:** hecha (2026-09-22)
- **Fase:** 4
- **Prioridad:** baja
- **Contexto:** Ley 1581 de 2012 y spec §12: un propietario puede retirar la autorización que dio
  para rastrear su vehículo. Hace falta una acción que borre su historial, con motivo,
  re-autenticación y rastro en auditoría, y que el extracto del asociado incluya lo que se guarda.
- **Criterio de done:**
  - [x] `DELETE /api/v1/vehiculos/:id/ubicaciones` con motivo, re-autenticación y auditoría
  - [x] El extracto de habeas data incluye el historial retenido
  - [x] Test de API y contrato regenerado
- **Referencias:** spec §12; ADR-0005, ADR-0007; TASK-0036, TASK-0063
- **Evidencia (2026-09-22):** `DELETE /api/v1/vehiculos/:id/ubicaciones` con motivo obligatorio
  y `exigirReauth`; el borrado corre con el rol de servicio (ADR-0005) y deja `gps.suprimir` en
  la auditoría con la placa, el motivo y cuántas filas se fueron. El extracto del asociado
  (`GET /me/extracto`) gana un resumen por placa (puntos guardados, desde cuándo y hasta
  cuándo) y el texto de propósito nombra la ubicación del vehículo, su origen y su retención:
  sin eso la autorización de los términos de asociado no sería informada (Ley 1581 de 2012).
  Tres casos de API: sin re-autenticar responde 403 `REAUTH_REQUERIDA`; tras confirmar
  identidad borra solo esa placa (las otras dos siguen) y queda auditado; un coordinador
  recibe 403. Y un cuarto sobre el extracto: el asociado ve un punto de `FST189` desde el
  instante de la lectura y el propósito menciona la ubicación. `pnpm check` → 40 archivos,
  429 passed (41 skipped). `pnpm test:db` → 41 passed. `pnpm test:e2e` → 20 passed.
  `pnpm build:contrato` → «84 rutas, 90 esquemas (v1.1.0)». Commit `a8687e5` en la rama
  `task/TASK-0062-gps-ingesta` (subida a origin el 2026-09-22).

### TASK-0070 — Aviso `gps.sin_senal` por la outbox

- **Estado:** pendiente
- **Fase:** 4
- **Prioridad:** baja
- **Contexto:** Cuando una placa activa lleva más de `gps_sin_senal_minutos` sin reportar, avisar a
  HSEQ y al asociado por la outbox de avisos (spec §11, ADR-0006), con clave de idempotencia para
  no repetir el aviso cada corrida. Depende de que TASK-0057 cierre, porque amplía el mismo check
  de eventos de `notificaciones_outbox`.
- **Criterio de done:**
  - [ ] Evento nuevo con clave `gps.sin_senal:{vehiculoId}:{fecha}` y plantilla en español
  - [ ] Migración que amplía el check de `notificaciones_outbox.evento`
  - [ ] Test de idempotencia (dos corridas, un solo aviso)
- **Referencias:** spec §11, §14; ADR-0006; TASK-0057, TASK-0063
- **Evidencia:** _(pendiente)_

### TASK-0071 — Bug: `CodigoTr.tsx` no compila (`data-testid` sobre `resto`)

- **Estado:** hecha (2026-09-22)
- **Fase:** 1
- **Prioridad:** alta
- **Contexto:** Encontrado al verificar TASK-0062 (RULE-007). `pnpm typecheck` falla en
  `apps/web/src/componentes/ui/CodigoTr.tsx(26,22)` con `TS7053`: el componente lee
  `resto['data-testid']` sobre un tipo de props de `button`, que no declara esa clave. El archivo
  es parte del sistema de diseño en curso (TASK-0045) y todavía no está versionado, así que
  `pnpm check` está en rojo para todo el repositorio y ninguna tarea puede cerrarse con la
  verificación de RULE-018 completa.
- **Criterio de done:**
  - [x] El tipo de props de `CodigoTr` declara `data-testid` (o se lee con un tipo que lo admita)
  - [x] `pnpm check` en verde en un árbol sin otros cambios
- **Referencias:** AGENTS RULE-018, RULE-019; TASK-0045, TASK-0062
- **Evidencia (2026-09-22):** `Props` declara `'data-testid'?: string` con el porqué en un
  comentario (JSX admite cualquier `data-*`; el tipo de props del botón no lo declara). Antes:
  `pnpm typecheck` → `src/componentes/ui/CodigoTr.tsx(26,22): error TS7053`. Después:
  `pnpm check` → 38 archivos, 400 passed (41 skipped), lint 0 errores, formato limpio.
  `pnpm test:e2e` → 16 passed.

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
