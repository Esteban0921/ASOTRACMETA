# ASOTRACMET — Sistema de Enturnamiento y Operación Gremial

Especificación funcional y técnica para construir el producto que reemplaza el libro `control de enturnamiento.xlsx`.

Autoría de diseño: enfoque full stack.
Dominio: Asociación de Tractocamioneros del Meta (NIT 902.070.305-2).
Cliente ancla de operación: Halliburton (HLB) y habilitaciones cruzadas (Baker, Weatherford, Qmax, Tenaris, SLB, Nabors, Geopark, Frontera, Tecpetrol).
Fecha de referencia del legado: septiembre 2026.

---

## 0. Cómo leer este documento

Esto no es un CRM de ventas. Es un **sistema de cola gremial + bitácora de viajes + recaudo + habilitación HSEQ**, con IAM multinivel.

Si hay que recortar alcance, el orden de corte es:

1. No se corta el motor de cola ni los roles.
2. No se corta la auditoría.
3. Se corta presupuesto, asistencia a reuniones y directorio comercial.
4. Se pospone HSEQ bloqueante completo si hay que entregar en semanas, pero el modelo de datos **sí** nace con `habilitaciones` y `documentos`.

El Excel actual es la fuente de verdad sucia. El sistema nuevo es la fuente de verdad limpia. La migración es un proyecto, no un `COPY`.

---

## 1. Problema que el software resuelve

Hoy la asociación opera así:

- Una grilla mensual por clase de vehículo (`C100`, `C350`, `C600`, `MM`, `TM-CBZ`).
- Cada cupo tiene un número de rotación 1-2-3, una fecha y un código `TR-xxxxx`.
- Quien coordina escribe a mano `DECLINA`, `DECLINO`, `NOVEDAD`, `NO TRAMITAR`, `TR-` incompleto.
- La misma placa vive en cinco hojas distintas, con nombres recortados (`ELKIN M`) y cédulas a veces vacías.
- El viaje (flete + 3%) vive en otra familia de hojas (`SERV MAY26` … `SERV SEPT26`) copiadas desde una plantilla que todavía se llama “JUNIO”.
- Las habilitaciones por cliente viven en `TURNERO` como cruces de `X` / `NA` / `NO`.
- Contraseñas de GPS y plataformas están en el mismo archivo que el turno del día.

Eso produce cuatro fallas de sistema:

1. No hay invariante de equidad (no se puede probar que no se saltó la cola).
2. No hay cadena `requerimiento → oferta → TR → viaje → recaudo`.
3. No hay frontera de permisos. Quien tiene el xlsx puede ver y editar todo.
4. El archivo se corrompe operacionalmente: rangos inflados a 1.048.576 filas, freeze panes absurdos, estados libres.

El producto existe para que **un superadmin configure reglas**, **unos admins operen módulos**, y **el resto solo vea lo que le toca**.

---

## 2. Objetivos y no-objetivos

### Objetivos (MVP + fase 1)

- Identidad y roles: superadmin, admins de módulo, consulta, asociado/conductor.
- Maestros: asociados, vehículos (placa = llave natural), conductores, clientes, destinos, transportadoras, clases de equipo.
- Motor de cola por clase + filtro de habilitación por cliente.
- Oferta de turno con aceptación / declinación / cancelación / reencolado.
- Generación y ciclo de vida del `TR`.
- Registro de viaje (cargue, descargue, destino, flete, 3%).
- Tablero del mes y bitácora inmutable de cambios de cola.
- Migración controlada del histórico 2026.

### No-objetivos del MVP

- TMS / RNDC / manifiestos / factura electrónica DIAN.
- Telemetría GPS en vivo (solo se guarda qué proveedor usan; jamás la clave).
  - *Ampliación acotada, decidida en ADR-0007 (TASK-0062, 2026-09-22):* sí entra, como satélite de
    fase 4 (§19), la **última ubicación conocida por placa refrescada cada pocos minutos** con su
    historial de retención corta, que un proceso aparte trae de la plataforma del propietario. Lo
    que sigue fuera: el seguimiento segundo a segundo, las geocercas y cualquier regla de cola que
    dependa de la posición. Lo de «jamás la clave» **no cambia**: las credenciales viven en un
    archivo de secretos del host, nunca en la base (§12, §20.9).
- App de chat. WhatsApp queda como canal de notificación, no como base de datos.
- Contabilidad completa de la asociación.
- Multipaís o multi-asociación. Un tenant: ASOTRACMET.

### Objetivo de arquitectura

El día que crezcan a 30–80 asociados, no se reescribe el dominio. Se cambia de AppSheet a API propia sin romper tablas mentales: `asociado`, `vehiculo`, `cola_posicion`, `oferta`, `tr`, `viaje`.

---

## 3. Actores y matriz RBAC

### 3.1 Roles

