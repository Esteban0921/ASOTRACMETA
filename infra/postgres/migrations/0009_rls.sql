-- Row Level Security (spec §3.3): "El frontend miente; la DB no."
-- La API abre cada transacción con:
--   set local app.rol = '<rol>'; set local app.vehiculo_ids = '<uuid>,<uuid>';
-- Un member ejecuta, por construcción, WHERE vehiculo_id IN (placas_del_usuario).

create or replace function app_rol() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('app.rol', true), ''), 'sistema');
$$;

create or replace function app_vehiculo_ids() returns uuid[]
language sql stable as $$
  select coalesce(string_to_array(nullif(current_setting('app.vehiculo_ids', true), ''), ',')::uuid[], '{}'::uuid[]);
$$;

-- Lectura: todo rol menos member ve todas las filas; member solo las de sus placas.
-- Escritura: nunca un member directamente (acepta/declina a través de la API con rol de servicio),
-- nunca un viewer. 'sistema' es el rol de migraciones/jobs.

do $$
declare
  t text;
begin
  foreach t in array array['cola_posiciones', 'ofertas', 'trs', 'viajes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I on %I for select using (app_rol() <> ''member'' or vehiculo_id = any(app_vehiculo_ids()))',
      t || '_lectura', t
    );
    execute format(
      'create policy %I on %I for insert with check (app_rol() in (''sistema'', ''superadmin'', ''admin_ops'', ''admin_hseq'', ''admin_finance''))',
      t || '_insercion', t
    );
    execute format(
      'create policy %I on %I for update using (app_rol() in (''sistema'', ''superadmin'', ''admin_ops'', ''admin_hseq'', ''admin_finance'')) with check (app_rol() in (''sistema'', ''superadmin'', ''admin_ops'', ''admin_hseq'', ''admin_finance''))',
      t || '_actualizacion', t
    );
    execute format(
      'create policy %I on %I for delete using (app_rol() in (''sistema'', ''superadmin''))',
      t || '_borrado', t
    );
  end loop;
end;
$$;

-- documentos usa sujeto_id en lugar de vehiculo_id: politicas propias (escribe solo HSEQ).
alter table documentos enable row level security;
alter table documentos force row level security;
create policy documentos_lectura on documentos for select
  using (app_rol() <> 'member' or (sujeto_tipo = 'vehiculo' and sujeto_id = any(app_vehiculo_ids())));
create policy documentos_escritura on documentos for all
  using (app_rol() in ('sistema', 'superadmin', 'admin_hseq'))
  with check (app_rol() in ('sistema', 'superadmin', 'admin_hseq'));

-- recaudos se filtra por asociado (member ve los propios). Se resuelve vía viaje -> vehiculo.
alter table recaudos enable row level security;
alter table recaudos force row level security;
create policy recaudos_lectura on recaudos for select
  using (
    app_rol() <> 'member'
    or exists (select 1 from viajes v where v.id = recaudos.viaje_id and v.vehiculo_id = any(app_vehiculo_ids()))
  );
create policy recaudos_escritura on recaudos for all
  using (app_rol() in ('sistema', 'superadmin', 'admin_finance'))
  with check (app_rol() in ('sistema', 'superadmin', 'admin_finance'));

-- Rol de aplicacion. Un superusuario o el owner de las tablas se salta RLS: la API NUNCA se conecta
-- como superusuario. Se conecta como asotracmet_app (o hace SET ROLE asotracmet_app por transaccion).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'asotracmet_app') then
    create role asotracmet_app nologin;
  end if;
end;
$$;
grant usage on schema public to asotracmet_app;
grant select, insert, update, delete on all tables in schema public to asotracmet_app;
grant usage, select on all sequences in schema public to asotracmet_app;
alter default privileges in schema public grant select, insert, update, delete on tables to asotracmet_app;
revoke update, delete, truncate on audit_log from asotracmet_app;
