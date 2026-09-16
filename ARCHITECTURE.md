# ARCHITECTURE.md — ASOTRACMET · Sistema de enturnamiento

Estado del documento: describe lo construido a fecha 2026-09-16 y el objetivo de la fase producto.
La spec funcional completa es [ASOTRACMET-enturnamiento-especificacion.md](ASOTRACMET-enturnamiento-especificacion.md);
aquí no se repite el porqué del negocio, solo el cómo del sistema. Las reglas de trabajo están en
[AGENTS.md](AGENTS.md) y el backlog en [ISSUES.md](ISSUES.md).

## 1. Qué es

Un sistema de **cola gremial + bitácora de viajes + recaudo + habilitación HSEQ** con IAM
multinivel para la Asociación de Tractocamioneros del Meta. Reemplaza el libro
`control de enturnamiento.xlsx`. No es un CRM ni un TMS.

Lo que no puede mentir es el loop `requerimiento → oferta → TR → viaje → recaudo` y la invariante de
equidad de la cola. Todo lo demás se apoya en eso (spec §22).

## 2. Vista de alto nivel

### 2.1 Hoy (fase puente, entregable de esta iteración)

```text
[apps/web · React PWA]  ── HTTPS/JSON + Bearer ──▶  [apps/api · Fastify]
      TanStack Query (polling 4 s)                       │ RBAC (exigir) · errores {code}
                                                         ▼
                                             [packages/domain · MotorCola]
                                                         │ puertos Transaccion / UnidadDeTrabajo
                                                         ▼
                                         [AlmacenMemoria: lock por clase + rollback + audit]
                                                         (seed anonimizado, reset en modo e2e)
```

### 2.2 Objetivo (fase producto, spec §5.1)

```text
[PWA / Web React]
      │ HTTPS + sesión (OTP/2FA)
      ▼
[API Fastify]  ── jobs (BullMQ) ── notificaciones (email / WhatsApp opt-in)
      │
      ├── Postgres 16  (fuente de verdad, RLS, locks SELECT … FOR UPDATE)   ← TASK-0019
      ├── Redis        (sesión, lock cola:{clase}, rate limit)              ← TASK-0020
      ├── S3-compatible (soportes HSEQ, nunca secretos)                     ← TASK-0028
      └── OpenTelemetry + logs estructurados                                ← TASK-0030
```

Monolito modular. El único bounded context candidato a extracción futura es `billing/recaudo`.

## 3. Estructura del repositorio

```text
.
├── ASOTRACMET-enturnamiento-especificacion.md   # la spec
├── AGENTS.md · ARCHITECTURE.md · ISSUES.md       # reglas · arquitectura · backlog
├── apps/
│   ├── api/            # Fastify 5. Rutas /api/v1, auth, RBAC, vistas, seed, jobs
│   └── web/            # React 19 + Vite 8 + TanStack Query. /login /ops /me
├── packages/
│   ├── shared/         # lenguaje ubicuo: estados, roles/RBAC, códigos de error, parámetros, Zod
│   └── domain/         # motor de cola, invariantes, puertos, adaptador en memoria. Sin HTTP/DB/UI
├── infra/
│   ├── postgres/       # migrations/*.sql (append-only), migrar.ts, tests db (RLS, audit)
│   └── compose.yaml    # Postgres 16 + Redis 7 para desarrollo
├── e2e/                # Playwright: flujos completos por rol
├── scripts/            # migrate-db.ts (hecho), migrate-xlsx.ts y anonymize-staging.ts (pendientes)
├── docs/adr/           # decisiones de arquitectura
└── .github/workflows/  # CI: check · e2e · db
```

Herramientas: pnpm workspaces, TypeScript 5.9 (`moduleResolution: bundler`, `strict`,
`verbatimModuleSyntax`), ESLint 10 flat config + typescript-eslint, Prettier, Vitest 5 (proyectos),
Playwright 1.63, Husky + lint-staged, GitHub Actions.