| Código | Nombre | Naturaleza |
|---|---|---|
| `superadmin` | Superadministrador | IAM + parámetros + auditoría global |
| `admin_ops` | Administrador operativo / coordinador | Cola, ofertas, TR |
| `admin_hseq` | Administrador de flota / HSEQ | Vehículos, conductores, documentos, habilitaciones |
| `admin_finance` | Comercial / tesorería | Tarifas, viajes (valores), recaudo |
| `viewer` | Consulta / veedor | Solo lectura de tableros y colas |
| `member` | Asociado / conductor | Vista y acción limitada a sus placas |

Un usuario puede tener **un rol primario** y, si hace falta, scopes extra (`can_export`, `can_impersonate` solo superadmin). No apilar tres roles “admin” en la misma persona salvo el arranque.

### 3.2 Permisos por recurso

Leyenda: `C` crear, `R` leer, `U` actualizar, `D` borrar lógico, `A` acción de dominio, `-` nada, `own` solo registros ligados a sus `vehiculo_ids`.

| Recurso | superadmin | admin_ops | admin_hseq | admin_finance | viewer | member |
|---|---|---|---|---|---|---|
| usuarios / roles | CRUD | R | R | R | - | - |
| parametros (reglas cola, % recaudo) | RU | R | R | R | R | - |
| asociados | CRUD | R | RU | R | R* | own |
| vehiculos | CRUD | R | CRUD | R | R* | own |
| conductores | CRUD | R | CRUD | R | R* | own |
| documentos / vencimientos | CRUD | R | CRUD | - | R* | own |
| habilitaciones cliente×placa | CRUD | R | CRUD | - | R | own |
| clientes / destinos / transportadoras | CRUD | RU | R | CRUD | R | R |
| tarifas | CRUD | R | - | CRUD | R | - |
| requerimientos de carga | CRUD | CRUD | R | R | R | - |
| cola / posiciones | RU + reset auditado | A | R | R | R | own |
| ofertas | R + override auditado | CA | R | R | R | own + A aceptar/declinar |
| TR | override | CAU | R | R | R | own |
| viajes | override | RU fechas/lugar | R | CRUD valores | R* | own* |
| recaudo / pagos 3% | override | R | - | CRUD | R* | own |
| audit_log | R | R propio módulo | R propio | R propio | - | - |
| export CSV | sí | ops | hseq | finance | no PII | solo propio |

`R*` = campos enmascarados. Cédula se muestra `******1658`. Celular, correo y salud no salen para `viewer`. Claves de plataformas **no existen** en este sistema.

### 3.3 Reglas IAM que no se negocian

- Autenticación por correo + OTP o password + 2FA para cualquier rol que no sea `member`. `member` puede entrar con magic link al celular.
- Sesiones cortas en `admin_*` (8 h) y más cortas en `superadmin` (4 h) con re-auth para borrar o resetear cola.
- Soft delete en maestros. Nunca `DELETE FROM vehiculos` si hay TR históricos.
- Row Level Security en base de datos, no solo `if (role)` en el frontend. El frontend miente; la DB no.
- Un `member` autenticado ejecuta `WHERE vehiculo_id IN (placas_del_usuario)`. Punto.

---

## 4. Dominio: lenguaje ubicuo

Usar estas palabras en código, UI y SQL.

- **Asociado**: persona natural o jurídica afiliada. No es automáticamente el conductor ni el propietario registral.
- **Vehículo**: unidad identificada por `placa`. Tipos: `C100`, `C350`, `C600`, `MM`, `TM`, `CBZ`.
- **Clase de cola**: agrupador de rotación. En el legado `TM` y `CBZ` comparten `TM-CBZ`.
- **Habilitación**: permiso de una placa para un cliente, con requisitos (antigüedad, km, cursos).
- **Requerimiento**: pedido de un cliente (HLB u otro) que necesita N cupos de una clase hacia un destino.
- **Posición de cola**: lugar actual de una placa dentro de su clase.
- **Oferta**: acto de ofrecerle un cupo a la cabeza elegible.
- **TR**: identificador de trámite/servicio ante el cliente (`TR-41946`). Nace al aceptar o al asignar forzado.
- **Viaje**: ejecución física (cargue, descargue, flete, transportadora, 3%).
- **Declinación**: el asociado no toma el cupo. Es un evento, no un texto en una celda.
- **Cancelación**: el TR o el requerimiento se cae después de asignado.
- **Recaudo**: 3% sobre flete (parámetro, no constante mágica), estado de cobro.

Estados cerrados. Nunca texto libre como estado.

```text
oferta:     abierta | aceptada | declinada | expirada | anulada
tr:         asignado | en_curso | cumplido | cancelado | no_tramitar
viaje:      borrador | cargado | descargado | liquidado | anulado
recaudo:    pendiente | parcial | pagado | cruzado | castigado
vehiculo:   activo | inactivo | bloqueado_hseq | vendido
documento:  vigente | por_vencer | vencido
```

---

## 5. Arquitectura

### 5.1 Forma recomendada (fase producto)

