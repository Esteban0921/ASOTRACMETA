-- Maestros de gente y flota (spec §6.2). IDs UUID v7 generados por la aplicación; el default es solo respaldo.
-- Soft delete: deleted_at. Nunca DELETE físico si hay TR históricos (spec §3.3).

create table asociados (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('persona', 'empresa')),
  nombres text,
  apellidos text,
  razon_social text,
  documento text not null unique,
  documento_tipo text check (documento_tipo in ('CC', 'CE', 'NIT', 'PASAPORTE')),
  celular text,
  correo citext,
  direccion text,
  cuenta_bancaria_enc text, -- cifrado en aplicación (AES-GCM); nunca texto plano
  estado text not null default 'activo' check (estado in ('activo', 'inactivo', 'retirado')),
  fecha_afiliacion date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table vehiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique check (placa ~ '^[A-Z]{3}[0-9]{3}$'),
  clase text not null check (clase in ('C100', 'C350', 'C600', 'MM', 'TM', 'CBZ')),
  clase_cola text not null check (clase_cola in ('C100', 'C350', 'C600', 'MM', 'TM-CBZ')),
  tipo_carroceria text,
  modelo int,
  repotenciacion int,
  largo_mts numeric(5, 2),
  km_recorrido int,
  asociado_id uuid references asociados (id),
  propietario_nombre text,
  propietario_documento text,
  parentesco text,
  trailer_placa text,
  gps_proveedor text, -- SATRACK, rastreoflotas... NUNCA la contraseña (spec §12)
  estado text not null default 'activo' check (estado in ('activo', 'inactivo', 'bloqueado_hseq', 'vendido')),
  no_elegible_hasta timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint vehiculos_clase_cola_coherente check (
    (clase in ('TM', 'CBZ') and clase_cola = 'TM-CBZ') or (clase not in ('TM', 'CBZ') and clase_cola = clase)
  )
);

create table conductores (
  id uuid primary key default gen_random_uuid(),
  nombres text not null,
  documento text not null unique,
  celular text,
  correo citext,
  asociado_id uuid references asociados (id),
  licencia_categoria text,
  licencia_vence date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table vehiculo_conductores (
  vehiculo_id uuid not null references vehiculos (id),
  conductor_id uuid not null references conductores (id),
  es_principal boolean not null default false,
  primary key (vehiculo_id, conductor_id)
);
