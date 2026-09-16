# ADR-0002 — Almacén en memoria transaccional como fase puente

- Estado: aceptada (2026-09-16); caduca cuando TASK-0019 esté hecha
- Referencias: spec §5.2, §22; ARCHITECTURE §5.7

## Contexto

Había que entregar el loop `ofrecer → aceptar → TR` verificable de punta a punta (unit, API, e2e)
sin depender de Docker (no disponible en la máquina de desarrollo sin permisos de administrador) ni
de una base de datos remota.

## Decisión

`AlmacenMemoria` implementa `UnidadDeTrabajo` y `Transaccion` con la **misma semántica** que tendrá
Postgres: lock por clase de cola sin espera (`COLA_LOCKED`), rollback total si la función lanza
(snapshot con `structuredClone`), auditoría dentro de la transacción y detección de `TR_DUPLICADO`.
Es el almacén de desarrollo, de los tests de API y del modo e2e (con `reset`).

## Alternativas descartadas

- **Mocks por método en cada test**: no prueban la atomicidad ni el lock; cada test reinventa el
  almacén.
- **SQLite**: no tiene RLS ni `deferrable`, y obligaría a mantener dos dialectos SQL.
- **pg-mem**: no soporta RLS ni parte del DDL usado.

## Consecuencias

- Todo lo que hoy pasa en memoria debe pasar igual contra Postgres: los tests del motor y de la API
  se reutilizan con el adaptador real inyectado.
- Riesgo conocido: el estado se pierde al reiniciar la API. Está documentado como fase puente y no es
  apto para operar un día real de HLB (Fase 1 done requiere TASK-0019).