```text
[PWA / Web React]  +  [App asociada (misma PWA)]
         | HTTPS + JWT / session
         v
[API Node.js o NestJS]  —  jobs (BullMQ)  —  notificaciones
         |
         +-- Postgres (fuente de verdad)
         +-- Redis (sesión, locks de cola, rate limit)
         +-- Object storage (S3 compatible) para soportes, no secretos
         +-- SMTP + WhatsApp Cloud API (opcional)
         +-- OpenTelemetry + logs estructurados
```

Monolito modular al inicio. No microservicios. El único bounded context que merece extracción futura es `billing/recaudo`.

### 5.2 Forma válida de arranque (fase puente)

Si hay que salir en 3–6 semanas:

```text
[AppSheet o Glide]
         |
[Postgres vía API o Airtable / Sheets normalizado]
```

Las **tablas y estados de este documento se respetan igual**. AppSheet no es licencia para modelar mal. El puente se diseña para evacuar a la API del 5.1 sin rehacer el diccionario.

### 5.3 Principios de implementación

- Escrituras de cola son transaccionales y con lock por `clase_cola`.
- Toda mutación de dominio emite `audit_log` en la misma transacción.
- IDs internos: UUID v7. Códigos de negocio (`TR-41946`, placa) son atributos únicos, no PK.
- Soft delete + `version` (optimistic locking) en cola y TR.
- Idempotencia en endpoints de oferta (`Idempotency-Key`).
- El frontend no calcula el siguiente de la cola. Llama `POST /ofertas`.

---

## 6. Modelo de datos

Postgres 16+. Extensiones: `pgcrypto`, `citext`, `btree_gist` si se validan solapes de viaje.

### 6.1 IAM

```sql
usuarios (
  id uuid pk,
  email citext unique not null,
  telefono text,
  nombre text not null,
  password_hash text,          -- null si magic link
  rol text not null check (rol in (...)),
  activo boolean not null default true,
  asociado_id uuid null references asociados(id),
  last_login_at timestamptz,
  created_at, updated_at
)

usuario_vehiculos (
  usuario_id, vehiculo_id,     -- scope member
  unique(usuario_id, vehiculo_id)
)

sesiones / refresh_tokens / otp_codes
```

### 6.2 Maestros de gente y flota

```sql
asociados (
  id uuid pk,
  tipo text check (tipo in ('persona','empresa')),
  nombres text,
  apellidos text,
  razon_social text,
  documento text not null,          -- CC o NIT, unique
  documento_tipo text,
  celular text,
  correo text,
  direccion text,
  cuenta_bancaria_enc text,         -- cifrado aplicación, no plaintext
  estado text default 'activo',
  fecha_afiliacion date
)

vehiculos (
  id uuid pk,
  placa text unique not null,       -- normalizar: [A-Z]{3}[0-9]{3}
  clase text not null,              -- C100 C350 C600 MM TM CBZ
  clase_cola text not null,         -- TM-CBZ agrupa TM y CBZ
  tipo_carroceria text,             -- cama_alta, carroceria, cabezote...
  modelo int,
  repotenciacion int,
  largo_mts numeric(5,2),
  km_recorrido int,
  asociado_id uuid references asociados,   -- poseedor gremial
  propietario_nombre text,
  propietario_documento text,
  parentesco text,                  -- esposa, mama, empresa_propia, otros
  trailer_placa text,
  gps_proveedor text,               -- SATRACK, rastreoflotas... NUNCA password
  estado text default 'activo'
)

conductores (
  id uuid pk,
  nombres text not null,
  documento text unique not null,
  celular text,
  correo text,
  asociado_id uuid,
  licencia_categoria text,
  licencia_vence date
)

vehiculo_conductores (
  vehiculo_id, conductor_id, es_principal boolean,
  unique(vehiculo_id, conductor_id)
)
```

### 6.3 HSEQ y habilitación

```sql
tipos_documento (
  id, codigo unique,               -- SOAT, TECNOMEC, POLIZA, CURSO_HLB, VACUNA_FIEBRE...
  nombre, aplica_a text,           -- vehiculo | conductor
  dias_alerta int default 30
)

documentos (
  id,
  sujeto_tipo text,                -- vehiculo | conductor
  sujeto_id uuid,
  tipo_id,
  numero text,
  emitido_en date,
  vence_en date,
  archivo_url text,                -- storage, no el xlsx
  estado generated or trigger
)

clientes (
  id, codigo unique,               -- HLB, BAKER, WTF, QMAX, TENARIS, SLB...
  nombre, requiere_habilitacion boolean default true
)

habilitaciones (
  id,
  vehiculo_id,
  cliente_id,
  apto boolean not null,
  motivo_bloqueo text,
  requisitos jsonb,                -- snapshot de checks del TURNERO
  unique(vehiculo_id, cliente_id)
)
```

Una placa **no entra a oferta** si:

