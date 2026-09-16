-- Índices que importan (spec §6.7).
create index cola_posiciones_clase_posicion on cola_posiciones (clase_cola, posicion);
create index ofertas_vehiculo_estado_fecha on ofertas (vehiculo_id, estado, ofrecida_en desc);
create index ofertas_requerimiento_estado on ofertas (requerimiento_id, estado);
create index ofertas_abiertas_expira on ofertas (expira_en) where estado = 'abierta';
create index trs_vehiculo_estado on trs (vehiculo_id, estado);
create index trs_requerimiento on trs (requerimiento_id);
create index trs_fecha_asignacion on trs (fecha_asignacion desc);
create index viajes_fecha_cargue on viajes (fecha_cargue);
create index documentos_sujeto_vence on documentos (sujeto_tipo, sujeto_id, vence_en);
create index habilitaciones_vehiculo_cliente on habilitaciones (vehiculo_id, cliente_id);
create index audit_log_entidad on audit_log (entidad, entidad_id, at desc);
create index audit_log_at on audit_log (at desc);
create index requerimientos_estado_fecha on requerimientos (estado, fecha_servicio);
