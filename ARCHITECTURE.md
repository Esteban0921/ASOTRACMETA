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

### 2.1 Hoy

```text
[apps/web · React PWA]  ── HTTPS/JSON + Bearer ──▶  [apps/api · Fastify]
      TanStack Query (polling 4 s)                       │ RBAC (exigir) · errores {code}
                                                         │ contexto RLS (AsyncLocalStorage)
                                        ┌────────────────┴────────────────┐
                                        ▼                                 ▼
                          [packages/domain · MotorCola]        [Consultas · puerto de lectura]
                                        │ Transaccion / UnidadDeTrabajo    │
                     PERSISTENCIA=memoria ─┴─ PERSISTENCIA=postgres ────────┘
                                        │                                 │
               [AlmacenMemoria + ConsultasMemoria]     [AlmacenPostgres + ConsultasPostgres]
               lock por clase, rollback por snapshot,   una tx por acción, advisory lock + FOR UPDATE
               seed en memoria, reset en modo e2e       NOWAIT, SET ROLE asotracmet_app, RLS, audit
```

El almacén se elige por configuración (`PERSISTENCIA`). Memoria sigue siendo el modo de desarrollo,
tests unitarios y e2e; Postgres es el de operación real (`pnpm db:reset` migra y siembra).

### 2.2 Objetivo (fase producto, spec §5.1)

