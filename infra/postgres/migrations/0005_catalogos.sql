-- Catálogos de operación (spec §6.4). Una tarifa tiene vigencia; no hay celda mágica.

create table destinos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  km int,
  activo boolean not null default true
);

create table transportadoras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

create table tarifas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id),
  origen text not null default 'VILLAVICENCIO',
  destino_id uuid not null references destinos (id),
  clase text not null check (clase in ('C100', 'C350', 'C600', 'MM', 'TM', 'CBZ')),
  modalidad text not null, -- cama_alta, carroceria, cabezote, rigido...
  valor numeric(14, 2) not null check (valor >= 0),
  vigencia_desde date not null,
  vigencia_hasta date,
  unique (cliente_id, destino_id, clase, modalidad, vigencia_desde),
  check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde)
);

create table motivos_declinacion (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true
);
