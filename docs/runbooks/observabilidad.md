# Salud, métricas y trazas (spec §15, TASK-0030)

## Endpoints

| Ruta       | Auth                                  | Qué devuelve                                                                                                   |
| ---------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/healthz` | pública                               | `{ ok, modo }`: el proceso vive. Es el `HEALTHCHECK` del contenedor.                                           |
| `/readyz`  | pública                               | `{ ok, db: { ok, ms }, redis: { ok, ms } \| 'n/a' }`; 503 si la base no responde. Para el proxy y el orquestador. |
| `/metrics` | `METRICS_TOKEN` (Bearer) si está definido | Texto Prometheus, sin PII.                                                                                 |

## Métricas (`/metrics`)

- `asotracmet_http_respuestas_total{clase}`: respuestas por clase de estado (2xx/4xx/5xx).
- `asotracmet_errores_dominio_total{codigo}` y `asotracmet_cola_locked_total`: errores de negocio
  con código estable; el segundo es el que vigila la spec.
- `asotracmet_ofrecer_latencia_ms_*`: histograma de la transacción `ofrecer` (buckets 25 ms a 5 s).
- `asotracmet_ofrecer_errores_total`, `asotracmet_declinaciones_total`.
- `asotracmet_ofertas_abiertas`, `asotracmet_declinaciones_hoy`: gauges calculados al raspar.
- `asotracmet_uptime_seconds`.

Alertas razonables: `cola_locked_total` creciendo más de 5/min (ver
[cola-trabada.md](cola-trabada.md)); `ofrecer_latencia_ms` p95 > 2 s; `readyz` en 503 dos veces
seguidas; `ofertas_abiertas` > 0 durante más del TTL sin cambios (job de expiración caído).

Prometheus: `scrape_configs: - job_name: asotracmet; authorization: { credentials: <METRICS_TOKEN> }`.

## Trazas y métricas por OpenTelemetry

Con `OTEL_EXPORTER_OTLP_ENDPOINT=http://<collector>:4318` la API registra un `NodeTracerProvider`
y un `MeterProvider` (`apps/api/src/telemetria.ts`) que exportan por OTLP/HTTP:

- Span `cola.transaccion` por cada `UnidadDeTrabajo.ejecutar` (atributos `cola.clase`,
  `error.codigo`, estado de error si el motor lanzó): es la traza de la transacción de cola que
  pide la spec.
- Los mismos contadores e histogramas de `/metrics` como instrumentos OTel
  (`asotracmet.http.respuestas`, `asotracmet.errores.dominio`, `asotracmet.ofrecer.latencia`,
  `asotracmet.declinaciones`).

Sin la variable, los instrumentos son no-op y no hay coste. `OTEL_SERVICE_NAME` cambia el nombre
del servicio (por defecto `asotracmet-api`).

## Logs

Pino en JSON, un objeto por petición (`reqId`, método, ruta, estado, tiempo). Sin PII cruda
(RULE-021): los códigos de acceso solo salen mientras `MENSAJERIA=consola` y hay que desactivarlo
en producción (TASK-0026).
