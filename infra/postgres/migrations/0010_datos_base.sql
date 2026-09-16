-- Datos base que el sistema necesita para arrancar (no son datos de negocio del Excel).

insert into parametros (key, value) values
  ('recaudo_porcentaje', '0.03'),
  ('oferta_ttl_minutos', '120'),
  ('declinacion_politica', '"al_final"'),
  ('declinacion_n', '1'),
  ('declinacion_bloqueo_horas', '24'),
  ('oferta_expirada_politica', '"declina"'),
  ('un_tr_activo_por_placa', 'true'),
  ('posicion_por_placa', 'true'),
  ('bloquear_por_documento_vencido', 'true'),
  ('consume_posicion_al_aceptar', 'true'),
  ('tr_cancelado_regresa_al_mismo', 'false'),
  ('reset_cola_requiere_2fa', 'true'),
  ('secuencia_tr', '{"prefix": "TR-", "next": 41947}'),
  ('timezone', '"America/Bogota"')
on conflict (key) do nothing;

insert into motivos_declinacion (codigo, nombre) values
  ('MANTENIMIENTO', 'Vehículo en mantenimiento'),
  ('SIN_CONDUCTOR', 'Sin conductor disponible'),
  ('DOCUMENTO', 'Documento en trámite'),
  ('PERSONAL', 'Motivo personal'),
  ('OTRO', 'Otro (detallar en nota)')
on conflict (codigo) do nothing;

insert into clientes (codigo, nombre) values
  ('HLB', 'Halliburton'),
  ('BAKER', 'Baker Hughes'),
  ('WTF', 'Weatherford'),
  ('QMAX', 'Qmax'),
  ('TENARIS', 'Tenaris'),
  ('SLB', 'SLB'),
  ('NABORS', 'Nabors'),
  ('GEOPARK', 'Geopark'),
  ('FRONTERA', 'Frontera'),
  ('TECPETROL', 'Tecpetrol')
on conflict (codigo) do nothing;

insert into tipos_documento (codigo, nombre, aplica_a, bloqueante, dias_alerta) values
  ('SOAT', 'SOAT', 'vehiculo', true, 30),
  ('TECNOMEC', 'Revisión técnico-mecánica', 'vehiculo', true, 30),
  ('POLIZA', 'Póliza de responsabilidad civil', 'vehiculo', true, 30),
  ('CURSO_HLB', 'Curso de manejo defensivo HLB', 'conductor', true, 30),
  ('LICENCIA', 'Licencia de conducción', 'conductor', true, 30),
  ('VACUNA_FIEBRE', 'Vacuna fiebre amarilla', 'conductor', false, 60)
on conflict (codigo) do nothing;