- `vehiculos.estado != activo`
- existe documento bloqueante vencido (configurable por tipo)
- `habilitaciones.apto is not true` para el cliente del requerimiento

Eso reemplaza las `X` / `NA` / `NO` del TURNERO.

### 6.4 Catálogos de operación

```sql
destinos (
  id, nombre text unique,          -- CASTILLA LA NUEVA, RUBIALES - CAJUA...
  km int,
  activo boolean
)

transportadoras (
  id, nombre text unique,          -- MASA, GAYCO, COROCORAS, SOLCARGA
  activo boolean
)

tarifas (
  id,
  cliente_id,                      -- HLB / BAKER / WTF
  origen text default 'VILLAVICENCIO',
  destino_id,
  clase text,                      -- C100...
  modalidad text,                  -- cama_alta, carroceria, cabezote, rigido...
  valor numeric(14,2) not null,
  vigencia_desde date not null,
  vigencia_hasta date,
  unique (cliente_id, destino_id, clase, modalidad, vigencia_desde)
)
```

No hay una sola celda mágica. Una tarifa tiene vigencia. El viaje guarda `tarifa_id` y `flete_acordado` (puede diferir).

### 6.5 Cola, oferta, TR, viaje

```sql
parametros (
  key text pk,
  value jsonb not null
)
-- ejemplos:
-- recaudo_porcentaje = 0.03
-- oferta_ttl_minutos = 120
-- declinacion_politica = 'al_final' | 'penaliza_n' | 'bloqueo_horas'
-- declinacion_n = 1
-- reset_cola_requiere_2fa = true

requerimientos (
  id,
  cliente_id not null,
  destino_id,
  clase_cola not null,
  fecha_servicio date not null,
  cantidad_cupos int not null default 1,
  observaciones text,
  estado text,                     -- abierto, cerrado, cancelado
  creado_por
)

cola_posiciones (
  id,
  clase_cola not null,
  vehiculo_id not null,
  posicion int not null,           -- 1 = cabeza
  ciclo int not null default 1,    -- para no reutilizar lógica 1-2-3 sucia
  unique(clase_cola, vehiculo_id),
  unique(clase_cola, posicion)
)

ofertas (
  id,
  requerimiento_id,
  vehiculo_id not null,
  asociado_id,
  ofrecida_por uuid not null,      -- admin_ops
  ofrecida_en timestamptz not null default now(),
  expira_en timestamptz,
  estado text not null,
  motivo_declinacion_id,
  respondida_en timestamptz,
  respondida_por uuid
)

motivos_declinacion (
  id, codigo unique, nombre, activo
)

trs (
  id,
  codigo text unique not null,     -- TR-41946
  oferta_id unique,
  requerimiento_id,
  vehiculo_id not null,
  clase_cola,
  cliente_id,
  destino_id,
  fecha_asignacion date not null,
  estado text not null,
  cancelado_en, cancelado_por, motivo_cancelacion,
  created_at
)

viajes (
  id,
  tr_id unique,
  vehiculo_id,
  conductor_id,
  fecha_cargue date,
  fecha_descargue date,
  lugar_descargue text,
  transportadora_id,
  tarifa_id,
  flete numeric(14,2),
  porcentaje_aplicado numeric(5,4),
  valor_recaudo numeric(14,2),
  valor_pagado numeric(14,2),
  estado text,
  notas text
)

recaudos (
  id,
  viaje_id,
  asociado_id,
  valor numeric(14,2),
  estado,
  fecha_pago date,
  referencia text,                 -- consignación
  created_at
)
```

### 6.6 Auditoría

```sql
audit_log (
  id,
  at timestamptz default now(),
  actor_id,
  actor_rol,
  accion text,                     -- oferta.crear, cola.mover, tr.cancelar...
  entidad text,
  entidad_id uuid,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text
)
```

No actualizar audit. Append only. Retención mínima 24 meses (disputa gremial).

### 6.7 Índices que importan

- `vehiculos(placa)`
- `trs(codigo)`
- `cola_posiciones(clase_cola, posicion)`
- `ofertas(vehiculo_id, estado, ofrecida_en)`
- `viajes(fecha_cargue)`
- `documentos(sujeto_tipo, sujeto_id, vence_en)`
- `habilitaciones(vehiculo_id, cliente_id)`

---

## 7. Motor de cola (el corazón)

Este módulo es donde el Excel miente más. Aquí no puede haber “editar celda”.

### 7.1 Invariantes

1. En una `clase_cola` las posiciones son `1..N` densas. No hay huecos.
2. Una placa activa pertenece a exactamente una clase de cola.
3. La cabeza **elegible** no es siempre `posicion = 1`. Es el menor `posicion` que pasa filtros.
4. Mover cola y crear oferta ocurre en **una** transacción con `SELECT … FOR UPDATE` sobre todas las filas de esa clase.
5. Nadie “pone a fulano de primero” sin acción `cola.override` + motivo + 2FA si es superadmin.