```text
[PWA / Web React]
      │ HTTPS + sesión (OTP/2FA)
      ▼
[API Fastify]  ── jobs (BullMQ) ── notificaciones (email / WhatsApp opt-in)
      │
      ├── Postgres 16  (fuente de verdad, RLS, advisory lock + FOR UPDATE)  ← hecho (TASK-0019)
      ├── Redis        (sesión, lock cola:{clase} multi-instancia, rate limit) ← TASK-0020
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
│   ├── migracion/      # Excel legado → plan puro → Postgres + informe de excepciones (TASK-0025)
│   ├── compose.yaml    # Postgres + Redis de desarrollo (puertos configurables)
│   └── compose.prod.yaml # app + Postgres + Redis en un VPS (TASK-0032)
│   └── compose.yaml    # Postgres 16 + Redis 7 para desarrollo
├── e2e/                # Playwright: flujos completos por rol
├── scripts/            # migrate-db, seed-db, migrate-xlsx, anonymize-staging, backup/restore-db
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
| `override`            | `cola.override` (§7.1.5): lleva una placa a una posición concreta, con motivo. Solo superadmin re-autenticado. El antes y el después de la cola quedan en audit, visibles para el veedor (§21). | `cola.override` |
| `resetCola`           | Reset por clase (§9.2, §13.3): la cola pasa a ser exactamente los vehículos activos de la clase, en el orden dado y después por placa, con contadores de ronda a cero. El antes (contadores incluidos) queda en audit: no borra historia. | `cola.reset` |
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
  unitarios y e2e (`reemplazar(estado)` para el reset).
- `AlmacenPostgres` (`apps/api/src/persistencia/postgres.ts`) implementa la misma interfaz con una
  conexión del pool por transacción: `begin` → `set local role asotracmet_app` → `set_config`
  de `app.rol` y `app.vehiculo_ids` → `pg_try_advisory_xact_lock('cola:<clase>')` (sin espera,
  funciona con la clase vacía) → `select … for update nowait` sobre las posiciones → `fn(tx)` →
  `commit`. Cualquier fallo hace `rollback`; `55P03` se traduce a `COLA_LOCKED` y la unicidad de
  `trs.codigo` a `TR_DUPLICADO`. Las escrituras corren con rol de servicio y las lecturas con el rol
  del actor (ADR-0005). El contexto del actor llega por `AsyncLocalStorage`
  (`persistencia/contexto.ts`), fijado en el hook de autenticación.

## 6. API (`apps/api`)

Fastify 5, REST `/api/v1`, JSON, errores con `code` estable (spec §8.6).

### 6.1 Composición (`app.ts`)

`construirApp({ config?, reloj?, ids?, almacenamiento?, almacen?, usuarios? })` devuelve
`{ app, almacenamiento, motor, reloj, config, actorSistema }`. `Almacenamiento`
(`persistencia/almacenamiento.ts`) agrupa los tres puertos que la API necesita: `uow`
(`UnidadDeTrabajo`), `consultas` (`Consultas`) y `usuarios` (`RepositorioUsuarios`), más
`idSemilla()` para traducir los identificadores legibles del seed al almacén activo. Se construye
con `almacenamientoMemoria` o `almacenamientoPostgres` según `config.persistencia`. Registra CORS
(orígenes de `CORS_ORIGINS`), rate limit (por ruta), manejo de errores, autenticación, rutas y, solo
en `modoE2e` sobre memoria, `POST /api/v1/__e2e/reset`. `index.ts` escucha, programa el job de
expiración cada minuto con el usuario de servicio como autor y cierra el pool al recibir
`SIGINT`/`SIGTERM`. El parser JSON acepta cuerpo vacío como `{}` (los POST de
acción como `/ofertas/:id/aceptar` no llevan cuerpo); JSON malformado sigue siendo 400.

### 6.2 Autenticación (`auth/`)

Spec §3.3 tal cual: **roles internos** entran con contraseña + segundo factor TOTP, o con un código
de un solo uso por correo; **`member`** entra con un enlace mágico de un solo uso. Todo lo orquesta
`ServicioAuth` (`auth/servicio.ts`) sobre dos puertos: `RepositorioUsuarios` y `RepositorioAuth`
(`sesiones.ts`, con adaptadores en memoria y Postgres).

| Pieza                         | Cómo                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contraseña                    | scrypt con salt (`passwords.ts`). Solo roles internos; `member` no tiene.                                                                              |
| Segundo factor TOTP           | RFC 6238, SHA-1, 30 s, seis dígitos, ventana ±1 (`totp.ts`, probado contra los vectores del RFC). Secreto cifrado AES-256-GCM (`cifrado.ts`) en `usuarios.totp_secret_enc`. |
| Reto entre factores           | Token HMAC-SHA256 de 5 min con `proposito: 'totp'` (`tokens.ts`). Si el usuario no tiene TOTP, el reto lleva el secreto propuesto cifrado y un código válido lo activa: el 2FA es obligatorio desde el primer acceso. |
| Código por correo             | Seis dígitos, 10 min, un solo uso, cinco intentos (`otp_codes`, hash HMAC con `AUTH_SECRET`).                                                          |
| Enlace mágico                 | `WEB_URL/entrar?token=…`, 15 min, un solo uso (`otp_codes`, propósito `magic_link`).                                                                   |
| Sesión                        | Token opaco `sess_…` (256 bits); solo se guarda su hash en `sesiones`. Expira por rol (`DURACION_SESION_HORAS`: superadmin 4 h, admin 8 h, viewer 12 h, member 7 d). `POST /auth/logout` la revoca de verdad. |
| Re-autenticación              | `POST /auth/reauth` con contraseña o código abre una ventana de 5 min (`sesiones.reauth_hasta`); el guard `exigirReauth` la exige en acciones sensibles (reset de cola, TASK-0024). |
| Anti-enumeración              | Pedir código o enlace responde igual exista o no el correo; contraseña incorrecta y cuenta inexistente devuelven el mismo 401.                          |
| Canal                         | Puerto `Mensajeria` (`mensajeria.ts`): `consola` en desarrollo (el código o el enlace salen por el log de la API), `memoria` en tests y e2e. SMTP y WhatsApp: TASK-0026. |

El hook `onRequest` resuelve el Bearer a sesión + usuario, rellena `request.usuario`, `request.actor`
y `request.sesion`, y fija el contexto RLS. Rutas públicas: `/healthz`, `/readyz` y las de acceso.
Todas las rutas de acceso llevan rate limit por IP (`loginRateLimitMax`/min: 10 en producción, 1000
en e2e). Anti-replay TOTP (TASK-0040, RFC 6238 §5.2): `usuarios.totp_ultimo_paso` (migración 0015)
guarda el paso de 30 s del último código aceptado en login o re-autenticación y `pasoTotpValido`
rechaza cualquier código de un paso igual o anterior (el de entrar no sirve para re-autenticarse: el
siguiente sí); además cada usuario tiene como máximo `maxRetosTotp` (5) retos de segundo factor
vivos, el siguiente responde `DEMASIADOS_INTENTOS` hasta que uno se resuelva o caduque. En modo e2e
`/__e2e/totp` devuelve el siguiente paso no usado. ADR-0003 describe la autenticación de desarrollo
que esto sustituye.

### 6.3 RBAC (`auth/plugin.ts`, `packages/shared/src/roles.ts`)

`MATRIZ_RBAC[recurso][rol]` codifica la tabla de spec §3.2 (`permisos`, `own`, `enmascarado`,
`override`). El guard `exigir(recurso, permiso, { permitirOwn })` se declara en cada ruta; las rutas
`own` filtran por `actor.vehiculoIds` y el motor vuelve a comprobar el scope al aceptar/declinar
(`FORBIDDEN_OWN_SCOPE`). `MODULO_AUDIT` limita qué entidades de `audit_log` ve cada admin.
El enmascarado `R*` (cédula `******1658`, celular) se aplica en `vistas.ts`.

### 6.4 Rutas

| Método y ruta                                | Guard                        | Notas                                                             |
| -------------------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `GET /healthz`, `GET /readyz`, `GET /metrics` | público (`/metrics` con `METRICS_TOKEN`) | `readyz` = base (latencia) + `PING` a Redis si hay `REDIS_URL`, 503 si algo falla; `metrics` en texto Prometheus sin PII |
| `POST /auth/login`                           | público, rate limit          | con contraseña → `{ paso: 'totp', challenge }` o `{ paso: 'totp_enrolar', challenge, secret, otpauthUrl }`; sin contraseña → envía código o enlace y responde `{ paso: 'codigo_enviado' }` |
| `POST /auth/2fa/verify`                      | público, rate limit          | `{ challenge, codigo }` → sesión                                  |
| `POST /auth/otp/verify`                      | público, rate limit          | `{ email, codigo }` → sesión (roles internos)                     |
| `POST /auth/magic-link`, `/magic-link/canjear` | público, rate limit        | pedir enlace (`member`) y canjearlo → sesión                      |
| `POST /auth/logout`                          | token                        | revoca la sesión                                                  |
| `POST /auth/reauth`                          | token, rate limit            | `{ password }` o `{ codigo }` → `{ reauthHasta }`                 |
| `GET /me`                                    | token                        | usuario, `vehiculoIds`, `totpConfigurado`, `sesion.expiraEn`      |
| `GET /colas/:clase?clienteId=`               | cola R (no own)              | snapshot + `cabezaElegible`; member usa `/me/cola`                |
| `GET /colas/:clase/intervenciones`           | cola R                       | eventos `cola.override` / `cola.reset` de la clase; el veedor los ve (§21) |
| `POST /colas/:clase/override`                | cola U + re-auth             | `{ vehiculoId, posicion, motivo }`; solo superadmin                 |
| `POST /colas/:clase/reset`                   | cola U + re-auth (TOTP si `reset_cola_requiere_2fa`) | `{ motivo, confirmacion: 'RESETEAR', orden? }`       |
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
| `GET /usuarios`, `GET /usuarios/:id`         | usuarios R (admins)          | sin contraseñas ni secretos; `totpConfigurado`, `activo`, `vehiculoIds` |
| `POST /usuarios`                             | usuarios C (superadmin)      | `member` sin contraseña y con placas; internos con contraseña opcional |
| `PATCH /usuarios/:id`                        | usuarios U (superadmin)      | nombre, activo (desactivar revoca sesiones), asociado, contraseña |
| `POST /usuarios/:id/roles`                   | usuarios U (superadmin)      | cambia el rol primario y revoca sesiones; al dejar de ser member se limpian placas |
| `POST /usuarios/:id/vehiculos`               | usuarios U (superadmin)      | scope `own` del asociado; las placas deben existir                |
| `GET /clientes`, `/destinos`, `/motivos-declinacion` | catalogos R          |                                                                   |
| `GET /vehiculos`                             | vehiculos R (own)            | con habilitaciones por cliente; PII enmascarada para viewer       |
| `GET /vehiculos/semaforo`, `GET /vehiculos/:id/ficha` | vehiculos R (own)   | semáforo 30/7/vencido por placa; ficha = asociado, conductores, documentos, habilitaciones y posición |
| `POST/PATCH/DELETE /vehiculos`               | vehiculos C/U/D (hseq, superadmin) | alta entra al final de su cola; cambio de estado/clase exige motivo y mueve la placa entre colas; baja lógica conserva la ficha |
| `PUT /vehiculos/:id/habilitaciones/:clienteId` | habilitaciones U           | `{ apto, motivoBloqueo }` con snapshot de requisitos              |
| `PUT /vehiculos/:id/conductores`             | conductores U                | asigna conductores y principal                                    |
| `GET/POST/PATCH/DELETE /asociados`, `/conductores` | asociados / conductores CRUD | documento único (`DOCUMENTO_EN_USO`); `cuenta_bancaria_enc` cifrada AES-GCM y nunca sale por la API; baja lógica |
| `POST/PATCH/DELETE /clientes`, `/destinos`, `/transportadoras` | catalogos C/U/D  | ops actualiza, superadmin crea/borra (lógico)                     |
| `GET/POST/PATCH/DELETE /tarifas?clienteId=&vigenteEn=` | tarifas R/C/U/D      | finance crea; una tarifa tiene vigencia; hseq no las ve            |
| `GET /tipos-documento`, `GET/POST/PATCH/DELETE /documentos` | documentos R/C/U/D | `documentos_recalcular_estado` al escribir; un tipo que no aplica al sujeto es 400 |
| `GET /parametros`, `PATCH /parametros`       | parametros R / U             | PATCH valida el conjunto completo y audita `before/after`         |
| `GET /viajes?mes=&estado=&placa=`, `GET /viajes/:id` | viajes R (own, `R*`)  | member solo sus placas; viewer y member con cédula enmascarada; el detalle trae `tarifasSugeridas` (cruce tarifario) y el `recaudo` |
| `GET /viajes/resumen?mes=`                   | viajes R (no own)            | totales del mes por cliente y placa: flete, recaudo, pagado, pendiente ("el 3 % del mes sale del sistema") |
| `POST /viajes`                               | viajes C (finance)           | `{ trId, … }`: un viaje por TR (`VIAJE_YA_EXISTE`); TR cancelado o no tramitado → `TR_NO_VIAJABLE`; fija `tarifa_id` si hay una sola vigente |
| `PATCH /viajes/:id`                          | viajes U (ops, finance)      | fechas, lugar, transportadora, conductor, flete; el flete no cambia tras liquidar (`VIAJE_LIQUIDADO`) |
| `POST /viajes/:id/liquidar`                  | recaudos C (finance)         | `porcentaje_aplicado` = parámetro vigente (snapshot), `valor_recaudo` = `calcularRecaudo`, nace el recaudo `pendiente` y el TR pasa a `cumplido` (`tr.cumplir`) |
| `POST /viajes/:id/anular`                    | viajes D (finance)           | `{ motivo }`; sin pagos; el recaudo queda `castigado`             |
| `GET /recaudos?mes=&estado=`                 | recaudos R (own)             | estado de cobro; member solo lo suyo                              |
| `POST /recaudos/:id/pagos`                   | recaudos U (finance)         | `{ valor, fechaPago, referencia }` → `parcial`/`pagado`; `PAGO_INVALIDO` si supera lo pendiente, `RECAUDO_CERRADO` si ya está pagado o castigado |
| `GET /audit?entidad=&id=&limite=`            | audit_log R                  | acotado por `MODULO_AUDIT`                                        |
| `POST /jobs/expirar-ofertas`                 | cola U (superadmin)          | disparo manual del job                                            |
| `GET /tablero?mes=`                          | trs R (no own)               | ofertas, TR, viajes y equidad por placa del mes, calculado desde las fuentes; member no lo ve |
| `GET /tablero/snapshots?mes=`                | trs R (no own)               | snapshot guardado en `metricas_mes` (sin `mes`: lista de meses)  |
| `POST /jobs/snapshot-metricas`               | cola U (superadmin)          | `{ mes? }` (por defecto el mes anterior); reescribe el mes entero y audita `metricas.snapshot` |
| `GET /export/viajes.csv?mes=`                | export A (own, `R*`)         | CSV RFC 4180 con marca de agua (usuario, rol, fecha) en la primera línea; viewer con cédula enmascarada; member solo sus placas; audita `export.viajes` |
| `GET /me/extracto`                           | trs R (own), solo member     | habeas data: placas, TR, viajes, recaudos y textos de propósito/acceso/cancelación; audita `habeas.extracto` |
| `GET /documentos/alertas?dias=`              | documentos R (own, `R*`)     | vencidos y por vencer (ventana = `dias` o `dias_alerta` del tipo), del más urgente al menos; member solo sus placas |
| `POST /jobs/recalcular-documentos`           | documentos U (hseq, superadmin) | disparo manual del job nocturno `documentos_recalcular_estado`; auditado |
| `POST /__e2e/reset`                          | solo `modoE2e`               | vuelve al seed                                                    |

Todas las rutas de spec §8 están implementadas.

### 6.5 Contrato de error (`errores.ts`)

`ErrorDominio` → status de `CODIGOS_ERROR` (`COLA_LOCKED` 409, `COLA_VACIA` 422,
`VEHICULO_NO_HABILITADO` 422, `FORBIDDEN_OWN_SCOPE` 403, …). `ZodError` → 400 `VALIDATION_ERROR`
con `details.issues`. Rate limit → 429 `RATE_LIMITED`. Cualquier otro → 500 `INTERNAL` (se loguea).
404 → `NOT_FOUND`.

### 6.6 Seed (`seed.ts`, `persistencia/seed-postgres.ts`)

Determinista, anonimizado (spec §22.4): 17 placas del legado (10 en `TM-CBZ`, con `SPS413` no apta
para HLB y `UFR114` con SOAT vencido), 10 asociados `ASOCIADO NN ANONIMIZADO`, clientes, destinos,
motivos, dos requerimientos abiertos y ocho usuarios (uno por rol, dos `member` y el usuario de
servicio `sistema@asotracmet.test` sin contraseña ni login; uno de los member tiene dos TM: `FST189`
y `TKM221`). Contraseña única de desarrollo `Asotracmet2026!`.

`sembrarPostgres` vuelca ese mismo conjunto a Postgres (`pnpm db:seed`, idempotente). Los ids
legibles (`veh-FST189`) se convierten en UUID v5 deterministas con `uuidSemilla()`; clientes, motivos
y destinos que ya existen por `0010_datos_base` se resuelven por su llave de negocio.

**Migración del Excel legado** (`pnpm db:migrate-xlsx`, TASK-0025, spec §13): `infra/migracion/`
lee el xlsx con `exceljs` (`excel.ts`, solo celdas existentes y normalizadores de placa, fecha serial
y marcas `X`/`NA`/`NO`), construye un plan puro y testeable (`modelo.ts`: asociados, vehículos,
conductores, documentos, habilitaciones, destinos, tarifas, cola desde el TURNERO, viajes con TR
sintético y recaudo recalculado con `parametros.recaudo_porcentaje`, usuarios member) y lo carga en
una transacción repetible (`cargar.ts`, UUID v5 por llave de negocio, `--dry-run` hace rollback).
`informe.ts` escribe las excepciones de §13.1.8. Las decisiones de §13.2 y el mapeo hoja → tabla
están en [docs/migracion-excel.md](docs/migracion-excel.md). Nunca lee las columnas de contraseña
de GPS ni de correo; el xlsx vive en `RECURSOS/` fuera de git.

### 6.7 Puerto de consultas (`consultas/`)

Las rutas no leen el almacén: dependen de `Consultas` (`consultas/tipos.ts`), que devuelve vistas ya
compuestas (`VistaRequerimiento` con cupos asignados y libres, `VistaOferta` con placa, etiqueta y
requerimiento anidado, `VistaTr`, `VistaVehiculo` con habilitaciones, `MiPosicion`). Tras cada acción
del motor la ruta vuelve a consultar por id, así el cuerpo de la respuesta es el mismo en memoria y
en Postgres. `ConsultasMemoria` compone desde `EstadoMemoria`; `ConsultasPostgres` lo hace con SQL en
transacciones de solo lectura con el rol del actor. `vistaPosicion` (la cola) es la excepción: sale
del motor (`snapshotCola`) y no depende del almacén.

### 6.8 IAM (`rutas/usuarios.ts`, `usuarios.ts`)

Un rol primario por usuario (spec §3.1). Reglas que aplica la API, no la UI: un `member` nunca tiene
contraseña ni TOTP y es el único con placas (`usuario_vehiculos`); crear con correo repetido es
`EMAIL_EN_USO`; desactivar o cambiar de rol revoca todas las sesiones del usuario
(`RepositorioAuth.revocarSesionesDe`), y al dejar de ser `member` se limpian las placas; nadie se
desactiva ni cambia el rol a sí mismo. Solo superadmin escribe (es el único con `U` sobre
`usuarios` en la matriz); los `admin_*` leen. Cada cambio deja `usuario.crear`, `usuario.actualizar`,
`usuario.rol` o `usuario.vehiculos` en audit, siempre sin contraseñas ni secretos. El scope del
asociado se lee de la base en cada petición, así que asignar placas surte efecto al instante.

### 6.10 Tablero y métricas de equidad (`rutas/tablero.ts`, `tablero/`)

`calcularTablero` (puro, testeable) agrega por mes las ofertas (ofrecidas, aceptadas, declinadas,
expiradas, anuladas, por motivo y por clase), los TR por estado, los viajes liquidados y la
equidad por placa (turnos ofrecidos vs tomados). `GET /tablero` lo calcula en vivo; el job
`snapshot-metricas` (día 1 de cada mes en `index.ts`, o a mano) persiste la misma equidad en
`metricas_mes` (migración 0014, una fila por placa y mes, se reescribe entero: reproducible).
`RepositorioMetricas` tiene adaptador en memoria y Postgres (RLS: lo leen todos menos member).

### 6.9 Viajes y recaudo (`rutas/viajes.ts`, `viajes/`)

Bitácora y plata, no cola (spec §6.5): el motor no interviene salvo para cerrar el TR. Un viaje
nace de un TR vigente (`POST /viajes`), lleva el flete acordado con la transportadora y, si hay una
sola tarifa vigente para cliente, destino y clase, la referencia en `tarifa_id`; el detalle siempre
devuelve las tarifas vigentes como sugerencia. Al liquidar, `calcularRecaudo(flete,
recaudo_porcentaje)` (`packages/shared/src/recaudo.ts`) fija `porcentaje_aplicado` y
`valor_recaudo` como snapshot (§20.7: cambiar el parámetro solo afecta viajes nuevos), crea el
`recaudo` pendiente a nombre del asociado de la placa y pasa el TR a `cumplido` en la misma unidad
de trabajo, con `viaje.liquidar`, `recaudo.crear` y `tr.cumplir` en audit. Los pagos
(`POST /recaudos/:id/pagos`) acumulan `valor_pagado` y mueven el recaudo a `parcial` o `pagado`;
anular sin pagos deja el recaudo `castigado`. `RepositorioViajes` tiene adaptador en memoria
(vistas armadas desde la proyección del dominio) y Postgres (joins con TR, vehículo, asociado,
cliente, destino, transportadora y conductor; RLS de `viajes` y `recaudos` por placa del member).
`GET /viajes/resumen?mes=` agrega por cliente y placa: es el "3 % del mes" de la fase 2.

## 7. Frontend (`apps/web`)

- React 19 + TypeScript + Vite 8. Router por rol: `/login`, `/entrar` (enlace del asociado),
  `/ops` (sala de turnos: admin_ops, superadmin, admin_hseq, admin_finance, viewer), `/me`
  (member), `/hseq` (flota y documentos: quien lee `vehiculos` salvo member), `/finance` (viajes
  y recaudo: quien lee `viajes` salvo member; escribe finance), `/admin` (cola: override y reset)
  `/admin/usuarios` (IAM), `/admin/parametros` y `/admin/auditoria`, todos solo superadmin;
  `/tablero` (equidad del mes: quien lee `trs` salvo member).
- Estado servidor con TanStack Query (polling 4 s en colas, ofertas y TR; invalidación tras cada
  mutación). Sesión en `sessionStorage` vía `SesionProvider`; un 401 cierra sesión.
- `api/cliente.ts`: `fetch` a `/api/v1` (proxy de Vite a `:3001` en dev), lanza `ErrorApiCliente`
  con el `code` de la API; `utils/formato.ts` lo traduce.
- Pantallas: `Login`, `Ops` (tres columnas: requerimientos con "Ofrecer cupo" solo si
  `puede(rol,'ofertas','C')`; colas por pestaña de clase y cliente, cabeza elegible resaltada,
  no elegibles en gris con motivo; actividad con ofertas abiertas (anular con motivo) y TR
  recientes con copia del código en un tap), `Me` (posición por placa, `OfertaCard` con
  Aceptar/Declinar + motivo de catálogo, Mis TR, Mis documentos: semáforo propio de solo lectura),
  `Hseq` (alertas de vencimiento, semáforo de placas, ficha con
  documentos, conductores y habilitaciones por cliente con motivo, alta de placa y de documento,
  cambio de estado con motivo), `Finance` (TR sin viaje → crear viaje; ficha con flete acordado,
  tarifa sugerida en un tap, fechas, lugar y transportadora; liquidar mostrando el recaudo que
  saldrá; registrar pagos; anular con motivo; resumen del mes por cliente y placa), `Admin`
  (override y reset de cola con re-autenticación), `Usuarios` (alta, rol, placas,
  activar/desactivar), `Parametros` (formulario de reglas como datos con validación Zod compartida,
  confirmación y últimos cambios) y `Auditoria` (tabla filtrable por entidad, id y acción con el
  antes/después legible vía `resumenCambios`) y `Tablero` (ofertas, TR, viajes y equidad por
  placa del mes, solo lectura). `Finance` exporta el CSV del mes y `Me` descarga el extracto de
  habeas data con `descargar()` (`api/cliente.ts`: fetch con Bearer y descarga por blob).
- Colores (spec §9.3): ámbar oferta abierta, verde TR asignado, rojo cancelado/declinado, gris no
  habilitado.
- PWA (spec §9.1, TASK-0031): `vite-plugin-pwa` genera el manifest (iconos PNG 192/512 y SVG,
  `standalone`) y un service worker Workbox con el shell precacheado y `NetworkFirst` solo para las
  lecturas propias (`/api/v1/me/*`, alertas de documentos, motivos); las escrituras nunca se
  cachean. `registerSW` en `main.tsx` (autoUpdate); `EstadoConexion` muestra el aviso de sin
  conexión. El service worker también corre en dev/e2e (`devOptions.enabled`) para poder probarlo
  offline con Playwright.
- `Admin` (`/admin`, solo superadmin): override y reset de cola como acciones auditadas, con
  motivo, confirmación literal `RESETEAR`, confirmación del navegador y código TOTP para
  re-autenticarse; lista de intervenciones de la clase. `Ops` muestra esas intervenciones a todos
  los que ven la cola, veedor incluido (§21).
- `Usuarios` (`/admin/usuarios`, solo superadmin): alta de usuarios por rol (asociado con placas,
  interno con contraseña opcional), cambio de rol con confirmación, activar/desactivar y placas del
  asociado.
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
| `0011_rol_app_y_consultas` | `audit_log.actor_id` pasa a texto (los jobs firman como `sistema`); `grant asotracmet_app to current_user`; `cola_total(clase)` security definer para el denominador de "Tu posición" bajo RLS |
| `0012_sesiones`       | `sesiones` (hash del token, expiración por rol, `revocada_en`, `reauth_hasta`); índices de `otp_codes`; sustituye y elimina `refresh_tokens`                  |
| `0013_reauth_factor`  | `sesiones.reauth_factor` (`password` \| `totp`): el reset de cola exige el segundo factor cuando `reset_cola_requiere_2fa`                                    |
| `0015_totp_anti_replay` | `usuarios.totp_ultimo_paso` (anti-replay TOTP, TASK-0040)                                                                                       |
| `0014_metricas_mes`   | `metricas_mes` (snapshot mensual de equidad por placa, RLS lectura para todo rol menos member) |

La API abre cada transacción con `set local app.rol` y `set local app.vehiculo_ids`; sin ellos el
rol efectivo es `sistema` (migraciones y jobs). **Un superusuario o el owner de las tablas se salta
RLS**: la API se conecta como `asotracmet_app` (rol sin login creado en `0009_rls.sql`, con
`SET ROLE` por transacción, o un rol de login que lo herede), nunca como el usuario de migraciones.
El test `RLS: un member solo ve los TR de sus placas` prueba exactamente eso con `set local role`.
`AlmacenPostgres` mapea `Transaccion` a estas tablas (§5.7); las escrituras del motor corren con
`app.rol = 'sistema'` y las lecturas con el rol del actor (ADR-0005). Migraciones, semilla y API
sobre Postgres se validan con `pnpm test:db` (CI job `db`).

## 9. Seguridad

- Acceso (§6.2): contraseña scrypt + TOTP obligatorio para roles internos, o código por correo;
  enlace mágico para `member`; sesiones opacas revocables con expiración por rol; re-autenticación
  para acciones sensibles; secretos TOTP cifrados AES-256-GCM con clave del entorno; rate limit en
  todas las rutas de acceso; respuestas que no revelan si un correo existe.
- Autorización: RBAC en cada ruta + scope `own` + RLS en base (§8). Un `member` que vea placas
  ajenas es incidente (RULE-022).
- PII: enmascarado para `viewer` (y `member` en viajes) en las vistas; nunca en logs.
- Secretos: prohibido persistir credenciales de terceros (no existe columna); `AUTH_SECRET` y
  claves de cifrado del entorno; `.env` ignorado por git.
- Rate limit en login; CORS estricto por `CORS_ORIGINS`.
- Pendiente: anti-replay del código TOTP dentro de su ventana (TASK-0040), SMTP y WhatsApp como
  canal real de códigos y enlaces (TASK-0026), cifrado de `cuenta_bancaria_enc` (TASK-0023),
  exportaciones con watermark (TASK-0034), backups cifrados y restore drill (TASK-0035).

## 10. Estrategia de pruebas

| Proyecto Vitest / suite | Dónde                              | Cubre                                                                                                                             |
| ----------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `shared`                | `packages/shared/src/*.test.ts`    | placas, matriz RBAC (viewer no muta, member own), estados, parámetros, PII, fechas Bogotá                                        |
| `domain`                | `packages/domain/src/*.test.ts`    | spec §16: cabeza no habilitada → toma la 2; dos TM del mismo asociado; ofrecer+declinar+reofertar en una tx; 20 paralelos → 1 + 19 `COLA_LOCKED`; políticas de declinación; expiración; cancelar TR; secuencia TR; rollback; invariantes |
| `api`                   | `apps/api/src/**/*.test.ts`        | TOTP contra los vectores del RFC 6238; cifrado AES-GCM; tokens de reto; contraseña + TOTP, enrolamiento en el primer acceso, reto caducado, código por correo de un solo uso, bloqueo tras cinco intentos, anti-enumeración, enlace mágico de un solo uso y caducado, logout que revoca, re-autenticación; expiración de sesión por rol; viewer no muta (403); member no lista TR ajenos; PII enmascarada; flujo ofrecer→aceptar/declinar; idempotencia; parámetros auditados; job; concurrencia HTTP con transacciones lentas; override y reset (RBAC, re-autenticación, segundo factor obligatorio por parámetro, intervenciones visibles para viewer); IAM (listado sin secretos, creación por rol, el nuevo usuario entra, cambio de rol revoca sesiones, desactivación, placas del asociado auditadas) |
| `web`                   | `apps/web/src/**/*.test.tsx?`      | formato/traducción de errores; `OfertaCard` (declinar exige motivo)                                                               |
| `db`                    | `infra/postgres/migraciones.test.ts` | migraciones idempotentes, tablas, audit append-only, RLS member con `set local role`, unicidad diferible, checks de placa. Se omite sin `DATABASE_URL` |
| `db`                    | `infra/postgres/api-postgres.test.ts` | la API completa sobre Postgres real: sesiones y enlaces persistidos (logout revoca, enlace de un solo uso), enrolamiento TOTP cifrado en la base, cola con elegibilidad, ofrecer→aceptar persistido (posiciones, audit, secuencia TR), declinar con reoferta, cancelar TR, viewer no muta, member no lee ajenos, "Tu posición: 2 de 10" bajo RLS, `COLA_LOCKED` con la clase bloqueada por otra tx, 20 coordinadores en paralelo sobre un cupo → una sola oferta, parámetros auditados; override y reset persistidos con el factor de re-autenticación; usuarios y placas de asociado persistidos (crear, entrar, cambiar rol) |
| `db`                    | `infra/postgres/anonimizar.test.ts` | copia anonimizada para staging en una base aparte: sin PII ni secretos, operación intacta, trigger append-only reactivado |
| `migracion`             | `infra/migracion/modelo.test.ts` | normalizadores (placa, serial de Excel, marcas, clase), plan sobre un libro sintético con la forma del Excel real (precedencia de asociado, alias, habilitaciones, tarifas, cola densa, TR sintético, recaudo y excepciones) y criterios §13.3 sobre el xlsx real si está presente |
| e2e                     | `e2e/*.spec.ts`                    | login ops (contraseña + TOTP) → ofrecer → login member (enlace) → aceptar → aparece TR; declinar con motivo → pasa a la siguiente placa; viewer sin botones y 403 en API; credenciales inválidas; código TOTP incorrecto y correcto; administrador sin segundo factor lo configura en el primer acceso; el enlace del asociado es de un solo uso; superadmin resetea la cola con motivo, confirmación y segundo factor y el veedor ve la intervención; superadmin da de alta un asociado con placa que entra con su enlace |

Comandos: `pnpm test` (unit/integración), `pnpm test:coverage`, `pnpm test:e2e`, `pnpm test:db`.
`pnpm check` = lint + formato + tipos + unit. CI (`.github/workflows/ci.yml`): job `check`, job `e2e`
(Chromium; el test de PWA usa un tercer servidor `vite preview` con el build real) y job `db` (servicio Postgres 16 → `db:migrate` + `db:seed` + `test:db`).

Los e2e usan puertos propios (API `3101`, web `5273`) para convivir con `pnpm dev` sin reutilizar por
error un servidor que no esté en modo e2e.

## 11. Configuración y entornos

Variables (`.env.example`): `PORT`, `HOST`, `AUTH_SECRET`, `CIFRADO_CLAVE` (32 bytes base64; en
desarrollo se deriva de `AUTH_SECRET`), `CORS_ORIGINS`, `WEB_URL` (base de los enlaces de acceso),
`MENSAJERIA` (`consola` | `memoria`), `OTP_TTL_MINUTOS`, `MAGIC_LINK_TTL_MINUTOS`, `REAUTH_MINUTOS`,
`PERSISTENCIA` (`memoria` | `postgres`), `DATABASE_URL`, `REDIS_URL`, `LOG_LEVEL`,
`LOGIN_RATE_LIMIT_MAX`, `ASOTRACMET_E2E`. La semilla cifra los secretos TOTP con la misma clave que
la API: `pnpm db:seed` y la API deben correr con el mismo `AUTH_SECRET`/`CIFRADO_CLAVE`. Modos de la API: memoria (por defecto), postgres (`PERSISTENCIA=postgres` +
`DATABASE_URL` migrada y sembrada con `pnpm db:reset`, o migrada y cargada desde el Excel con `pnpm db:migrate-xlsx`), e2e (`--e2e`: memoria + seed + reset). Los puertos que publica `infra/compose.yaml` se cambian con `ASOTRACMET_PG_PORT` y `ASOTRACMET_REDIS_PORT` (TASK-0042); `XLSX_LEGADO` apunta al Excel legado. En producción (TASK-0032) `WEB_DIR` hace que la API sirva el build de la web (estáticos + `index.html` para las rutas del SPA; `/api/*` nunca cae al SPA), `MIGRACIONES_DIR` ubica los `.sql` empaquetados y `CIFRADO_CLAVE` es obligatoria. Observabilidad (TASK-0030): `METRICS_TOKEN` protege `/metrics`, `OTEL_EXPORTER_OTLP_ENDPOINT` y `OTEL_SERVICE_NAME` activan la exportación OpenTelemetry (`telemetria.ts`), `REDIS_URL` lo comprueba `/readyz`. `pnpm build` genera `apps/api/dist/index.mjs` (esbuild ESM, sin `tsx`), `apps/web/dist` y `dist/scripts/*.mjs`; el `Dockerfile` los empaqueta en `node:24-alpine` con solo las dependencias de producción y aplica migraciones al arrancar. Guía completa en [docs/despliegue.md](docs/despliegue.md).
Ambientes objetivo: `dev`, `staging` (copia anonimizada: `pnpm db:anonymize-staging --confirmo <base>` sobre un restore, `infra/postgres/anonimizar.ts`, TASK-0035) y `prod`. Staging nunca
con claves reales porque no deben existir.

## 12. Jobs y procesos de fondo

Hoy, en el propio proceso de la API (`index.ts`, sin BullMQ mientras haya una sola instancia):
expirar ofertas cada minuto (`POST /jobs/expirar-ofertas` lo dispara a mano) y recalcular
`documentos.estado` un minuto después de arrancar y luego cada 24 h con el rol de servicio
(`POST /jobs/recalcular-documentos` lo dispara HSEQ o superadmin y queda auditado). El semáforo
que ven las pantallas se calcula al leer (`estadoDocumento`), así que el job solo mantiene la
columna para consultas SQL y RLS. Objetivo (spec §14): alertas por correo/WhatsApp y digest diario a
ops (TASK-0026), snapshot mensual de equidad (TASK-0029), archivado de `audit_log` a 24 meses
(TASK-0030).

## 13. Estado actual vs objetivo

| Componente               | Hoy                                             | Objetivo                                       | Tarea               |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------- | ------------------- |
| Motor de cola            | completo (§7) con tests, override y reset auditados | anti-replay TOTP en re-autenticación       | TASK-0040           |
| Persistencia             | memoria (dev/e2e) o Postgres con RLS y locks     | + Redis para lock multi-instancia              | TASK-0020           |
| Auth                     | contraseña + TOTP, código por correo, enlace mágico, sesiones revocables, re-auth | + SMTP/WhatsApp reales, anti-replay TOTP | TASK-0026, 0040     |
| IAM y maestros           | usuarios, roles, scope member y CRUD de maestros por rol (API + `/hseq`, `/admin/usuarios`) | catálogo de destinos canónicos tras la migración | TASK-0023 (hecha)   |
| Pantallas                | login, ops, member, hseq, finance, tablero, admin (cola, usuarios, parámetros, auditoría); PWA instalable con lectura offline de Mi turno | notificaciones in-app (TASK-0026) | —                   |
| Viajes / recaudo         | viaje desde TR, flete vs tarifa, liquidación con snapshot del parámetro, pagos y resumen mensual (API + `/finance`, memoria y Postgres con RLS) | export CSV, tablero viewer | TASK-0027 (hecha), 0029, 0034 |
| HSEQ                     | documentos con semáforo 30/7/vencido (calculado al leer), alertas en `/hseq` y `/me`, habilitación por cliente con motivo, job nocturno de recálculo; verificado con datos reales (8 placas rechazadas por documento vencido) | subida de soportes a object storage | TASK-0028 (hecha), 0043 |
| Notificaciones           | —                                                | in-app, email, WhatsApp opt-in, outbox         | TASK-0026           |
| Migración Excel          | `pnpm db:migrate-xlsx`: plan puro, carga repetible, informe (docs/migracion-excel.md) | atar TR reales cuando haya planilla con placa; catálogo de destinos canónicos | TASK-0025 |
| Observabilidad           | `/readyz` con base y Redis, `/metrics` Prometheus (COLA_LOCKED, latencia de ofrecer, declinaciones, ofertas abiertas), OTel (span `cola.transaccion` + métricas OTLP) opcional, runbooks en `docs/runbooks/` | alertas configuradas en el colector; lock Redis (TASK-0020) | TASK-0030 (hecha)   |
| Despliegue               | `pnpm build` (esbuild + Vite), `Dockerfile` multi-stage, `infra/compose.prod.yaml`, backups cifrados y restore (`docs/despliegue.md`) | Fly/Render con la misma imagen; readyz con Redis | TASK-0032 (hecha), 0030 |

## 14. Runbooks

Los runbooks completos viven en [docs/runbooks/](docs/runbooks/README.md) (cola trabada,
secuencia TR desfasada, member ve placa ajena, restore en staging, observabilidad). Resumen:

- **Cola trabada / `COLA_LOCKED` persistente**: el lock es un advisory lock de transacción
  (`pg_try_advisory_xact_lock`) más `for update nowait`; muere con la transacción, así que un bloqueo
  persistente significa una transacción viva: `select pid, state, query_start from pg_stat_activity
  where state <> 'idle'` y `pg_terminate_backend(pid)` solo si es un cliente colgado. Con Redis
  (TASK-0020): `DEL cola:{clase}` solo tras confirmar que no hay transacción viva.
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
- [ADR-0005](docs/adr/0005-escrituras-con-rol-de-servicio.md) — Escrituras del motor con rol de servicio, lecturas con el rol del actor.
