# Runbooks de operación (spec §15, TASK-0030)

Qué mirar y qué hacer cuando algo se traba. Cada runbook dice cómo detectarlo, cómo confirmarlo y
cómo actuar sin saltarse la auditoría. Señales: `/healthz`, `/readyz`, `/metrics`
(ver [observabilidad.md](observabilidad.md)) y los logs JSON del contenedor.

| Situación                                      | Runbook                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| `COLA_LOCKED` que no se suelta                 | [cola-trabada.md](cola-trabada.md)                   |
| `TR_DUPLICADO` al aceptar una oferta           | [secuencia-tr-desfasada.md](secuencia-tr-desfasada.md) |
| Un asociado ve placas o TR que no son suyos    | [member-ve-placa-ajena.md](member-ve-placa-ajena.md) |
| Restaurar un backup / simulacro trimestral     | [restore-en-staging.md](restore-en-staging.md)       |
| Salud, métricas y trazas                       | [observabilidad.md](observabilidad.md)               |
