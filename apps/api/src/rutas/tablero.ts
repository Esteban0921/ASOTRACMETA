import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ErrorDominio, type Reloj, type UnidadDeTrabajo } from '@asotracmet/domain';
import { MesSchema, fechaLocal } from '@asotracmet/shared';
import { actorDe, exigir } from '../auth/plugin.js';
import type { Consultas } from '../consultas/tipos.js';
import { calcularTablero } from '../tablero/calcular.js';
import type { RepositorioMetricas, Tablero } from '../tablero/tipos.js';
import type { RepositorioViajes } from '../viajes/tipos.js';

export interface DepsTablero {
  consultas: Consultas;
  viajes: RepositorioViajes;
  metricas: RepositorioMetricas;
  uow: UnidadDeTrabajo;
  reloj: Reloj;
}

/** Mes anterior a `YYYY-MM` (el que cierra el job del día 1). */
export function mesAnterior(mes: string): string {
  const [anio, m] = mes.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio ?? 1970, (m ?? 1) - 2, 1));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Último día de `YYYY-MM` como fecha ISO (`2026-02-28`, `2026-09-30`). */
export function finDeMes(mes: string): string {
  const [anio, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(anio ?? 1970, m ?? 1, 0)).getUTCDate();
  return `${mes}-${String(ultimo).padStart(2, '0')}`;
}

/** Calcula el tablero de un mes desde las fuentes (ofertas, TR, viajes): siempre reproducible. */
export async function tableroDe(
  deps: Pick<DepsTablero, 'consultas' | 'viajes'>,
  mes: string,
): Promise<Tablero> {
  const { timezone } = await deps.consultas.parametros();
  const [ofertas, trs, viajes] = await Promise.all([
    deps.consultas.ofertas({}),
    deps.consultas.trs({ desde: `${mes}-01`, hasta: finDeMes(mes) }),
    deps.viajes.viajes({ mes }),
  ]);
  return calcularTablero({ mes, timezone, ofertas, trs, viajes });
}

/** Tablero del veedor (spec §8.5, §9.2 Viewer) y snapshot mensual de equidad (§14). */
export function rutasTablero(app: FastifyInstance, deps: DepsTablero): void {
  const { consultas, viajes, metricas, uow, reloj } = deps;

  app.get('/api/v1/tablero', { preHandler: exigir('trs', 'R') }, async (req, reply) => {
    const { mes } = z.object({ mes: MesSchema }).parse(req.query);
    return reply.send(await tableroDe({ consultas, viajes }, mes));
  });

  app.get('/api/v1/tablero/snapshots', { preHandler: exigir('trs', 'R') }, async (req, reply) => {
    const { mes } = z.object({ mes: MesSchema.optional() }).parse(req.query);
    if (!mes) return reply.send({ meses: await metricas.mesesConSnapshot() });
    const snapshot = await metricas.snapshot(mes);
    if (!snapshot) throw new ErrorDominio('NOT_FOUND', `Sin snapshot para ${mes}`);
    return reply.send(snapshot);
  });

  // Job §14: snapshot del mes (por defecto el anterior). Reproducible: se reescribe entero.
  app.post(
    '/api/v1/jobs/snapshot-metricas',
    { preHandler: exigir('cola', 'U') },
    async (req, reply) => {
      const { timezone } = await consultas.parametros();
      const hoy = fechaLocal(reloj.ahora(), timezone);
      const { mes } = z
        .object({ mes: MesSchema.default(mesAnterior(hoy.slice(0, 7))) })
        .parse(req.body ?? {});
      const actor = actorDe(req);
      const tablero = await tableroDe({ consultas, viajes }, mes);
      const snapshot = { mes, generadoEn: reloj.ahora().toISOString(), filas: tablero.equidad };
      await metricas.guardarSnapshot(snapshot);
      await uow.ejecutar(null, (tx) =>
        tx.auditar({
          actorId: actor.id,
          actorRol: actor.rol,
          accion: 'metricas.snapshot',
          entidad: 'metricas_mes',
          entidadId: mes,
          before: null,
          after: {
            placas: snapshot.filas.length,
            ofertas: tablero.ofertas,
            viajes: tablero.viajes,
          },
        }),
      );
      return reply.send(snapshot);
    },
  );
}
