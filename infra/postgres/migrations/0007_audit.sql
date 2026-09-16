-- Auditoría append-only (spec §6.6). Retención mínima 24 meses.

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid,
  actor_rol text,
  accion text not null, -- oferta.crear, cola.rotar, tr.cancelar...
  entidad text not null,
  entidad_id text,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text
);

create or replace function audit_log_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log es append-only (spec §6.6)';
end;
$$;

create trigger audit_log_sin_update_ni_delete
  before update or delete on audit_log
  for each row execute function audit_log_inmutable();

revoke update, delete, truncate on audit_log from public;