### 7.2 Algoritmo `siguienteElegible(clase, cliente)`

```text
lock clase_cola
candidatos = posiciones order by posicion asc
para cada candidato:
  si vehiculo.estado != activo: skip
  si bloqueo_hseq(vehiculo): skip
  si not habilitado(vehiculo, cliente): skip
  si tiene oferta abierta no expirada: skip
  si tiene TR asignado/en_curso que ocupe la unidad (param): skip
  return candidato
si no hay: throw ColaVaciaError
```

### 7.3 Algoritmo `ofrecer(requerimiento)`

```text
elegible = siguienteElegible(...)
crear oferta(abierta, expira_en = now + ttl)
notificar asociado (push / whatsapp / email)
audit oferta.crear
commit
```

No se avanza la cola al ofrecer. Se avanza al **resolver**.

### 7.4 Resolver oferta

**Acepta**

```text
oferta → aceptada
crear TR (codigo = siguienteSecuencia('TR'))
si politica.consume_posicion_al_aceptar:
  rotar(vehiculo): sale de cabeza elegible y va al final
audit
```

**Declina**

```text
oferta → declinada + motivo
aplicar parametros.declinacion_politica
  al_final     → rotar al final
  penaliza_n   → rotar y saltar n ciclos
  bloqueo_horas → marcar vehiculo no elegible hasta now+h
ofrecer automáticamente al siguiente si requerimiento sigue abierto
audit
```

**Expira**

Job cada minuto: ofertas `abierta` con `expira_en < now` → `expirada`. Política configurable (tratar como declina o reofertar al mismo).

**Anula** (admin_ops, motivo obligatorio)

No rota si no se llegó a aceptar. Queda rastro.

### 7.5 Cancelar TR

```text
tr → cancelado
si viaje no liquidado: viaje → anulado
si parametro.regresa_al_mismo:
  insertar vehiculo en posicion 1 (shift del resto)  -- peligroso, solo con regla explícita
si no:
  reabrir cupo del requerimiento y ofrecer al siguiente
```

El legado mezcla canceladas en columnas sueltas a la derecha. Aquí es una fila de `trs` + evento.

### 7.6 El “1-2-3” del Excel

Ese número no es un ID de negocio. Era un ciclo visual. En el sistema:

- `cola_posiciones.posicion` es la cola real.
- `cola_posiciones.ciclo` o un contador `turnos_tomados` alimenta el tablero de equidad.
- La UI puede pintar 1-2-3 como **decoración de ronda**, nunca como PK.

### 7.7 Concurrencia

Dos coordinadores no pueden ofrecer el mismo cupo. Redis lock `cola:{clase}` + row lock SQL. El segundo request recibe `409 COLA_LOCKED` o espera 2 s y reintenta.

---

## 8. API

REST versionada `/api/v1`. JSON. Errores con `code` estable.

### 8.1 Auth

```
POST /auth/login
POST /auth/otp/verify
POST /auth/magic-link
POST /auth/logout
GET  /me
```

### 8.2 IAM

```
GET    /usuarios
POST   /usuarios
PATCH  /usuarios/:id
POST   /usuarios/:id/roles          -- solo superadmin
POST   /usuarios/:id/vehiculos      -- scope member
```

### 8.3 Maestros

```
CRUD /asociados
CRUD /vehiculos
CRUD /conductores
CRUD /clientes
CRUD /destinos
CRUD /transportadoras
CRUD /tarifas
CRUD /documentos
PUT  /vehiculos/:id/habilitaciones/:clienteId
```

### 8.4 Operación

```
POST /requerimientos
GET  /requerimientos?estado=&fecha=
GET  /colas/:clase                 -- snapshot posiciones + elegibilidad
POST /requerimientos/:id/ofertas   -- motor
POST /ofertas/:id/aceptar
POST /ofertas/:id/declinar         -- { motivoId, nota }
POST /ofertas/:id/anular
GET  /trs?desde=&hasta=&placa=&estado=
POST /trs/:id/cancelar
POST /trs/:id/no-tramitar
POST /viajes                       -- o nace automático al aceptar
PATCH /viajes/:id
POST /viajes/:id/liquidar
POST /recaudos
```

### 8.5 Consultas

```
GET /tablero?mes=2026-09
GET /me/cola
GET /me/ofertas
GET /me/trs
GET /audit?entidad=trs&id=
GET /export/viajes.csv             -- role gated
```

### 8.6 Contratos de error

```json
{ "code": "VEHICULO_NO_HABILITADO", "message": "SPS413 no apta para HLB", "details": {} }
{ "code": "COLA_VACIA" }
{ "code": "OFERTA_EXPIRADA" }
{ "code": "TR_DUPLICADO" }
{ "code": "FORBIDDEN_OWN_SCOPE" }
```

El frontend traduce. El código no.

---

## 9. Frontend

### 9.1 Stack

