# ADR-0004 — Row Level Security con `app.rol` y `app.vehiculo_ids` por transacción

- Estado: aceptada (2026-09-16)
- Referencias: spec §3.3; ARCHITECTURE §8; `infra/postgres/migrations/0009_rls.sql`

## Contexto

"El frontend miente; la DB no." Un `member` debe ejecutar, por construcción,
`WHERE vehiculo_id IN (placas_del_usuario)`. Hacerlo solo en la API deja la puerta abierta a un bug
de filtro.

## Decisión

Políticas RLS **forzadas** en `cola_posiciones`, `ofertas`, `trs`, `viajes`, `documentos` y
`recaudos`. La API abre cada transacción con `set local app.rol` y `set local app.vehiculo_ids`.
Sin settings el rol efectivo es `sistema` (migraciones, jobs). Member solo lee sus placas y nunca
escribe directamente; viewer nunca escribe; las escrituras de negocio llegan con el rol del actor.

## Alternativas descartadas

- **Un rol de Postgres por usuario**: inviable con pool de conexiones y decenas de asociados.
- **Solo filtros en la API**: es lo que la spec prohíbe.
- **Vistas por rol**: multiplican objetos y no cubren escrituras.

## Consecuencias

- El adaptador Postgres (TASK-0019) debe setear los settings en cada transacción; un olvido se
  detecta con el test `RLS: un member solo ve los TR de sus placas`.
- Un superusuario o el owner de las tablas se salta RLS aunque esté forzada. Por eso `0009_rls.sql`
  crea el rol `asotracmet_app` (sin login, con grants) y la API debe operar con él; los tests de
  migraciones hacen `set local role asotracmet_app` antes de comprobar las políticas.
