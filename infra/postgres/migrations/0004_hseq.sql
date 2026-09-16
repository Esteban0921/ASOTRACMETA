-- HSEQ y habilitación (spec §6.3).

create table tipos_documento (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, -- SOAT, TECNOMEC, POLIZA, CURSO_HLB, VACUNA_FIEBRE...
  nombre text not null,
  aplica_a text not null check (aplica_a in ('vehiculo', 'conductor')),
  bloqueante boolean not null default true,
  dias_alerta int not null default 30
);

create table documentos (
  id uuid primary key default gen_random_uuid(),
  sujeto_tipo text not null check (sujeto_tipo in ('vehiculo', 'conductor')),
  sujeto_id uuid not null,
  tipo_id uuid not null references tipos_documento (id),
  numero text,
  emitido_en date,
  vence_en date,
  archivo_url text, -- object storage, no el xlsx
  estado text not null default 'vigente' check (estado in ('vigente', 'por_vencer', 'vencido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, -- HLB, BAKER, WTF, QMAX, TENARIS, SLB...
  nombre text not null,
  requiere_habilitacion boolean not null default true,
  activo boolean not null default true
);

create table habilitaciones (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references vehiculos (id),
  cliente_id uuid not null references clientes (id),
  apto boolean not null,
  motivo_bloqueo text,
  requisitos jsonb, -- snapshot de checks del TURNERO
  updated_at timestamptz not null default now(),
  unique (vehiculo_id, cliente_id)
);

-- Recalcula documentos.estado (job nocturno §14 o trigger).
create or replace function documentos_recalcular_estado(p_hoy date default current_date) returns int
language plpgsql as $$
declare
  n int;
begin
  update documentos d
  set estado = case
      when d.vence_en is null then 'vigente'
      when d.vence_en < p_hoy then 'vencido'
      when d.vence_en < p_hoy + (select coalesce(t.dias_alerta, 30) from tipos_documento t where t.id = d.tipo_id) then 'por_vencer'
      else 'vigente'
    end,
    updated_at = now()
  where d.deleted_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