- React + TypeScript + Vite.
- Router por rol (`/ops`, `/hseq`, `/finance`, `/me`, `/admin`).
- TanStack Query. Zustand solo para sesión y UI efímera.
- Componentes: cola kanban/columnas, tabla densa estilo operaciones, formularios con validación (Zod).
- PWA: “Mi turno” instalable en el celular del asociado.

No hay una sola UI para todos. El error clásico es mostrar el Excel en la web y esconder columnas con CSS.

### 9.2 Mapas de pantalla

**Superadmin**

- Usuarios y roles.
- Parámetros de cola y recaudo.
- Auditoría filtrable.
- Reset de cola por clase (doble confirmación + 2FA + texto “RESETEAR”).

**Ops (sala de turnos)** — pantalla principal del producto

```
[Requerimientos abiertos]   [Colas C100 | C350 | C600 | MM | TM-CBZ]   [Actividad]
  HLB · Castilla · TM x2      cabeza elegible resaltada                   10:04 declinó QOR007
  Ofrecer cupo                placa · asociado · flags HSEQ               10:05 oferta a FST189
```

Acciones en cabeza: Ofrecer, Saltar (anular+motivo), Ver ficha.

**HSEQ**

- Ficha de placa: documentos, conductores, habilitaciones por cliente.
- Semáforo de vencimientos (30 / 7 / vencido).
- Toggle `apto` con motivo.

**Finance**

- Alta de viaje desde TR cumplido.
- Flete editable, recaudo calculado `flete * parametro`.
- Estado de cobro.
- Cruce tarifario (sugerido vs acordado).

**Viewer**

- Tablero: viajes del mes, declinaciones, equidad (turnos tomados vs ofrecidos por placa).
- Cola en vivo sin botones.
- PII enmascarada.

**Member**

- “Tu posición: 3 de 12 en TM-CBZ”.
- Card de oferta activa: Aceptar / Declinar + motivo.
- Histórico de TR propios.
- Semáforo de documentos propios (“SOAT vence en 12 días”) — lectura.

### 9.3 UX de operaciones (detalle que evita pelea gremial)

- Toda declinación pide motivo de catálogo.
- El nombre en UI es `ELKIN GIOVANNI MOYA DUARTE · SOF336`, no `ELKIN M`.
- El código TR se copia en un tap.
- Diferencia visual: oferta abierta (ámbar), TR asignado (verde), cancelado (rojo), no habilitado (gris + tooltip).
- Nunca permitir editar `posicion` con un input numérico. Solo acciones de dominio.

---

## 10. Reglas de negocio que deben ser datos, no `if` esparcidos

Tabla `parametros` + tests.

| Key | Default razonable | Efecto |
|---|---|---|
| `recaudo_porcentaje` | `0.03` | cálculo viaje |
| `oferta_ttl_minutos` | `120` | expiración |
| `declinacion_politica` | `al_final` | rotación |
| `un_tr_activo_por_placa` | `true` | no dos servicios a la vez |
| `posicion_por_placa` | `true` | 3 TM del mismo asociado = 3 posiciones |
| `bloquear_por_documento_vencido` | `true` | filtro cola |
| `secuencia_tr` | `{prefix:"TR-", next:41947}` | no reutilizar a mano |
| `timezone` | `America/Bogota` | todas las fechas de negocio |

Cambiar un parámetro genera audit. El 3% no se hardcodea en `SERV` como `=P17*3%` a medias.

---

## 11. Notificaciones

Eventos:

- `oferta.abierta` → asociado
- `oferta.por_expirar` (T-15 min) → asociado + ops
- `oferta.declinada` → ops
- `tr.asignado` → asociado + ops
- `tr.cancelado` → asociado
- `documento.por_vencer` → hseq + asociado
- `recaudo.pendiente` → finance (digest diario)

Canales: in-app, email, WhatsApp opt-in. Plantillas con variables. No meter el hilo de WhatsApp como estado del TR.

---

## 12. Seguridad y datos sensibles

El legado guarda contraseñas GPS, Frontera/Orion, Parex, correos, cédulas, vacunas y concepto médico en `LISTA TM`.

Política del sistema nuevo:

- **Prohibido** persistir passwords de terceros. Campo `gps_proveedor` sí; `gps_password` no.
- Cuentas bancarias cifradas (AES-GCM, clave en vault / env, nunca en repo).
- Documentos médicos: rol `admin_hseq` + `superadmin`. El resto ni metadata clínica.
- Backups cifrados.
- CORS estricto. Rate limit en login y en aceptar/declinar.
- Headers: CSRF en cookie session si no es bearer puro.
- Logs sin PII cruda (`documento_hash` si hace falta).
- Exportaciones: watermark de usuario y fecha. Viewer no exporta.
- Cumplir habeas data colombiano: propósito, acceso, cancelación. El asociado puede pedir extracto de sus TR.

---

## 13. Migración desde el Excel

Proyecto aparte, scriptado, repetible, con informe de excepciones.

### 13.1 Orden

