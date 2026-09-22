-- Catálogo cerrado de motivos de bloqueo (spec §6.3, §12; TASK-0059). `motivo_bloqueo` deja de
-- ser texto libre: desde aquí guarda siempre el nombre del catálogo, que es lo único que ven la
-- cola (`elegibilidad.detalle`) y el acta de turno. El código va en `motivo_bloqueo_codigo` y el
-- detalle interno de HSEQ, que puede ser sensible, en `motivo_bloqueo_nota` (solo en la ficha).
-- La lista vive en `packages/shared/src/motivos-bloqueo.ts` (CODIGOS_MOTIVO_BLOQUEO).

alter table habilitaciones
  add column motivo_bloqueo_codigo text check (motivo_bloqueo_codigo in (
    'CURSO_VENCIDO', 'SIN_CERTIFICACION', 'DOCUMENTO_PENDIENTE', 'INSPECCION_RECHAZADA',
    'SANCION_CLIENTE', 'OTRO'
  )),
  add column motivo_bloqueo_nota text;

comment on column habilitaciones.motivo_bloqueo is
  'Nombre del motivo del catálogo cerrado; es lo que ven la cola y el acta (TASK-0059)';
comment on column habilitaciones.motivo_bloqueo_codigo is
  'Código del catálogo cerrado de motivos de bloqueo (packages/shared/src/motivos-bloqueo.ts)';
comment on column habilitaciones.motivo_bloqueo_nota is
  'Detalle interno de HSEQ; nunca sale a la cola ni al acta (spec §12)';

-- Backfill: el texto libre que había (marcas del TURNERO, notas a mano) pasa a la nota bajo
-- OTRO; el nombre del catálogo ocupa el texto que leen la cola y el acta.
update habilitaciones
   set motivo_bloqueo_codigo = 'OTRO',
       motivo_bloqueo_nota = motivo_bloqueo,
       motivo_bloqueo = 'Otro motivo (ver nota)'
 where apto = false and motivo_bloqueo_codigo is null;

-- Toda placa no apta lleva un motivo del catálogo (spec §6.3).
alter table habilitaciones add constraint habilitaciones_no_apta_con_motivo
  check (apto or motivo_bloqueo_codigo is not null);
