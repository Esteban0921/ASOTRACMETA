-- Notificaciones (spec §11, §14, §18; TASK-0026): outbox transaccional y bandeja in-app.
-- El motor escribe el aviso en `notificaciones_outbox` en la misma transacción que la mutación
-- (si la transacción se revierte, no hay aviso). Un worker lo toma con `for update skip locked`,
-- resuelve destinatarios y canales según las preferencias de cada usuario y deja una fila por
-- persona en `notificaciones` (bandeja in-app), con el resultado de correo y WhatsApp.

alter table usuarios add column preferencias_notificacion jsonb not null
  default '{"correo": true, "whatsapp": false, "celular": null}'::jsonb;
comment on column usuarios.preferencias_notificacion is
  'Canales opt-in del usuario (correo, whatsapp + celular); la bandeja in-app siempre (TASK-0026)';

-- Usuario de la petición, para RLS de filas personales. Vacío = sin usuario (jobs, sistema).
create or replace function app_usuario_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.usuario_id', true), '')::uuid;
$$;
grant execute on function app_usuario_id() to asotracmet_app;

create table notificaciones_outbox (
  id uuid primary key default gen_random_uuid(),
  evento text not null check (evento in (
    'oferta.abierta', 'oferta.por_expirar', 'oferta.declinada', 'tr.asignado', 'tr.cancelado',
    'documento.por_vencer', 'recaudo.pendiente'
  )),
  destinos jsonb not null,
  datos jsonb not null default '{}'::jsonb,
  -- Idempotencia de los jobs: dos avisos con la misma clave se encolan una sola vez.
  clave text unique,
  creada_en timestamptz not null default now(),
  tomada_en timestamptz,
  intentos int not null default 0,
  procesada_en timestamptz,
  error text
);
create index notificaciones_outbox_pendientes on notificaciones_outbox (creada_en)
  where procesada_en is null;

create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid references notificaciones_outbox (id) on delete set null,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  evento text not null,
  asunto text not null,
  texto text not null,
  datos jsonb not null default '{}'::jsonb,
  canales jsonb not null default '{}'::jsonb,
  creada_en timestamptz not null default now(),
  leida_en timestamptz
);
create index notificaciones_usuario on notificaciones (usuario_id, creada_en desc);
-- Reintentar un aviso no duplica la bandeja: una fila por aviso y persona.
create unique index notificaciones_una_por_aviso on notificaciones (outbox_id, usuario_id)
  where outbox_id is not null;

alter table notificaciones_outbox enable row level security;
alter table notificaciones_outbox force row level security;
-- La outbox es interna: el motor (sistema) y los roles internos que disparan jobs.
create policy notificaciones_outbox_internos on notificaciones_outbox for all
  using (app_rol() in ('sistema', 'superadmin', 'admin_ops', 'admin_hseq', 'admin_finance'))
  with check (app_rol() in ('sistema', 'superadmin', 'admin_ops', 'admin_hseq', 'admin_finance'));

alter table notificaciones enable row level security;
alter table notificaciones force row level security;
-- Cada usuario ve y marca solo su bandeja; el worker (sistema o un rol interno) la escribe.
create policy notificaciones_propias on notificaciones for select
  using (app_rol() = 'sistema' or usuario_id = app_usuario_id());
create policy notificaciones_marcar on notificaciones for update
  using (app_rol() = 'sistema' or usuario_id = app_usuario_id())
  with check (app_rol() = 'sistema' or usuario_id = app_usuario_id());
create policy notificaciones_insercion on notificaciones for insert
  with check (app_rol() in ('sistema', 'superadmin', 'admin_ops', 'admin_hseq', 'admin_finance'));

grant select, insert, update, delete on notificaciones_outbox, notificaciones to asotracmet_app;