1. Deduplicar `LISTA ASOCIADOS` + `LISTA TM` + `TURNERO` → `asociados`, `vehiculos`, `conductores`.
2. Normalizar placas (`SUL 470` → `SUL470`).
3. Mapear `X/NA/NO` del TURNERO → `habilitaciones`.
4. Importar `TARIFAS HLB` con vigencia `2026-01-01` (o la que confirmen).
5. Reconstruir colas de septiembre desde `CONTROL TURNOS HLB SEPT` **solo filas con TR o DECLINA reales**. Ignorar la rotación vacía prearmada desde la fila 23.
6. Importar `SERV MAY26`–`SERV SEPT26` como `viajes` + `trs` sintéticos si el TR no existe.
7. No importar contraseñas.
8. Informe: placas sin asociado, TR duplicados (`TR-39204` repetido), `TR-` vacío, `DECLINO` vs `DECLINA`, destinos no canónicos.

### 13.2 Decisiones que hay que tomar en migración (no adivinar en código)

- Un asociado / varias placas: una fila de asociado, N vehículos.
- `TM-CBZ` unificado sí o no.
- Qué hacer con TR repetidos: un TR con varios viajes o sufijos `-1` como `TR-39591-1`.
- Flete del SERV vs tarifa HLB cuando no coincidan: gana el SERV como `flete_acordado`, tarifa queda referencial.

### 13.3 Criterio de done de migración

- Toda placa que salió en agosto/septiembre existe en `vehiculos`.
- Todo viaje con flete tiene `valor_recaudo` recalculado y comparado contra el legado; diferencias listadas, no silenciadas.
- Cola de cada clase tiene N = vehículos activos de esa clase, no N = filas del Excel.

---

## 14. Jobs y procesos de fondo

- Expirar ofertas.
- Recalcular `documentos.estado` cada noche.
- Alertas de vencimiento (30 y 7 días).
- Digest diario a ops: ofertas abiertas, TR sin viaje, cola vacía por clase.
- Snapshot mensual de equidad (materialized o tabla `metricas_mes`).
- Vacuum / archivado de `audit_log` a cold storage a los 24 meses (copia consultable).

---

## 15. Observabilidad y operación

- Health: `/healthz` (app) `/readyz` (db + redis).
- Métricas: ofertas abiertas, tiempo medio de respuesta, declinaciones/día, errores `COLA_LOCKED`, latencia `ofrecer`.
- Trazas en la transacción de cola.
- Backup Postgres continuo + restore drill trimestral.
- Runbook: “cola trabada”, “secuencia TR desfasada”, “usuario member ve placa ajena” (es incidente de seguridad).

Ambientes: `dev`, `staging` (copia anonimizada del Excel), `prod`. Staging nunca con claves reales porque no deben existir.

---

## 16. Testing que sí importa

No priorizar coverage de getters. Priorizar el motor.

- Unit: `siguienteElegible` con placa cabeza no habilitada → toma la 2.
- Unit: dos TM del mismo asociado no colapsan a una posición.
- Integration: `ofrecer` + `declinar` + `ofrecer` siguiente, una sola transacción visible.
- Concurrency: 20 `POST /ofertas` paralelos sobre la misma clase → 1 oferta, 19 `409/retry`.
- RLS: token `member` de placa `SWI750` no lee TR de `FST189`.
- Migration dry-run sobre el xlsx real y snapshot de excepciones.
- E2E Playwright: login ops → ofrecer → login member → aceptar → aparece TR.

---

## 17. Estructura de repo

```text
apps/
  web/                 # React PWA
  api/                 # NestJS o Fastify
packages/
  domain/              # motor cola, estados, invariantes (sin HTTP)
  shared/              # Zod schemas, codes
infra/
  terraform/ o compose
  postgres/migrations  # node-pg-migrate o drizzle
scripts/
  migrate-xlsx.ts
  anonymize-staging.ts
docs/
  este archivo
```

El motor de cola vive en `packages/domain`. Si mañana la API no es Node, el algoritmo no se reescribe en el controller.

---

## 18. Stack sugerido (opinión de implementación)

| Capa | Elección | Por qué |
|---|---|---|
| API | NestJS + Prisma o Drizzle | módulos por rol, guards, migraciones |
| DB | Postgres 16 | RLS, locks, jsonb de requisitos |
| Cache/lock | Redis | cola concurrente |
| Web | React + TS + PWA | un artefacto, dos experiencias |
| Auth | email + OTP, Better Auth / Lucia / Clerk self-host | 2FA superadmin |
| Files | S3 compatible | soportes HSEQ |
| Jobs | BullMQ | TTL ofertas |
| Hosting | un VPS o Fly/Render al inicio | presupuesto asociación |

No meter Kubernetes en el MVP. No meter EventStore. Un outbox simple si se notifican WhatsApp.

---

## 19. Fases de entrega

### Fase 0 — Semana 0

- Diccionario de placas y asociados limpio (salida de migración parcial).
- Decisiones de parámetros firmadas por quien hoy maneja el Excel.

