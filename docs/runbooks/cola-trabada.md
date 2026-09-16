# Cola trabada: `COLA_LOCKED` persistente

**Síntoma.** Ofrecer, aceptar o declinar responde `409 COLA_LOCKED` durante más de unos segundos
para la misma clase. En `/metrics`, `asotracmet_cola_locked_total` crece sin parar y
`asotracmet_ofrecer_latencia_ms_bucket{le="5000"}` deja de crecer.

**Cómo funciona el lock.** En Postgres es un advisory lock de transacción
(`pg_try_advisory_xact_lock`) más `select … for update nowait` sobre la clase: muere con la
transacción. Un bloqueo persistente significa una transacción viva en la base.

**Confirmar.**

```sql
select pid, usename, state, now() - xact_start as viva, left(query, 80) as query
  from pg_stat_activity
 where datname = 'asotracmet' and state <> 'idle'
 order by xact_start;
```

Si hay una transacción de minutos en `idle in transaction`, es un cliente colgado (deploy a
medias, pod matado con la conexión abierta).

**Actuar.**

1. `select pg_terminate_backend(<pid>)` solo sobre esa transacción. El motor hace rollback: no queda
   nada a medias (RULE-011).
2. Volver a intentar la acción desde la sala de turnos. El cliente web ya reintenta solo con un
   aviso (`COLA_LOCKED` es estable y traducido).
3. Si no hay transacción viva y sigue el 409, mirar `/readyz` (latencia de la base) y los logs del
   contenedor: puede ser saturación, no bloqueo.

**Con Redis (TASK-0020, pendiente).** Si algún día el lock vive en Redis (`cola:{clase}`), solo
`DEL cola:{clase}` tras confirmar que no hay transacción viva en Postgres.

**Después.** Anotar en la tarea qué lo causó; si fue un deploy, revisar que el apagado espere a
que `SIGTERM` cierre la app (`index.ts` cierra el servidor antes de salir).
