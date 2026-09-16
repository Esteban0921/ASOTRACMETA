-- Ajustes que necesita el adaptador de aplicación (TASK-0019).
-- Las migraciones son append-only (RULE-025): esto complementa 0007 y 0009, no las edita.

-- 1. El actor de un evento puede ser el sistema (jobs), no un usuario: actor_id pasa a texto.
--    El trigger de append-only es DML; el ALTER no lo dispara.
alter table audit_log alter column actor_id type text using actor_id::text;

-- 2. La API opera como asotracmet_app: quien ejecute migraciones debe poder asumir ese rol.
do $$
begin
  execute format('grant asotracmet_app to %I', current_user);
exception
  when duplicate_object then null;
  when others then null;
end;
$$;

-- 3. El largo de la cola no es información privada: es el denominador de "Tu posición: 3 de 12".
--    Bajo RLS forzada un member solo ve sus filas, así que esta función lo cuenta con rol de
--    servicio acotado a una sola sentencia.
create or replace function cola_total(p_clase text) returns int
language sql
stable
security definer
set search_path = public
set app.rol = 'sistema'
as $$
  select count(*)::int from cola_posiciones where clase_cola = p_clase;
$$;

grant execute on function cola_total(text) to asotracmet_app;
