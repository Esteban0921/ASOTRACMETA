-- Acta de turno (brief "Llano Abierto" §5; spec §7.2, §7.3, §21; TASK-0053).
-- Cada oferta deja escrito a quién saltó y por qué, en la misma transacción que la oferta. Es la
-- prueba de equidad que hoy se pierde: alimenta el acta del coordinador, "Mis turnos que pasaron"
-- del asociado, el tablero y el acta del mes del veedor. Como el audit_log, no se edita ni se borra.

create table oferta_saltos (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references ofertas (id),
  vehiculo_id uuid not null references vehiculos (id),
  -- Posición que tenía la placa saltada en el momento de la oferta.
  posicion int not null check (posicion >= 1),
  -- Los siete filtros de elegibilidad (spec §7.2) = MOTIVOS_NO_ELEGIBLE de packages/domain.
  motivo text not null check (motivo in (
    'VEHICULO_NO_ACTIVO', 'DOCUMENTO_VENCIDO', 'BLOQUEO_TEMPORAL', 'VEHICULO_NO_HABILITADO',
    'OFERTA_ABIERTA_PREVIA', 'TR_ACTIVO', 'PENALIZACION_PENDIENTE'
  )),
  detalle text,
  created_at timestamptz not null default now(),
  unique (oferta_id, vehiculo_id)
);
comment on table oferta_saltos is
  'Acta de turno (TASK-0053): placas que una oferta saltó, con motivo. Append-only.';

-- "Mis turnos que pasaron" (por placa, más reciente primero) y el acta de una oferta.
create index oferta_saltos_vehiculo_fecha on oferta_saltos (vehiculo_id, created_at desc);
create index oferta_saltos_oferta on oferta_saltos (oferta_id);

-- Append-only, igual que audit_log (0007): ni UPDATE ni DELETE, ni siquiera para el owner.
create or replace function oferta_saltos_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'oferta_saltos es append-only (acta de turno, spec §21)';
end;
$$;

create trigger oferta_saltos_sin_update_ni_delete
  before update or delete on oferta_saltos
  for each row execute function oferta_saltos_inmutable();

revoke update, delete, truncate on oferta_saltos from public;
-- 0009 concede update/delete por defecto a asotracmet_app sobre toda tabla nueva: aquí no.
revoke update, delete, truncate on oferta_saltos from asotracmet_app;

-- RLS (spec §3.3): un member ve solo los saltos de sus placas; escribe solo el motor.
alter table oferta_saltos enable row level security;
alter table oferta_saltos force row level security;
create policy oferta_saltos_lectura on oferta_saltos for select
  using (app_rol() <> 'member' or vehiculo_id = any(app_vehiculo_ids()));
create policy oferta_saltos_insercion on oferta_saltos for insert
  with check (app_rol() in ('sistema', 'superadmin', 'admin_ops', 'admin_hseq', 'admin_finance'));

grant select, insert on oferta_saltos to asotracmet_app;

-- Un member también puede leer la oferta que le pasó por delante: es parte de su acta ("te
-- saltaron por SOAT vencido en el servicio de HLB a Castilla") y sin ella no llega al
-- requerimiento, al cliente ni al destino. Las políticas de select se suman (OR) a ofertas_lectura.
create policy ofertas_lectura_saltada on ofertas for select
  using (
    app_rol() = 'member'
    and exists (
      select 1 from oferta_saltos s
       where s.oferta_id = ofertas.id and s.vehiculo_id = any(app_vehiculo_ids())
    )
  );
