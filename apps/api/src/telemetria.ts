import { SpanStatusCode, metrics, trace } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { ClaseCola } from '@asotracmet/shared';
import type { Transaccion, UnidadDeTrabajo } from '@asotracmet/domain';

// OpenTelemetry (spec §15, TASK-0030): trazas de la transacción de cola y métricas por OTLP/HTTP.
// Solo se activa con OTEL_EXPORTER_OTLP_ENDPOINT; sin él, los instrumentos son no-op y no cuestan.

export interface OpcionesTelemetria {
  /** Base OTLP/HTTP, p. ej. `http://localhost:4318` (se añaden `/v1/traces` y `/v1/metrics`). */
  endpoint: string | null;
  servicio: string;
  version?: string;
  exportarCadaMs?: number;
}

export interface Telemetria {
  activa: boolean;
  apagar(): Promise<void>;
}

export function iniciarTelemetria(opciones: OpcionesTelemetria): Telemetria {
  if (!opciones.endpoint) return { activa: false, apagar: async () => undefined };
  const base = opciones.endpoint.replace(/\/$/, '');
  const resource = resourceFromAttributes({
    'service.name': opciones.servicio,
    'service.version': opciones.version ?? 'dev',
  });
  const trazas = new NodeTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: `${base}/v1/traces` }))],
  });
  trazas.register();
  const metricas = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }),
        exportIntervalMillis: opciones.exportarCadaMs ?? 15_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(metricas);
  return {
    activa: true,
    apagar: async () => {
      await metricas.shutdown();
      await trazas.shutdown();
    },
  };
}

/**
 * Envuelve la unidad de trabajo para que cada transacción de cola sea un span `cola.transaccion`
 * con la clase, el resultado y el error de dominio si lo hubo (spec §15: "trazas en la transacción").
 */
export function trazarUnidadDeTrabajo(uow: UnidadDeTrabajo): UnidadDeTrabajo {
  const tracer = trace.getTracer('asotracmet-api');
  const ejecutar = <T>(
    claseCola: ClaseCola | null,
    fn: (tx: Transaccion) => Promise<T>,
  ): Promise<T> =>
    tracer.startActiveSpan(
      'cola.transaccion',
      { attributes: { 'cola.clase': claseCola ?? 'ninguna' } },
      async (span) => {
        try {
          return await uow.ejecutar(claseCola, fn);
        } catch (error) {
          const codigo = (error as { code?: string }).code;
          if (codigo) span.setAttribute('error.codigo', codigo);
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  return new Proxy(uow, {
    get(target, propiedad, receptor) {
      if (propiedad === 'ejecutar') return ejecutar;
      const valor = Reflect.get(target, propiedad, receptor) as unknown;
      return typeof valor === 'function'
        ? (valor as (...a: unknown[]) => unknown).bind(target)
        : valor;
    },
  });
}
