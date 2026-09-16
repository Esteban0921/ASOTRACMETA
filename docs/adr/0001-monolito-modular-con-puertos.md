# ADR-0001 — Monolito modular con el motor de cola aislado tras puertos

- Estado: aceptada (2026-09-16)
- Referencias: spec §5.1, §5.3, §17; ARCHITECTURE §4-5

## Contexto

La asociación tiene entre 10 y 80 asociados. La feature más política es la equidad de la cola y su
auditoría, no la escala. La spec exige que el día que se cambie de almacenamiento o de framework HTTP
"no se reescriba el dominio".

## Decisión

Un solo despliegue (API + web) con tres paquetes: `shared` (lenguaje ubicuo), `domain` (motor,
invariantes, puertos `Transaccion`/`UnidadDeTrabajo`) y las apps. El motor no importa HTTP, DB ni UI
y ESLint lo impide. La persistencia es un adaptador.

## Alternativas descartadas

- **Microservicios / EventStore**: coste operativo desproporcionado para el tamaño; la spec lo
  excluye explícitamente.
- **Lógica de cola en la API (controladores) o en el frontend**: es exactamente el error del Excel
  con otra cara; imposibilita probar el motor sin levantar servidores.
- **AppSheet/Glide como producto final**: válido como puente 6 meses, pero el motor de cola termina
  como laberinto de expressions (spec §21).

## Consecuencias

- Los tests del motor corren en milisegundos y cubren la spec §16 sin infraestructura.
- Añadir Postgres (TASK-0019) es implementar dos interfaces, no reescribir reglas.
- El coste es mantener los puertos honestos: cuando el motor necesita un dato nuevo, se añade al
  puerto y a todos los adaptadores.
