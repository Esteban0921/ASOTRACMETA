# Migración del Excel legado (TASK-0025, spec §13)

El archivo `control de enturnamiento.xlsx` es el sistema que ASOTRACMET usó hasta septiembre de
2026 para enturnar, asignar TR, liquidar el 3 % y llevar la flota. Este documento explica qué hay en
cada hoja, cómo funcionaba ese método, cómo se traduce al modelo del sistema nuevo y qué decisiones
se tomaron. El xlsx vive en `RECURSOS/` (ignorado por git: contiene PII y credenciales de GPS).

Comando: `pnpm db:migrate-xlsx [--archivo ruta] [--dry-run] [--sin-db] [--informe ruta]`.
Repetible: los ids son UUID v5 de la llave de negocio, así que volver a ejecutarlo actualiza en vez
de duplicar. El informe de excepciones se escribe junto al xlsx (`RECURSOS/informe-migracion.md`).

## 1. El método antiguo, hoja por hoja

| Hoja                                 | Qué era en el método antiguo                                                                                                                                                    | Destino en el sistema nuevo                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TURNERO`                            | La cola viva: una tabla por clase (tractomulas, minimulas, rígidos) con el número de turno escrito a mano, las marcas `X`/`NA`/`NO` de habilitación por cliente y observaciones. | `cola_posiciones` (orden de la foto del 16/09/26), `habilitaciones` (con el snapshot de marcas en `requisitos`), atributos del vehículo (carrocería, largo, modelo), `no_elegible_hasta` (sanciones). |
| `CONTROL TURNOS HLB AGOS` / `SEPT`   | Planilla diaria de asignaciones HLB: fecha, posición (1, 2, 3) y código `TR-xxxxx` o `DECLINA` por clase; TR pendientes y cancelados aparte.                                    | Solo informe. No trae placa, así que un TR real no se puede atribuir a un vehículo sin la planilla física. Alimenta los conteos y las excepciones (`TR-` vacío, duplicados, `DECLINO`, sufijos).      |
| `SERV MAY26` … `SERV SEPT26`         | Control mensual de rutas: placa, cliente, fecha de cargue, lugar, transportadora, flete, 3 %, valor pagado, comprobante.                                                         | `requerimientos` + `trs` sintéticos + `viajes` + `recaudos`. Un viaje por fila; el recaudo se recalcula con `parametros.recaudo_porcentaje` y se compara con la celda del 3 %.                        |
| `LISTA ASOCIADOS`                    | Lista de afiliación vigente: placa, clase, asociado (o propietario y parentesco).                                                                                                | `asociados`, `vehiculos` (clase, propietario, parentesco). Es la fuente con más precedencia para decidir el asociado de una placa.                                                                     |
| `LISTA TM`                           | Ficha de flota por propietario: modelo, repotenciación, km, SOAT/tecnomecánica/póliza, certificaciones del tráiler, proveedor GPS **y sus credenciales**, conductores.           | `vehiculos` (modelo, km, tráiler, `gps_proveedor`), `documentos` (8 tipos), `conductores` + `vehiculo_conductores`. **Las credenciales de GPS y de correo no se leen.** Cuenta bancaria cifrada.       |
| `DATOS DE SERVICIOS`                 | Fichas para el cliente: placa, tráiler, conductor, poseedor.                                                                                                                     | `conductores`, `vehiculo_conductores`, tráiler.                                                                                                                                                       |
| `TARIFAS HLB`                        | Tarifario por destino para Halliburton, Baker y Weatherford, por modalidad.                                                                                                      | `destinos` (70) y `tarifas` (vigencia 2026-01-01, referenciales).                                                                                                                                     |
| `COSTOS SALARIO`, `PRESUPUESTO`      | Presupuesto de la asociación.                                                                                                                                                    | No se migra: no es dato de operación del enturnamiento.                                                                                                                                              |
| `REG ASIST`, `CORREOS`, `CORREOS (2)` | Formato de asistencia y directorio de contactos de clientes/transportadoras.                                                                                                     | No se migra (no hay tabla destino). El directorio puede volver como maestro en TASK-0023 si se necesita.                                                                                              |

### Cómo funcionaba y qué cambia

- **Turno**: en el Excel el turno era un número escrito por la coordinación; podía repetirse, saltarse o
  quedar "prearmado" (filas 23+ de CONTROL TURNOS con posiciones sin TR). En el sistema la posición
  es un invariante (`1..N` denso por clase) que solo cambia por acciones del motor auditadas.
- **Oferta y respuesta**: el Excel solo registraba el resultado (`TR-…` o `DECLINA`). El sistema
  registra la oferta, quién respondió, cuándo y con qué motivo, y aplica la política de declinación
  como parámetro.
- **TR**: el código se escribía a mano, por eso hay repetidos (`TR-39204` tres veces, `TR-40719`
  cuatro), vacíos (`TR-`) y sufijos (`TR-39591-1`). El sistema lo genera de una secuencia y es único.
- **Recaudo**: el 3 % era una fórmula por fila y el pago se anotaba al lado. El sistema guarda el
  porcentaje aplicado como snapshot y el recaudo como registro con estado.
- **Habilitación**: las marcas `X`/`NA`/`NO` del TURNERO se convierten en `habilitaciones` por
  cliente; la celda vacía no crea fila (no se inventa aptitud).

## 2. Decisiones (spec §13.2)

Están codificadas en `DECISIONES` (`infra/migracion/modelo.ts`) y salen en el informe:

1. Un asociado / varias placas: una fila en `asociados`, N en `vehiculos`.
2. `TM` y `CBZ` comparten la cola `TM-CBZ`.
3. TR de las hojas SERV sintéticos `TR-1AAAAMMNNN` (año, mes, ítem). Los TR reales de CONTROL
   TURNOS quedan en el informe hasta que exista la planilla que los ate a una placa.
4. El flete del SERV gana (`viajes.flete`); la tarifa es referencial.
5. Cola reconstruida desde el TURNERO (disponibles, en ruta, resto de activos); N = activos.
6. Asociado de una placa: `LISTA ASOCIADOS` (columna ASOCIADO o, si falta, PROPIETARIO sin
   parentesco) > bloque del propietario en `LISTA TM` > POSEEDOR de `DATOS DE SERVICIOS` > CC de
   `SERV` > nombre corto inequívoco. Las discrepancias se listan (`LISTA TM` conserva dueños
   anteriores, por ejemplo `SPS413`).
7. Clase de una placa: primera hoja que la trae; diferencias listadas (`STE076` C350/C600,
   `QOR007` TM/MM).
8. Placas de terceros (solo en SERV, sin asociado): se crean `inactivo`, fuera de la cola y sin
   recaudo.
9. Segunda columna de cada modalidad TM en `TARIFAS HLB` (= primera × 1,07): modalidad `*_2`,
   significado por confirmar.
10. Erratas de placa unificadas por alias (`PUO538` → `PVO538`, `QJL599` → `QJL566`). Un mismo
    nombre con dos documentos se unifica bajo el primero (`CESAR AUGUSTO HERRERA RODRIGUEZ`).
11. Nunca se importan contraseñas (columnas de usuario/clave GPS y de correo secundario de
    `LISTA TM`). La cuenta bancaria se cifra con la clave de la API (`cuenta_bancaria_enc`).

Pendientes de confirmar con la asociación: el significado de la columna `*_2` de tarifas, el mapa
de `TURBO`/`MINITURBO` de Weatherford a clases (`C350`/`C100`), y si las placas de terceros deben
quedar en la base.

## 3. Resultado de la carga (2026-09-16)

| Entidad             | Cantidad                                         |
| ------------------- | ------------------------------------------------ |
| asociados           | 27 (uno unificado por documento discrepante)     |
| vehículos           | 59 (51 activos, 8 de terceros inactivos)         |
| conductores         | 33                                               |
| documentos          | 53 (SOAT, tecnomecánica, póliza, certificaciones) |
| habilitaciones      | 244                                              |
| destinos / tarifas  | 70 / 1211                                        |
| transportadoras     | 30                                               |
| posiciones de cola  | 51 (TM-CBZ 32, MM 8, C100 7, C350 4)             |
| viajes / TR / recaudos | 265 / 265 / 257                               |
| usuarios            | 33: 6 internos de la semilla + 27 member por correo |

Excepciones más frecuentes: lugares de descargue que no coinciden con un destino canónico (257
viajes, agrupados por lugar en el informe: es la lista de trabajo para el catálogo de destinos),
vehículos con clientes sin marca en el TURNERO (49), TR repetidos en las planillas (10), placas que
`LISTA TM` o `DATOS DE SERVICIOS` atribuyen a un dueño anterior (7, se conserva `LISTA ASOCIADOS`).

## 4. Cómo repetirla

```bash
ASOTRACMET_PG_PORT=5434 ASOTRACMET_REDIS_PORT=6381 docker compose -f infra/compose.yaml up -d
export DATABASE_URL=postgres://asotracmet:asotracmet@localhost:5434/asotracmet
pnpm db:migrate                      # esquema (append-only)
pnpm db:migrate-xlsx --dry-run       # valida contra el esquema real y hace rollback
pnpm db:migrate-xlsx                 # carga + informe en RECURSOS/informe-migracion.md
PERSISTENCIA=postgres pnpm --filter @asotracmet/api dev
```

Con `--sin-db` se obtiene solo el informe (no necesita Postgres). La semilla anonimizada
(`pnpm db:seed`) y la migración pueden convivir: comparten los ids de placa (`veh-<placa>`), así que
la misma placa es la misma fila.