## 4. Capas y dependencias

```text
shared  ◀──  domain  ◀──  api  ◀──  web (solo shared, nunca domain ni api)
```

| Paquete                | Puede importar        | Nunca importa                       | Regla        |
| ---------------------- | --------------------- | ----------------------------------- | ------------ |
| `@asotracmet/shared`   | zod                   | domain, api, web, node:\*           | RULE-008/009 |
| `@asotracmet/domain`   | shared                | fastify, pg, redis, react, node:\*  | RULE-010     |
| `@asotracmet/api`      | domain, shared        | web                                 | RULE-011     |
| `@asotracmet/web`      | shared                | domain, api (habla por HTTP)        | RULE-010     |

Los paquetes exponen `src/index.ts` directamente (`exports` → `.ts`); la API corre con `tsx` y la web
con Vite. El empaquetado de producción de la API es TASK-0032.

## 5. Dominio

### 5.1 Lenguaje ubicuo y estados cerrados

`packages/shared/src/estados.ts` es la única definición de estados y clases:

```text
oferta:        abierta | aceptada | declinada | expirada | anulada
tr:            asignado | en_curso | cumplido | cancelado | no_tramitar
viaje:         borrador | cargado | descargado | liquidado | anulado
recaudo:       pendiente | parcial | pagado | cruzado | castigado
vehiculo:      activo | inactivo | bloqueado_hseq | vendido
documento:     vigente | por_vencer | vencido
requerimiento: abierto | cerrado | cancelado
clase vehículo C100 C350 C600 MM TM CBZ  →  clase de cola C100 C350 C600 MM TM-CBZ
```

`ESTADOS_TR_ACTIVOS` (`asignado`, `en_curso`) bloquean una nueva oferta si
`un_tr_activo_por_placa`; `ESTADOS_TR_VIGENTES` (+ `cumplido`) consumen cupo del requerimiento.

### 5.2 Tipos

`packages/domain/src/tipos.ts`: `Actor`, `Cliente`, `Asociado`, `Vehiculo`, `Habilitacion`,
`Documento`, `MotivoDeclinacion`, `ColaPosicion`, `Requerimiento`, `Oferta`, `Tr`,
`EventoAuditoria`, `Elegibilidad`, `PosicionCola`. Timestamps ISO-8601 UTC; fechas de negocio
`YYYY-MM-DD` calculadas con `fechaLocal(instante, parametros.timezone)`.

`ColaPosicion` lleva `posicion` (la cola real), `ciclo` (vueltas, decoración de ronda: el "1-2-3"
del Excel), `turnosOfrecidos`, `turnosTomados` (tablero de equidad) y `saltosPendientes`
(política `penaliza_n`).

### 5.3 Invariantes (`invariantes.ts`)

1. Posiciones `1..N` densas por clase, sin huecos ni repetidos (`verificarInvariantesCola`).
2. Toda transformación es una función pura que devuelve una copia: `renumerar`, `rotarAlFinal`
   (incrementa `ciclo` y `version`), `moverACabeza`, `actualizarPosicion`.
3. Nada escribe posiciones sin pasar por `MotorCola.guardarCola`, que verifica antes de persistir.

### 5.4 Elegibilidad (`elegibilidad.ts`)

Función pura `evaluarElegibilidad(ctx)` que aplica los filtros de spec §7.2 **en este orden** y
devuelve `{ elegible, motivo: CodigoError | null, detalle }`:

1. `vehiculo.estado !== 'activo'` → `VEHICULO_NO_ACTIVO`
2. documento bloqueante vencido y `bloquear_por_documento_vencido` → `DOCUMENTO_VENCIDO`
3. `noElegibleHasta` en el futuro (política `bloqueo_horas`) → `BLOQUEO_TEMPORAL`
4. cliente exige habilitación y `habilitacion.apto !== true` → `VEHICULO_NO_HABILITADO`
5. oferta abierta no vencida → `OFERTA_ABIERTA_PREVIA`
6. TR activo y `un_tr_activo_por_placa` → `TR_ACTIVO`
7. `saltosPendientes > 0` → `PENALIZACION_PENDIENTE`