### Fase 1 — Enturnamiento usable (4–8 semanas producto, o 3–6 en puente AppSheet)

- IAM + 6 roles.
- Maestros mínimos.
- Cola + oferta + TR.
- Pantalla ops + pantalla member.
- Audit básico.
- Import de control agosto/septiembre.

Done: un día real de HLB se opera sin abrir el xlsx de turnos.

### Fase 2 — Viaje y plata

- Viajes, tarifas, 3%, recaudos.
- Tablero finance y viewer.
- Import SERV may–sep.

Done: el 3% del mes sale del sistema, no de una suma a ojo.

### Fase 3 — HSEQ bloqueante

- Documentos, alertas, habilitación por cliente.
- La cola rechaza sola una placa vencida.

### Fase 4 — Fuera de núcleo

- Directorio de correos.
- Presupuesto de la asociación.
- Registro de asistencia.
- Integraciones posteriores (RNDC, GPS) como satélites.
  - GPS: hecho a medias desde 2026-09-22 (ADR-0007). La API ya recibe y guarda ubicaciones
    (TASK-0062) y las expone con el reparto de permisos de §3.2 (TASK-0063); faltan el agente que
    consulta a la plataforma, las pantallas y el mapa (TASK-0064..0066).

---

## 20. Criterios de aceptación del producto (no del sprint)

1. Un `viewer` no puede mutar ninguna entidad (prueba de API, no de UI).
2. Un `member` no lista TR ajenos.
3. Dos coordinadores no asignan el mismo cupo a dos placas.
4. Declinar deja rastro con actor, timestamp y motivo.
5. Cancelar un TR no borra historia.
6. El código `TR-` es único y generado, no un string a medias.
7. El porcentaje de recaudo cambia en parámetros y los viajes nuevos usan el nuevo valor; los viejos conservan `porcentaje_aplicado` snapshot.
8. Restore de backup en staging < 2 h.
9. Cero secretos de GPS en la base.
10. Informe de migración con excepciones abiertas, no “ya quedó”.
11. Un `viewer` no obtiene coordenadas de ningún vehículo y un `member` no obtiene la ubicación de
    una placa ajena, ni por la lista, ni por la ficha, ni por el recorrido (ADR-0007).

---

## 21. Riesgos técnicos reales

- **Pelea por la cola**: si el override de superadmin no queda visible para el veedor, el sistema pierde legitimidad. La feature más política es el audit log, no el kanban.
- **Excel zombie**: si siguen llenando el xlsx en paralelo, hay dos verdades. Fecha de corte obligatoria.
- **Nombres cortados**: matching de migración (`MILLER F` vs cédula). Resolver con cédula, no con fuzzy eterno.
- **AppSheet forever**: válido 6 meses. Después el motor de cola se vuelve un laberinto de expressions. Plan de escape = este modelo.
- **WhatsApp como UI**: termina reintroduciendo el cuaderno. Notificación sí, decisión en la app.

---

## 22. Lo que hay que construir primero mañana

Si se abre el IDE hoy, el orden no es el login bonito. Es:

1. Migraciones SQL de las tablas de la sección 6 (aunque la UI aún no exista).
2. `packages/domain` con `siguienteElegible` + tests del TURNERO (placa no apta no sale).
3. Endpoint `POST /requerimientos/:id/ofertas` transaccional.
4. Seed con 10 placas reales anonimizadas de septiembre 2026.
5. Pantalla ops de una sola clase (`TM-CBZ`) contra esa seed.

Todo lo demás se apoya en que ese loop no mienta.

---

## 23. Apéndice — mapeo hoja Excel → tabla

| Hoja | Destino | Notas |
|---|---|---|
| CONTROL TURNOS HLB AGOS/SEPT | `requerimientos`, `ofertas`, `trs` | parsear pares (cupo, TR/DECLINA) por clase |
| TARIFAS HLB | `tarifas` + `destinos` + `clientes` | tres familias de columnas = tres `cliente_id` |
| LISTA ASOCIADOS | `asociados`, `vehiculos` | parentesco y propietario |
| LISTA TM | `vehiculos`, `conductores`, `documentos` | omitir passwords |
| TURNERO | `habilitaciones`, `vehiculos` (largo, modelo) | X/NA/NO → apto |
| SERV MAY–SEPT | `viajes`, `recaudos`, `trs` | título “JUNIO” se ignora; fecha de fila manda |
| COSTOS SALARIO | fuera de MVP | |
| DATOS DE SERVICIOS | ficha rápida; se deriva de maestros | |
| PRESUPUESTO | fase 4 | |
| REG ASIST | fase 4 | |
| CORREOS / CORREOS (2) | `contactos_cliente` fase 4, una sola tabla | |

---

Fin del documento. Cualquier implementación que conserve celdas `DECLINA` como estado, o que deje al frontend elegir “quién sigue”, no es este sistema.
