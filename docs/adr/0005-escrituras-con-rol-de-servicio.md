# ADR-0005 — Escrituras del motor con rol de servicio, lecturas con el rol del actor

- Estado: aceptada (2026-09-16)
- Referencias: spec §3.3, §7.1, §7.4; ARCHITECTURE §5.6, §8; ADR-0004; `apps/api/src/persistencia/postgres.ts`

## Contexto

Cuando un `member` declina una oferta, el motor rota su placa al final y **renumera las posiciones
de todas las demás placas** de la clase. Bajo RLS, un `member` solo puede tocar filas de sus propias
placas, así que la transacción de declinar fallaría a mitad de camino. Lo mismo ocurre al aceptar
(reordena la cola) y al reofertar automáticamente al siguiente (crea una oferta para otra placa).

## Decisión

- `UnidadDeTrabajo.ejecutar` (escrituras del motor) corre con `app.rol = 'sistema'`. El motor es el
  único que escribe, y ya comprueba el scope `own` antes de tocar nada (`FORBIDDEN_OWN_SCOPE`).
- `UnidadDeTrabajo.leer` y todo el puerto `Consultas` corren con el rol real del actor y sus
  `app.vehiculo_ids`. Ahí RLS es la última defensa contra el incidente "member ve placa ajena".
- El actor real queda en `audit_log.actor_id` / `actor_rol` aunque la transacción sea de servicio.
- Ambos caminos hacen `set local role asotracmet_app`: nunca se opera como owner ni superusuario.
- El largo de la cola (denominador de "Tu posición: 3 de 12") se obtiene con `cola_total()`, una
  función `security definer` acotada a una sentencia con `app.rol = 'sistema'`.

## Alternativas descartadas

- **Políticas de escritura por placa para member**: no cubren la renumeración de otras placas ni la
  reoferta automática; obligarían a partir la transacción, que es justo lo que la spec prohíbe.
- **Todo con rol de servicio, incluidas lecturas**: deja RLS sin efecto práctico.
- **Un rol de Postgres por usuario final**: inviable con pool de conexiones.

## Consecuencias

- La garantía de que un member no altera lo ajeno vive en el motor (tests de dominio) y la de que
  no lo lee vive en RLS (tests de base). Las dos se prueban en `infra/postgres/*.test.ts`.
- Cualquier escritura nueva fuera del motor (por ejemplo, un CRUD de maestros) debe decidir
  explícitamente con qué rol corre y documentarlo en la tarea.