El mismo cálculo alimenta `GET /colas/:clase` (snapshot con motivo por fila, que la UI pinta gris con
tooltip) y `siguienteElegible` (decisión). No hay dos lógicas.

### 5.5 Motor de cola (`motor-cola.ts`)

`MotorCola` recibe `{ uow, reloj, ids }` y expone acciones de dominio. Cada acción abre
`uow.ejecutar(claseCola, tx => …)`: lock por clase, todo o nada, auditoría dentro.

| Acción                | Qué hace                                                                                                                                                                                                                          | Audit                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `ofrecer`             | Requerimiento abierto y con cupos libres (`cantidad − TR vigentes − ofertas abiertas`). `siguienteElegible` → crea oferta `abierta` con `expiraEn = ahora + oferta_ttl_minutos`. **No avanza la cola.**                          | `oferta.crear`                                                                              |
| `aceptar`             | Oferta abierta y vigente; scope `own` si el actor es `member`. Oferta → `aceptada`, crea `Tr` con código de la secuencia, `turnosTomados++`, rota al final si `consume_posicion_al_aceptar`, cierra el requerimiento si completó. | `oferta.aceptar`, `tr.crear`, `cola.rotar`, `requerimiento.cerrar`                          |
| `declinar`            | Exige motivo de catálogo activo. Oferta → `declinada`. Aplica `declinacion_politica` (`al_final` rota; `penaliza_n` rota + `saltosPendientes = n`; `bloqueo_horas` rota + `noElegibleHasta`). Reoferta al siguiente en la misma tx. | `oferta.declinar`, `cola.rotar.<politica>`, `oferta.crear` o `cola.cola_vacia`              |
| `anular`              | Solo oferta abierta, motivo obligatorio. No rota.                                                                                                                                                                                 | `oferta.anular`                                                                             |
| `expirarOfertas`      | Job. Ofertas abiertas con `expiraEn <= ahora` → `expirada`, agrupadas por clase. Política `oferta_expirada_politica`: `declina` (rota + reoferta) o `reofertar` (nueva oferta a la misma placa). Si la clase está bloqueada, reintenta en la siguiente corrida. | `oferta.expirar` + los de la política                                                       |
| `cancelarTr`          | TR `asignado`/`en_curso`, motivo obligatorio → `cancelado` con actor y timestamp. Si `tr_cancelado_regresa_al_mismo`: la placa vuelve a cabeza (`moverACabeza`); si no: reabre el requerimiento y reoferta al siguiente.        | `tr.cancelar`, `cola.regresar_cabeza` o `requerimiento.reabrir` + `oferta.crear`            |
| `noTramitar`          | TR activo → `no_tramitar` con motivo. Reemplaza el texto `NO TRAMITAR` del Excel.                                                                                                                                                 | `tr.no_tramitar`                                                                            |
| `snapshotCola`        | Solo lectura: posiciones + vehículo + asociado + elegibilidad para un cliente.                                                                                                                                                     | —                                                                                           |

`siguienteElegible` recorre las posiciones en orden y devuelve la primera elegible. Las placas con
`PENALIZACION_PENDIENTE` que quedan por delante consumen un salto **solo cuando el turno se lo lleva
otra**; si ninguna otra puede tomarlo, la penalizada lo recibe y consume el salto
(`cola.penalizacion_agotada`), de modo que la cola nunca se traba sola. Sin candidatos: `COLA_VACIA`
con el detalle de descartes por placa.

Secuencia TR: `Transaccion.siguienteCodigoTr()` lee `parametros.secuencia_tr`, devuelve
`${prefix}${next}` e incrementa. Si el código ya existe lanza `TR_DUPLICADO` (runbook §14).

