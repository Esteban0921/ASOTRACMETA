# Cola trabada: `COLA_LOCKED` persistente

**Síntoma.** Ofrecer, aceptar o declinar responde `409 COLA_LOCKED` durante más de unos segundos
para la misma clase. En `/metrics`, `asotracmet_cola_locked_total` crece sin parar y
`asotracmet_ofrecer_latencia_ms_bucket{le="5000"}` deja de crecer.

**Cómo funciona el lock.** Dos capas (spec §7.7). En Postgres es un advisory lock de transacción
(`pg_try_advisory_xact_lock`) más `select … for update nowait` sobre la clase: muere con la
transacción. Con `REDIS_URL` (TASK-0020) la API toma antes la clave `cola:{clase}` en Redis
(`SET NX PX`, token único, `LOCK_TTL_MS` = 10 s por defecto) y la suelta al terminar con un
compare-and-delete: si el proceso muere a medias, la clave vence sola. Si Redis no responde, la
API sigue solo con Postgres y lo cuenta en `asotracmet_lock_redis_errores_total`. Un bloqueo
persistente significa una transacción viva en la base o, como mucho durante el TTL, una clave
huérfana en Redis.

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

**Con Redis.** El 409 de esta capa trae `details.origen = "redis"`. Mirar cuánto le queda a la
clave:

```sh
redis-cli -u "$REDIS_URL" PTTL cola:TM-CBZ   # ms; -2 = no existe (la cola no está trabada aquí)
```

Nunca dura más que `LOCK_TTL_MS`: esperar suele bastar. `DEL cola:{clase}` solo tras confirmar que
no hay transacción viva en Postgres (si la hay, el advisory lock seguirá diciendo `COLA_LOCKED`).
Si `asotracmet_lock_redis_errores_total` crece, Redis está caído o inalcanzable: la cola sigue
funcionando con el lock de Postgres, pero `/readyz` responde 503 hasta que vuelva.

**Después.** Anotar en la tarea qué lo causó; si fue un deploy, revisar que el apagado espere a
que `SIGTERM` cierre la app (`index.ts` cierra el servidor antes de salir).
