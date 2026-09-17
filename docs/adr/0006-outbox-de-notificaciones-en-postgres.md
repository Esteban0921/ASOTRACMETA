# ADR-0006 — Outbox de notificaciones en Postgres, sin BullMQ

- Estado: aceptada (2026-09-17)
- Referencias: spec §11, §14, §18; ARCHITECTURE §6.11, §12; TASK-0026;
  `packages/domain/src/puertos.ts` (`Transaccion.notificar`), `apps/api/src/notificaciones/`

## Contexto

La spec §11 pide avisos por evento (oferta abierta, declinada, TR asignado o cancelado, documento
por vencer, recaudo pendiente) por tres canales (in-app, correo, WhatsApp opt-in) y §18 sugiere
BullMQ para los jobs y "un outbox simple si se notifican WhatsApp". El requisito duro es que el
aviso exista si y solo si la mutación se confirmó: una oferta que se revierte no puede avisar, y
una oferta confirmada no puede quedarse sin aviso porque Redis estuviera caído.

## Decisión

- **Outbox transaccional en la misma base.** El motor escribe el aviso con `tx.notificar(...)`
  dentro de la transacción de la mutación (`notificaciones_outbox`). En memoria la outbox forma
  parte del estado que `AlmacenMemoria.ejecutar` revierte; en Postgres es una fila más del
  `commit`. No hay doble escritura ni "publicar después del commit".
- **Un worker que consume la outbox** (`WorkerNotificaciones`): toma lotes con
  `for update skip locked` (varias instancias no se pisan), resuelve destinatarios por asociado,
  placa o rol, redacta con plantillas y deja una fila por persona en `notificaciones` (bandeja
  in-app), enviando correo y WhatsApp solo a quien los tenga activos. Un aviso tomado y no cerrado
  vuelve a salir al minuto; a los cinco intentos se cierra con error.
- **Sin BullMQ por ahora.** La outbox ya es la cola: durable, transaccional y con reintento. BullMQ
  añadiría Redis como dependencia dura para un volumen de decenas de avisos al día. Si algún día
  hace falta fan-out o prioridad, el worker puede publicar de la outbox a BullMQ sin tocar el motor.
- **Los jobs de tiempo** (oferta por expirar, documento por vencer, digest de recaudo) encolan en
  la misma outbox con una `clave` de idempotencia: correr el job dos veces no repite el aviso.

## Alternativas descartadas

- **Enviar desde el handler tras el commit**: si el proceso muere entre ambos, el aviso se pierde;
  si el envío falla, hay que inventar reintentos ad hoc.
- **BullMQ como cola principal**: obliga a Redis en desarrollo y en e2e, y no resuelve la
  atomicidad con la transacción (habría que meter la outbox igual).
- **Derivar los avisos del `audit_log`**: acopla las plantillas a la forma de `before/after`; el
  motor sabe mejor qué evento ocurrió y a quién le importa.

## Consecuencias

- El puerto `Transaccion` gana un método; los adaptadores nuevos deben implementarlo.
- La bandeja es personal: RLS filtra por `app.usuario_id` (nuevo `set_config` por petición).
- Correo y WhatsApp son proveedores intercambiables (`mensajeria/proveedores.ts`); sin
  configuración salen por el log, nunca fallan la operación.