### 5.6 Concurrencia (spec §7.7)

`UnidadDeTrabajo.ejecutar(claseCola, fn)` toma el lock de la clase **sin esperar**: un segundo
coordinador recibe `COLA_LOCKED` (HTTP 409) y reintenta. La comprobación es síncrona en el momento de
la llamada, por eso 20 `ofrecer` paralelos producen exactamente 1 oferta y 19 rechazos
(`motor-cola.test.ts`, `app.test.ts`). Clases distintas no se bloquean entre sí. En Postgres el
equivalente es `SELECT … FOR UPDATE NOWAIT` sobre `cola_posiciones` de la clase + lock Redis
`cola:{clase}` (TASK-0019/0020).

### 5.7 Puertos y adaptadores (`puertos.ts`, `memoria.ts`)

- `Reloj` (`RelojSistema`, `RelojFijo` para tests) y `GeneradorIds` (UUID v7 en la API,
  `IdsSecuenciales` en tests).
- `Transaccion`: lecturas y escrituras que el motor necesita (parámetros, cliente, vehículo,
  habilitación, documentos vencidos, posiciones, requerimiento, ofertas, TR, secuencia, `auditar`).
- `UnidadDeTrabajo`: `ejecutar(claseCola | null, fn)` y `leer(fn)`.
- `AlmacenMemoria` implementa ambos: estado en un objeto `EstadoMemoria`, lock por clase en un `Set`,
  rollback por `structuredClone` del estado al inicio de la transacción. Es el almacén de dev, tests
  y e2e (`reemplazar(estado)` para el reset). El adaptador Postgres (TASK-0019) implementa la misma
  interfaz con una conexión por transacción y `set local app.rol / app.vehiculo_ids`.

## 6. API (`apps/api`)

Fastify 5, REST `/api/v1`, JSON, errores con `code` estable (spec §8.6).

### 6.1 Composición (`app.ts`)

`construirApp({ config?, reloj?, ids?, almacen?, usuarios? })` devuelve `{ app, almacen, usuarios,
motor, reloj, config }`. Registra CORS (orígenes de `CORS_ORIGINS`), rate limit (por ruta), manejo de
errores, autenticación, rutas y, solo en `modoE2e`, `POST /api/v1/__e2e/reset`. `index.ts` escucha y
programa el job de expiración cada minuto. El parser JSON acepta cuerpo vacío como `{}` (los POST de
acción como `/ofertas/:id/aceptar` no llevan cuerpo); JSON malformado sigue siendo 400.

### 6.2 Autenticación (`auth/`)

Fase puente: `POST /auth/login` con email + contraseña (scrypt, `passwords.ts`) devuelve un token
HMAC-SHA256 firmado con `AUTH_SECRET` (`tokens.ts`) y `expiraEn` según `DURACION_SESION_HORAS` del
rol (superadmin 4 h, admin 8 h, viewer 12 h, member 7 d). El hook `onRequest` valida el Bearer,
carga el usuario y construye `request.actor = { id, rol, vehiculoIds }`. Rutas públicas: `/healthz`,
`/readyz`, `/auth/login`. Login limitado a `loginRateLimitMax`/min (10 en prod, 1000 en e2e).
OTP, 2FA, magic link y revocación: TASK-0021 (ADR-0003).

### 6.3 RBAC (`auth/plugin.ts`, `packages/shared/src/roles.ts`)

`MATRIZ_RBAC[recurso][rol]` codifica la tabla de spec §3.2 (`permisos`, `own`, `enmascarado`,
`override`). El guard `exigir(recurso, permiso, { permitirOwn })` se declara en cada ruta; las rutas
`own` filtran por `actor.vehiculoIds` y el motor vuelve a comprobar el scope al aceptar/declinar
(`FORBIDDEN_OWN_SCOPE`). `MODULO_AUDIT` limita qué entidades de `audit_log` ve cada admin.
El enmascarado `R*` (cédula `******1658`, celular) se aplica en `vistas.ts`.

