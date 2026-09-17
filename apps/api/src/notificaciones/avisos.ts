import { diasParaVencer } from '@asotracmet/shared';
import type { Reloj } from '@asotracmet/domain';
import type { Consultas } from '../consultas/tipos.js';
import type { RepositorioMaestros } from '../maestros/tipos.js';
import type { RepositorioViajes } from '../viajes/tipos.js';
import type { RepositorioNotificaciones } from './tipos.js';

// Avisos que no nacen de una mutación del motor sino de un job (spec §11, §14): oferta por
// expirar (T-15 min), documento por vencer (30 y 7 días) y digest diario de recaudo pendiente.
// Cada uno lleva una `clave` de idempotencia: correr el job dos veces no repite el aviso.

export interface DepsAvisos {
  notificaciones: RepositorioNotificaciones;
  consultas: Consultas;
  maestros: RepositorioMaestros;
  viajes: RepositorioViajes;
  reloj: Reloj;
}

/** Ofertas abiertas a las que les quedan `ventanaMin` minutos o menos: asociado + ops. */
export async function avisarOfertasPorExpirar(deps: DepsAvisos, ventanaMin = 15): Promise<number> {
  const ahora = deps.reloj.ahora();
  const abiertas = await deps.consultas.ofertas({ estado: 'abierta' });
  let encolados = 0;
  for (const o of abiertas) {
    const restanteMin = (Date.parse(o.expiraEn) - ahora.getTime()) / 60_000;
    if (restanteMin <= 0 || restanteMin > ventanaMin) continue;
    const nuevo = await deps.notificaciones.encolar(
      {
        evento: 'oferta.por_expirar',
        destinos: [{ asociadoId: o.asociadoId, vehiculoId: o.vehiculoId }, { rol: 'admin_ops' }],
        datos: {
          ofertaId: o.id,
          vehiculoId: o.vehiculoId,
          placa: o.placa,
          expiraEn: o.expiraEn,
          minutos: Math.ceil(restanteMin),
        },
        clave: `oferta.por_expirar:${o.id}`,
      },
      ahora.toISOString(),
    );
    if (nuevo) encolados += 1;
  }
  return encolados;
}

/** Documentos que entran en la ventana de 30 o de 7 días: HSEQ + asociado (si es de una placa). */
export async function avisarDocumentosPorVencer(
  deps: DepsAvisos,
  hoy: string,
  umbrales: readonly number[] = [30, 7],
): Promise<number> {
  const ahora = deps.reloj.ahora().toISOString();
  const [documentos, tipos, vehiculos] = await Promise.all([
    deps.maestros.documentos({}),
    deps.maestros.tiposDocumento(),
    deps.maestros.vehiculos({ incluirEliminados: true }),
  ]);
  const nombreTipo = new Map(tipos.map((t) => [t.id, t.nombre]));
  const porId = new Map(vehiculos.map((v) => [v.id, v]));
  let encolados = 0;
  for (const d of documentos) {
    const dias = diasParaVencer(d.venceEn, hoy);
    if (dias === null || dias < 0) continue;
    const vehiculo = d.sujetoTipo === 'vehiculo' ? porId.get(d.sujetoId) : undefined;
    for (const umbral of umbrales) {
      if (dias > umbral) continue;
      const nuevo = await deps.notificaciones.encolar(
        {
          evento: 'documento.por_vencer',
          destinos: [
            { rol: 'admin_hseq' },
            ...(vehiculo ? [{ asociadoId: vehiculo.asociadoId, vehiculoId: vehiculo.id }] : []),
          ],
          datos: {
            documentoId: d.id,
            tipo: nombreTipo.get(d.tipoId) ?? 'Documento',
            vehiculoId: vehiculo?.id ?? null,
            placa: vehiculo?.placa ?? null,
            venceEn: d.venceEn,
            dias,
            umbral,
          },
          clave: `documento.por_vencer:${d.id}:${umbral}`,
        },
        ahora,
      );
      if (nuevo) encolados += 1;
    }
  }
  return encolados;
}

/** Digest diario a finance: cuántos recaudos siguen pendientes y por cuánto. Uno por día. */
export async function avisarRecaudosPendientes(deps: DepsAvisos, hoy: string): Promise<boolean> {
  const pendientes = (await deps.viajes.recaudos({})).filter(
    (r) => r.estado === 'pendiente' || r.estado === 'parcial',
  );
  if (pendientes.length === 0) return false;
  const valor = pendientes.reduce((suma, r) => suma + Math.max(0, r.valor - r.valorPagado), 0);
  return deps.notificaciones.encolar(
    {
      evento: 'recaudo.pendiente',
      destinos: [{ rol: 'admin_finance' }],
      datos: { hoy, cantidad: pendientes.length, valor },
      clave: `recaudo.pendiente:${hoy}`,
    },
    deps.reloj.ahora().toISOString(),
  );
}

export interface ResumenAvisos {
  porExpirar: number;
  documentos: number;
  recaudos: boolean;
}

/** Los tres jobs de una vez (disparo manual `POST /jobs/avisos` y arranque nocturno). */
export async function correrAvisos(deps: DepsAvisos, hoy: string): Promise<ResumenAvisos> {
  return {
    porExpirar: await avisarOfertasPorExpirar(deps),
    documentos: await avisarDocumentosPorVencer(deps, hoy),
    recaudos: await avisarRecaudosPendientes(deps, hoy),
  };
}
