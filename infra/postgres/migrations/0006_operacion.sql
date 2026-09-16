-- Cola, oferta, TR, viaje, recaudo (spec §6.5). Estados cerrados: nunca texto libre.

create table parametros (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table requerimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id),
  destino_id uuid references destinos (id),
  clase_cola text not null check (clase_cola in ('C100', 'C350', 'C600', 'MM', 'TM-CBZ')),
  fecha_servicio date not null,
  cantidad_cupos int not null default 1 check (cantidad_cupos >= 1),
  observaciones text,
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'cancelado')),
  creado_por uuid not null references usuarios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Invariante §7.1: posiciones 1..N densas por clase. La unicidad de posición es diferible para poder
-- renumerar dentro de la misma transacción (rotar al final, mover a cabeza).
create table cola_posiciones (
  id uuid primary key default gen_random_uuid(),
  clase_cola text not null check (clase_cola in ('C100', 'C350', 'C600', 'MM', 'TM-CBZ')),
  vehiculo_id uuid not null references vehiculos (id),
  posicion int not null check (posicion >= 1),
  ciclo int not null default 1,
  turnos_ofrecidos int not null default 0,
  turnos_tomados int not null default 0,
  saltos_pendientes int not null default 0,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (clase_cola, vehiculo_id),
  unique (clase_cola, posicion) deferrable initially deferred
);

create table ofertas (
  id uuid primary key default gen_random_uuid(),
  requerimiento_id uuid not null references requerimientos (id),
  vehiculo_id uuid not null references vehiculos (id),
  asociado_id uuid references asociados (id),
  ofrecida_por uuid not null references usuarios (id),
  ofrecida_en timestamptz not null default now(),
  expira_en timestamptz not null,
  estado text not null default 'abierta' check (estado in ('abierta', 'aceptada', 'declinada', 'expirada', 'anulada')),
  motivo_declinacion_id uuid references motivos_declinacion (id),
  nota text,
  respondida_en timestamptz,
  respondida_por uuid references usuarios (id),
  constraint ofertas_declinada_con_motivo check (estado <> 'declinada' or motivo_declinacion_id is not null)
);

-- Una sola oferta abierta por placa a la vez (§7.2).
create unique index ofertas_una_abierta_por_vehiculo on ofertas (vehiculo_id) where estado = 'abierta';

create table trs (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^TR-[0-9]+$'), -- TR-41946: único y generado, nunca a medias (§20.6)
  oferta_id uuid unique references ofertas (id),
  requerimiento_id uuid not null references requerimientos (id),
  vehiculo_id uuid not null references vehiculos (id),
  clase_cola text not null check (clase_cola in ('C100', 'C350', 'C600', 'MM', 'TM-CBZ')),
  cliente_id uuid not null references clientes (id),
  destino_id uuid references destinos (id),
  fecha_asignacion date not null,
  estado text not null default 'asignado' check (estado in ('asignado', 'en_curso', 'cumplido', 'cancelado', 'no_tramitar')),
  cancelado_en timestamptz,
  cancelado_por uuid references usuarios (id),
  motivo_cancelacion text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trs_cancelado_con_rastro check (
    estado not in ('cancelado', 'no_tramitar') or (cancelado_en is not null and motivo_cancelacion is not null)
  )
);

create table viajes (
  id uuid primary key default gen_random_uuid(),
  tr_id uuid not null unique references trs (id),
  vehiculo_id uuid not null references vehiculos (id),
  conductor_id uuid references conductores (id),
  fecha_cargue date,
  fecha_descargue date,
  lugar_descargue text,
  transportadora_id uuid references transportadoras (id),
  tarifa_id uuid references tarifas (id),
  flete numeric(14, 2) check (flete is null or flete >= 0),
  porcentaje_aplicado numeric(5, 4), -- snapshot del parámetro al liquidar (§20.7)
  valor_recaudo numeric(14, 2),
  valor_pagado numeric(14, 2) not null default 0,
  estado text not null default 'borrador' check (estado in ('borrador', 'cargado', 'descargado', 'liquidado', 'anulado')),
  notas text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_descargue is null or fecha_cargue is null or fecha_descargue >= fecha_cargue)
);

create table recaudos (
  id uuid primary key default gen_random_uuid(),
  viaje_id uuid not null references viajes (id),
  asociado_id uuid not null references asociados (id),
  valor numeric(14, 2) not null check (valor >= 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'parcial', 'pagado', 'cruzado', 'castigado')),
  fecha_pago date,
  referencia text,
  created_at timestamptz not null default now()
);