### 6.4 Rutas

| Método y ruta                                | Guard                        | Notas                                                             |
| -------------------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `GET /healthz`, `GET /readyz`                | público                      | `readyz` reportará DB/Redis cuando existan (TASK-0030)            |
| `POST /auth/login`, `POST /auth/logout`      | público / token              | logout stateless en fase puente                                   |
| `GET /me`                                    | token                        | usuario y `vehiculoIds`                                           |
| `GET /colas/:clase?clienteId=`               | cola R (no own)              | snapshot + `cabezaElegible`; member usa `/me/cola`                |
| `GET/POST /requerimientos`                   | requerimientos R / C         | filtros `estado`, `fecha`; vista con cupos asignados/libres       |
| `POST /requerimientos/:id/ofertas`           | ofertas C                    | **motor**; `Idempotency-Key` opcional (misma respuesta, sin duplicar) |
| `GET /ofertas?estado=&requerimientoId=`      | ofertas R                    |                                                                   |
| `POST /ofertas/:id/aceptar`                  | ofertas A (own)              | devuelve `{ oferta, tr }`                                         |
| `POST /ofertas/:id/declinar`                 | ofertas A (own)              | body `{ motivoId, nota? }`; devuelve `{ oferta, siguiente }`      |
| `POST /ofertas/:id/anular`                   | ofertas A                    | body `{ motivo }`                                                 |
| `GET /trs?desde=&hasta=&placa=&estado=`      | trs R (own)                  | member solo las suyas                                             |
| `GET /trs/:id`                               | trs R (own)                  | ajeno → `FORBIDDEN_OWN_SCOPE`                                     |
| `POST /trs/:id/cancelar`, `/no-tramitar`     | trs A                        | body `{ motivo }`                                                 |
| `GET /me/cola`, `/me/ofertas`, `/me/trs`     | own                          | "Tu posición: 3 de 12 en TM-CBZ"                                  |
| `GET /clientes`, `/destinos`, `/motivos-declinacion` | catalogos R          |                                                                   |
| `GET /vehiculos`                             | vehiculos R (own)            | con habilitaciones por cliente; PII enmascarada para viewer       |
| `GET /parametros`, `PATCH /parametros`       | parametros R / U             | PATCH valida el conjunto completo y audita `before/after`         |
| `GET /audit?entidad=&id=&limite=`            | audit_log R                  | acotado por `MODULO_AUDIT`                                        |
| `POST /jobs/expirar-ofertas`                 | cola U (superadmin)          | disparo manual del job                                            |
| `POST /__e2e/reset`                          | solo `modoE2e`               | vuelve al seed                                                    |

Pendientes de spec §8: `/usuarios` (TASK-0022), CRUD de maestros (TASK-0023), `/viajes`,
`/recaudos`, `/tablero`, `/export` (TASK-0027/0029/0034).

### 6.5 Contrato de error (`errores.ts`)

`ErrorDominio` → status de `CODIGOS_ERROR` (`COLA_LOCKED` 409, `COLA_VACIA` 422,
`VEHICULO_NO_HABILITADO` 422, `FORBIDDEN_OWN_SCOPE` 403, …). `ZodError` → 400 `VALIDATION_ERROR`
con `details.issues`. Rate limit → 429 `RATE_LIMITED`. Cualquier otro → 500 `INTERNAL` (se loguea).
404 → `NOT_FOUND`.

### 6.6 Seed (`seed.ts`)

Determinista, anonimizado (spec §22.4): 17 placas del legado (10 en `TM-CBZ`, con `SPS413` no apta
para HLB y `UFR114` con SOAT vencido), 10 asociados `ASOCIADO NN ANONIMIZADO`, clientes, destinos,
motivos, dos requerimientos abiertos y siete usuarios (uno por rol + dos `member`, uno de ellos con
dos TM: `FST189` y `TKM221`). Contraseña única de desarrollo `Asotracmet2026!`.

