-- Ubicación GPS de la flota (ADR-0007; spec §19 fase 4, §12, §20.9; TASK-0062).
-- Historial de posiciones por placa que deja un agente satélite cada `gps_intervalo_minutos`.
-- La última posición se lee con `distinct on (vehiculo_id) ... order by capturada_en desc`, que se
-- apoya en el índice de la unique; no hay tabla "actual" que mantener en paralelo.
--
-- Aquí NO hay, ni habrá, columna de usuario ni de clave del proveedor: las credenciales viven en un
-- archivo de secretos del host montado solo en el contenedor del agente (RULE-021, spec §12 línea
-- 777, criterio §20.9 "Cero secretos de GPS en la base").

create table vehiculo_ubicaciones (
  -- UUID v7 generado por la API (RULE-015): monótono, así el índice primario no se fragmenta.
  id uuid primary key,
  vehiculo_id uuid not null references vehiculos (id),
  latitud numeric(9, 6) not null check (latitud between -90 and 90),
  longitud numeric(9, 6) not null check (longitud between -180 and 180),
  velocidad_kmh numeric(6, 1) check (velocidad_kmh >= 0),
  rumbo_grados numeric(5, 1) check (rumbo_grados >= 0 and rumbo_grados < 360),
  -- Instante que reporta la plataforma (reloj del GPS).
  capturada_en timestamptz not null,
  -- Instante en que la API recibió el lote (reloj propio): con él se detecta el agente callado.
  recibida_en timestamptz not null default now(),
  proveedor text not null check (length(proveedor) between 1 and 60),
  -- Corrida del agente que la trajo; permite seguir un lote en los logs sin auditar cada uno.
  lote_id uuid,
  -- Idempotencia: reenviar el mismo lote no duplica filas.
  unique (vehiculo_id, capturada_en)
);

comment on table vehiculo_ubicaciones is
  'Ubicación GPS por placa (ADR-0007, spec §19 fase 4). Dato personal del conductor: retención corta y RLS. Sin credenciales (spec §12, §20.9).';
comment on column vehiculo_ubicaciones.capturada_en is 'Reloj del GPS, tal como lo reporta la plataforma';
comment on column vehiculo_ubicaciones.recibida_en is 'Reloj de la API al recibir el lote';

-- Purga por `gps_retencion_dias`.
create index vehiculo_ubicaciones_capturada on vehiculo_ubicaciones (capturada_en);

-- RLS (spec §3.3, RULE-022): el asociado solo ve sus placas; el veedor las ve todas pero la API le
-- devuelve la frescura sin coordenadas (spec §3.2 `R*`, criterio §20.11).
alter table vehiculo_ubicaciones enable row level security;
alter table vehiculo_ubicaciones force row level security;
create policy vehiculo_ubicaciones_lectura on vehiculo_ubicaciones for select
  using (app_rol() <> 'member' or vehiculo_id = any(app_vehiculo_ids()));
-- Solo la ruta de ingesta, que fija ese contexto tras validar su token. A propósito NO es
-- `sistema`: toda ruta pública entra como `sistema` y ese rol escribe cola, ofertas, TR y viajes;
-- con un rol propio, un fallo en la ingesta no tiene autoridad sobre nada más (ADR-0007).
create policy vehiculo_ubicaciones_insercion on vehiculo_ubicaciones for insert
  with check (app_rol() = 'gps_ingesta');
-- Purga diaria (rol `sistema`, sin petición) y disparo manual del superadmin.
create policy vehiculo_ubicaciones_borrado on vehiculo_ubicaciones for delete
  using (app_rol() in ('sistema', 'superadmin'));

-- 0009 concede select/insert/update/delete por defecto a asotracmet_app sobre toda tabla nueva
-- (`alter default privileges`); truncate no lo concede nunca. Una lectura del GPS no se corrige:
-- si llega mal, llega otra.
revoke update on vehiculo_ubicaciones from asotracmet_app;
grant select, insert, delete on vehiculo_ubicaciones to asotracmet_app;

-- Defaults de PARAMETROS_DEFAULT: una base ya migrada los necesita porque `ParametrosSchema` exige
-- la llave. `on conflict` respeta el valor si alguien ya lo cambió (patrón de 0019).
insert into parametros (key, value) values
  ('gps_intervalo_minutos', '20'),
  ('gps_frescura_minutos', '30'),
  ('gps_sin_senal_minutos', '120'),
  ('gps_retencion_dias', '30')
on conflict (key) do nothing;
