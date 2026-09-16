-- Snapshot mensual de equidad (spec §14, §9.2 Viewer; TASK-0029). Una fila por placa y mes,
-- reproducible: el job vuelve a calcularla desde ofertas, TR y viajes y hace upsert.

create table metricas_mes (
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  vehiculo_id uuid not null references vehiculos (id),
  clase_cola text not null check (clase_cola in ('C100', 'C350', 'C600', 'MM', 'TM-CBZ')),
  ofrecidas int not null default 0,
  tomadas int not null default 0,
  declinadas int not null default 0,
  expiradas int not null default 0,
  anuladas int not null default 0,
  trs int not null default 0,
  viajes int not null default 0,
  flete numeric(14, 2) not null default 0,
  recaudo numeric(14, 2) not null default 0,
  pagado numeric(14, 2) not null default 0,
  generado_en timestamptz not null default now(),
  primary key (mes, vehiculo_id)
);

create index metricas_mes_mes on metricas_mes (mes);

alter table metricas_mes enable row level security;
alter table metricas_mes force row level security;
-- El tablero es de consulta para todo rol interno y el veedor; el member no lo necesita.
create policy metricas_mes_lectura on metricas_mes for select using (app_rol() <> 'member');
create policy metricas_mes_escritura on metricas_mes for all
  using (app_rol() in ('sistema', 'superadmin'))
  with check (app_rol() in ('sistema', 'superadmin'));

grant select, insert, update, delete on metricas_mes to asotracmet_app;