## 7. Frontend (`apps/web`)

- React 19 + TypeScript + Vite 8. Router por rol: `/login`, `/ops` (sala de turnos: admin_ops,
  superadmin, admin_hseq, admin_finance, viewer), `/me` (member). `/hseq`, `/finance`, `/admin`
  llegan con sus fases.
- Estado servidor con TanStack Query (polling 4 s en colas, ofertas y TR; invalidación tras cada
  mutación). Sesión en `sessionStorage` vía `SesionProvider`; un 401 cierra sesión.
- `api/cliente.ts`: `fetch` a `/api/v1` (proxy de Vite a `:3001` en dev), lanza `ErrorApiCliente`
  con el `code` de la API; `utils/formato.ts` lo traduce.
- Pantallas: `Login`, `Ops` (tres columnas: requerimientos con "Ofrecer cupo" solo si
  `puede(rol,'ofertas','C')`; colas por pestaña de clase y cliente, cabeza elegible resaltada,
  no elegibles en gris con motivo; actividad con ofertas abiertas (anular con motivo) y TR
  recientes con copia del código en un tap), `Me` (posición por placa, `OfertaCard` con
  Aceptar/Declinar + motivo de catálogo, Mis TR).
- Colores (spec §9.3): ámbar oferta abierta, verde TR asignado, rojo cancelado/declinado, gris no
  habilitado.
- PWA: `manifest.webmanifest` e icono; service worker y offline de lectura en TASK-0031.
- Los `data-testid` son parte del contrato con los e2e (`ofrecer-<reqId>`, `cola-fila-<PLACA>`,
  `oferta-card`, `aceptar-oferta`, `motivo-declinacion`, `declinar-oferta`, `mi-posicion`,
  `mis-trs`, `actividad`, `logout`).

## 8. Modelo de datos (`infra/postgres`)

Migraciones SQL append-only (RULE-025), aplicadas por `migrar.ts` (`pnpm db:migrate`) con registro en
`schema_migrations`:

