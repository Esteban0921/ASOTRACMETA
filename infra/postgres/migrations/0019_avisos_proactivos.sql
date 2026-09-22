-- Avisos proactivos (spec §11, §14; brief §5; TASK-0057): tres eventos nuevos en la outbox y dos
-- parámetros (RULE-012) que gobiernan a cuántas posiciones elegibles se avisa "alista el vehículo"
-- y hasta qué posición un documento bloqueante vencido avisa que va a costar el turno.

-- El check nació sin nombre en 0016 y Postgres lo llamó `notificaciones_outbox_evento_check`.
-- La lista completa vive en `packages/shared/src/notificaciones.ts` (EVENTOS_NOTIFICACION).
alter table notificaciones_outbox drop constraint notificaciones_outbox_evento_check;
alter table notificaciones_outbox add constraint notificaciones_outbox_evento_check check (evento in (
  'oferta.abierta', 'oferta.por_expirar', 'oferta.declinada', 'tr.asignado', 'tr.cancelado',
  'documento.por_vencer', 'recaudo.pendiente',
  'cola.proximo', 'documento.bloquea_turno', 'cola.sin_elegibles'
));

-- Defaults de `PARAMETROS_DEFAULT`; una base ya migrada los necesita porque `ParametrosSchema`
-- exige la llave. `on conflict` respeta el valor si alguien ya lo cambió.
insert into parametros (key, value) values
  ('aviso_proximo_turno_posiciones', '2'),
  ('aviso_documento_bloquea_posiciones', '3')
on conflict (key) do nothing;