| Archivo               | Contenido                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_extensiones`    | `pgcrypto`, `citext`, `btree_gist`                                                                                                             |
| `0002_maestros`       | `asociados`, `vehiculos` (placa `^[A-Z]{3}[0-9]{3}$`, coherencia `clase`/`clase_cola`, `gps_proveedor` sin contraseña), `conductores`, `vehiculo_conductores` |
| `0003_iam`            | `usuarios` (rol cerrado, `totp_secret_enc`), `usuario_vehiculos`, `refresh_tokens`, `otp_codes`                                                |
| `0004_hseq`           | `tipos_documento`, `documentos`, `clientes`, `habilitaciones` (unique vehículo×cliente), `documentos_recalcular_estado()`                        |
| `0005_catalogos`      | `destinos`, `transportadoras`, `tarifas` (vigencia, unique por cliente/destino/clase/modalidad/desde), `motivos_declinacion`                    |
| `0006_operacion`      | `parametros` (jsonb), `requerimientos`, `cola_posiciones` (unique `(clase,vehiculo)`; unique `(clase,posicion)` **deferrable** para renumerar en la misma tx), `ofertas` (una abierta por placa, declinada ⇒ motivo), `trs` (código `^TR-[0-9]+$` único, cancelado ⇒ rastro), `viajes` (`porcentaje_aplicado` snapshot), `recaudos` |
| `0007_audit`          | `audit_log` + trigger que rechaza UPDATE/DELETE + `revoke`                                                                                     |
| `0008_indices`        | los índices de spec §6.7 más parciales para ofertas abiertas                                                                                   |
| `0009_rls`            | `app_rol()`, `app_vehiculo_ids()`; RLS **forzada** en `cola_posiciones`, `ofertas`, `trs`, `viajes`, `documentos`, `recaudos`: member solo lee sus placas y nunca escribe directo; viewer nunca escribe |
| `0010_datos_base`     | parámetros por defecto, motivos, clientes, tipos de documento                                                                                  |

La API abre cada transacción con `set local app.rol` y `set local app.vehiculo_ids`; sin ellos el
rol efectivo es `sistema` (migraciones y jobs). **Un superusuario o el owner de las tablas se salta
RLS**: la API se conecta como `asotracmet_app` (rol sin login creado en `0009_rls.sql`, con
`SET ROLE` por transacción, o un rol de login que lo herede), nunca como el usuario de migraciones.
El test `RLS: un member solo ve los TR de sus placas` prueba exactamente eso con `set local role`. El adaptador Postgres (TASK-0019) mapea
`Transaccion` a estas tablas; hasta entonces la API usa `AlmacenMemoria` y estas migraciones se
validan con `pnpm test:db` (CI job `db`).

## 9. Seguridad

- Contraseñas: scrypt con salt, comparación en tiempo constante. Tokens: HMAC-SHA256, expiración por
  rol, verificación en tiempo constante, rol validado contra la lista cerrada.
- Autorización: RBAC en cada ruta + scope `own` + RLS en base (§8). Un `member` que vea placas
  ajenas es incidente (RULE-022).
- PII: enmascarado para `viewer` (y `member` en viajes) en las vistas; nunca en logs.
- Secretos: prohibido persistir credenciales de terceros (no existe columna); `AUTH_SECRET` y
  claves de cifrado del entorno; `.env` ignorado por git.
- Rate limit en login; CORS estricto por `CORS_ORIGINS`.
- Pendiente: OTP/2FA/magic link (TASK-0021), cifrado de `cuenta_bancaria_enc` (TASK-0023),
  cookies httpOnly + CSRF (TASK-0021), exportaciones con watermark (TASK-0034), backups cifrados y
  restore drill (TASK-0035).

## 10. Estrategia de pruebas

| Proyecto Vitest / suite | Dónde                              | Cubre                                                                                                                             |
| ----------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `shared`                | `packages/shared/src/*.test.ts`    | placas, matriz RBAC (viewer no muta, member own), estados, parámetros, PII, fechas Bogotá                                        |
| `domain`                | `packages/domain/src/*.test.ts`    | spec §16: cabeza no habilitada → toma la 2; dos TM del mismo asociado; ofrecer+declinar+reofertar en una tx; 20 paralelos → 1 + 19 `COLA_LOCKED`; políticas de declinación; expiración; cancelar TR; secuencia TR; rollback; invariantes |
| `api`                   | `apps/api/src/*.test.ts`           | auth y expiración de token; viewer no muta (403); member no lista TR ajenos; PII enmascarada; flujo ofrecer→aceptar/declinar; idempotencia; parámetros auditados; job; concurrencia HTTP con transacciones lentas |
| `web`                   | `apps/web/src/**/*.test.tsx?`      | formato/traducción de errores; `OfertaCard` (declinar exige motivo)                                                               |
| `db`                    | `infra/postgres/*.test.ts`         | migraciones idempotentes, tablas, audit append-only, RLS member, unicidad diferible, checks de placa. Se omite sin `DATABASE_URL` |
| e2e                     | `e2e/*.spec.ts`                    | login ops → ofrecer → login member → aceptar → aparece TR; declinar con motivo → pasa a la siguiente placa; viewer sin botones y 403 en API; credenciales inválidas |

Comandos: `pnpm test` (unit/integración), `pnpm test:coverage`, `pnpm test:e2e`, `pnpm test:db`.
`pnpm check` = lint + formato + tipos + unit. CI (`.github/workflows/ci.yml`): job `check`, job `e2e`
(Chromium) y job `db` (servicio Postgres 16 → `db:migrate` + `test:db`).

## 11. Configuración y entornos

Variables (`.env.example`): `PORT`, `HOST`, `AUTH_SECRET`, `CORS_ORIGINS`, `DATABASE_URL`,
`REDIS_URL`, `LOG_LEVEL`, `LOGIN_RATE_LIMIT_MAX`, `ASOTRACMET_E2E`. Modos de la API: memoria (por
defecto), e2e (`--e2e`: seed + reset). Ambientes objetivo: `dev`, `staging` (copia anonimizada del
Excel, TASK-0035) y `prod`. Staging nunca con claves reales porque no deben existir.

## 12. Jobs y procesos de fondo

Hoy: expirar ofertas cada minuto (`setInterval` en `index.ts`, disparo manual por
`POST /jobs/expirar-ofertas`). Objetivo (spec §14, BullMQ): recalcular `documentos.estado`, alertas
30/7 días, digest diario a ops, snapshot mensual de equidad, archivado de `audit_log` a 24 meses
(TASK-0026/0028/0029/0030).

## 13. Estado actual vs objetivo

| Componente               | Hoy                                             | Objetivo                                       | Tarea               |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------- | ------------------- |
| Motor de cola            | completo (§7) con tests                          | igual; override/reset auditado                 | TASK-0024           |
| Persistencia             | memoria transaccional                            | Postgres (RLS, FOR UPDATE) + Redis locks       | TASK-0019, 0020     |
| Auth                     | password + token HMAC                            | OTP, 2FA admin, magic link member, refresh     | TASK-0021           |
| IAM y maestros           | seed, lectura                                    | CRUD completo por rol                          | TASK-0022, 0023     |
| Pantallas                | login, ops, member                               | + hseq, finance, admin, viewer tablero         | TASK-0027-0029      |
| Viajes / recaudo         | tablas SQL                                       | módulo completo, 3% parametrizado              | TASK-0027           |
| HSEQ                     | filtro por documento vencido + habilitación      | documentos, semáforo, alertas                  | TASK-0028           |
| Notificaciones           | —                                                | in-app, email, WhatsApp opt-in, outbox         | TASK-0026           |
| Migración Excel          | —                                                | `migrate-xlsx.ts` + informe de excepciones     | TASK-0025           |
| Observabilidad           | logs pino, healthz                               | OpenTelemetry, métricas, readyz real, runbooks | TASK-0030           |
| Despliegue               | `tsx` local                                      | build, Docker, VPS/Fly                         | TASK-0032           |

## 14. Runbooks (mínimos)

- **Cola trabada / `COLA_LOCKED` persistente**: hoy el lock vive en memoria y muere con la
  transacción; si se repite, revisar `audit` de la clase y el log de la API. Con Redis (TASK-0020):
  `DEL cola:{clase}` solo tras confirmar que no hay transacción viva.
- **Secuencia TR desfasada (`TR_DUPLICADO`)**: `GET /trs?estado=` para ver el mayor código real;
  `PATCH /parametros { secuencia_tr: { prefix: 'TR-', next: <mayor + 1> } }` como superadmin (queda
  auditado).
- **Member ve placa ajena**: incidente de seguridad. Revocar sesión, abrir `TASK` crítica, revisar
  `usuario_vehiculos`, el guard `exigir(..., { permitirOwn })` de la ruta y las políticas RLS.

## 15. Decisiones (ADR)

- [ADR-0001](docs/adr/0001-monolito-modular-con-puertos.md) — Monolito modular con motor aislado tras puertos.
- [ADR-0002](docs/adr/0002-almacen-en-memoria-como-puente.md) — Almacén en memoria transaccional como fase puente.
- [ADR-0003](docs/adr/0003-autenticacion-de-desarrollo.md) — Autenticación de desarrollo (password + HMAC) antes de OTP/2FA.
- [ADR-0004](docs/adr/0004-rls-por-settings-de-sesion.md) — RLS con `app.rol` / `app.vehiculo_ids` por transacción.
