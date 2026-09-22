import { CLASES_COLA, diasParaVencer, type ClaseCola } from '@asotracmet/shared';
import type { MotorCola, PosicionCola, Reloj } from '@asotracmet/domain';
import type { Consultas } from '../consultas/tipos.js';
import type { RepositorioMaestros } from '../maestros/tipos.js';
import type { RepositorioViajes } from '../viajes/tipos.js';
import type { RepositorioNotificaciones } from './tipos.js';

// Avisos que no nacen de una mutación del motor sino de un job (spec §11, §14): oferta por
// expirar (T-15 min), documento por vencer (30 y 7 días), digest diario de recaudo pendiente y,
// desde TASK-0057, los tres avisos proactivos de la cola (brief §5): "estás de 2.º", "este
// documento vencido te va a costar el turno" y "este requerimiento no tiene a quién ofrecerse".
// Cada uno lleva una `clave` de idempotencia: correr el job dos veces no repite el aviso.

export interface DepsAvisos {
  notificaciones: RepositorioNotificaciones;
  consultas: Consultas;
  maestros: RepositorioMaestros;
  viajes: RepositorioViajes;
  reloj: Reloj;
  /** Solo lectura: la foto de la cola con elegibilidad, la misma de `GET /colas/:clase`. */
  motor: Pick<MotorCola, 'snapshotCola'>;
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

/**
 * `cola.proximo` (brief §5): las primeras `aviso_proximo_turno_posiciones` placas elegibles de
 * cada clase, sin cliente (la habilitación depende del requerimiento que aún no existe). La clave
 * lleva el `ciclo` de la posición: se avisa una vez por vuelta, no cada minuto ni cada vez que la
 * placa sube un puesto.
 */
export async function avisarProximosEnTurno(deps: DepsAvisos): Promise<number> {
  const { aviso_proximo_turno_posiciones: cuantas } = await deps.consultas.parametros();
  const ahora = deps.reloj.ahora().toISOString();
  let encolados = 0;
  for (const claseCola of CLASES_COLA) {
    const elegibles = (await deps.motor.snapshotCola(claseCola)).filter(
      (p) => p.elegibilidad.elegible,
    );
    for (const [indice, p] of elegibles.slice(0, cuantas).entries()) {
      const nuevo = await deps.notificaciones.encolar(
        {
          evento: 'cola.proximo',
          destinos: [{ asociadoId: p.vehiculo.asociadoId, vehiculoId: p.vehiculoId }],
          datos: {
            vehiculoId: p.vehiculoId,
            placa: p.vehiculo.placa,
            claseCola,
            posicion: p.posicion,
            posicionElegible: indice + 1,
            ciclo: p.ciclo,
          },
          clave: `cola.proximo:${p.vehiculoId}:${p.ciclo}`,
        },
        ahora,
      );
      if (nuevo) encolados += 1;
    }
  }
  return encolados;
}

interface DocumentoVencido {
  id: string;
  tipo: string;
  venceEn: string;
}

/**
 * `documento.bloquea_turno` (brief §5): una placa dentro de las primeras
 * `aviso_documento_bloquea_posiciones` posiciones de su clase con un documento bloqueante del
 * vehículo ya vencido (spec §6.3: la cola la va a saltar). Al asociado y a HSEQ, una vez por
 * documento y vuelta. Si `bloquear_por_documento_vencido` está apagado el documento no cuesta el
 * turno y no hay nada que avisar.
 */
export async function avisarDocumentosBloqueanTurno(
  deps: DepsAvisos,
  hoy: string,
): Promise<number> {
  const parametros = await deps.consultas.parametros();
  if (!parametros.bloquear_por_documento_vencido) return 0;
  const ahora = deps.reloj.ahora().toISOString();
  const [documentos, tipos] = await Promise.all([
    deps.maestros.documentos({ sujetoTipo: 'vehiculo' }),
    deps.maestros.tiposDocumento(),
  ]);
  const tipoPorId = new Map(tipos.map((t) => [t.id, t]));
  const vencidosPorVehiculo = new Map<string, DocumentoVencido[]>();
  for (const d of documentos) {
    const tipo = tipoPorId.get(d.tipoId);
    const dias = diasParaVencer(d.venceEn, hoy);
    if (!tipo?.bloqueante || !d.venceEn || dias === null || dias >= 0) continue;
    const lista = vencidosPorVehiculo.get(d.sujetoId) ?? [];
    lista.push({ id: d.id, tipo: tipo.nombre, venceEn: d.venceEn });
    vencidosPorVehiculo.set(d.sujetoId, lista);
  }
  if (vencidosPorVehiculo.size === 0) return 0;

  let encolados = 0;
  for (const claseCola of CLASES_COLA) {
    const cabeza = (await deps.motor.snapshotCola(claseCola)).filter(
      (p) => p.posicion <= parametros.aviso_documento_bloquea_posiciones,
    );
    for (const p of cabeza) {
      for (const documento of vencidosPorVehiculo.get(p.vehiculoId) ?? []) {
        const nuevo = await deps.notificaciones.encolar(
          {
            evento: 'documento.bloquea_turno',
            destinos: [
              { asociadoId: p.vehiculo.asociadoId, vehiculoId: p.vehiculoId },
              { rol: 'admin_hseq' },
            ],
            datos: {
              documentoId: documento.id,
              tipo: documento.tipo,
              venceEn: documento.venceEn,
              vehiculoId: p.vehiculoId,
              placa: p.vehiculo.placa,
              claseCola,
              posicion: p.posicion,
              ciclo: p.ciclo,
            },
            clave: `documento.bloquea_turno:${p.vehiculoId}:${documento.id}:${p.ciclo}`,
          },
          ahora,
        );
        if (nuevo) encolados += 1;
      }
    }
  }
  return encolados;
}

/**
 * `cola.sin_elegibles` (brief §5): un requerimiento abierto con cupo libre cuya cola, evaluada
 * para su cliente, no tiene ninguna placa elegible. A ops y a HSEQ, una vez por día y
 * requerimiento; los motivos van como conteos por código (sin placas ni personas).
 */
export async function avisarColasSinElegibles(deps: DepsAvisos, hoy: string): Promise<number> {
  const ahora = deps.reloj.ahora().toISOString();
  const abiertos = (await deps.consultas.requerimientos({ estado: 'abierto' })).filter(
    (r) => r.cuposDisponibles > 0,
  );
  let encolados = 0;
  for (const req of abiertos) {
    const posiciones = await deps.motor.snapshotCola(req.claseCola, req.clienteId);
    if (posiciones.some((p) => p.elegibilidad.elegible)) continue;
    const nuevo = await deps.notificaciones.encolar(
      {
        evento: 'cola.sin_elegibles',
        destinos: [{ rol: 'admin_ops' }, { rol: 'admin_hseq' }],
        datos: {
          requerimientoId: req.id,
          clienteId: req.clienteId,
          clienteCodigo: req.cliente,
          cliente: req.clienteNombre,
          destino: req.destino,
          claseCola: req.claseCola,
          fechaServicio: req.fechaServicio,
          cuposDisponibles: req.cuposDisponibles,
          enCola: posiciones.length,
          motivos: contarMotivos(posiciones),
        },
        clave: `cola.sin_elegibles:${req.id}:${hoy}`,
      },
      ahora,
    );
    if (nuevo) encolados += 1;
  }
  return encolados;
}

/** Cuántas placas descarta cada motivo de elegibilidad (spec §7.2), sin decir cuáles. */
function contarMotivos(posiciones: readonly PosicionCola[]): Record<string, number> {
  const conteo: Record<string, number> = {};
  for (const p of posiciones) {
    const motivo = p.elegibilidad.motivo ?? 'desconocido';
    conteo[motivo] = (conteo[motivo] ?? 0) + 1;
  }
  return conteo;
}

/**
 * Una sola foto por (clase, cliente) durante una pasada: los tres avisos proactivos leen la
 * misma cola y cada snapshot recorre todas las posiciones. Dentro de la pasada nada la muta.
 */
export function memorizarSnapshots(motor: Pick<MotorCola, 'snapshotCola'>): DepsAvisos['motor'] {
  const fotos = new Map<string, Promise<PosicionCola[]>>();
  return {
    snapshotCola(claseCola: ClaseCola, clienteId?: string): Promise<PosicionCola[]> {
      const clave = `${claseCola}:${clienteId ?? ''}`;
      let foto = fotos.get(clave);
      if (!foto) {
        foto = motor.snapshotCola(claseCola, clienteId);
        fotos.set(clave, foto);
      }
      return foto;
    },
  };
}

export interface ResumenAvisos {
  porExpirar: number;
  documentos: number;
  recaudos: boolean;
  /** `cola.proximo`, `documento.bloquea_turno` y `cola.sin_elegibles` encolados en la pasada. */
  proximos: number;
  bloqueanTurno: number;
  sinElegibles: number;
}

/** Todos los jobs de una vez (disparo manual `POST /jobs/avisos` y job del minuto). */
export async function correrAvisos(deps: DepsAvisos, hoy: string): Promise<ResumenAvisos> {
  const conFoto: DepsAvisos = { ...deps, motor: memorizarSnapshots(deps.motor) };
  return {
    porExpirar: await avisarOfertasPorExpirar(deps),
    documentos: await avisarDocumentosPorVencer(deps, hoy),
    recaudos: await avisarRecaudosPendientes(deps, hoy),
    proximos: await avisarProximosEnTurno(conFoto),
    bloqueanTurno: await avisarDocumentosBloqueanTurno(conFoto, hoy),
    sinElegibles: await avisarColasSinElegibles(conFoto, hoy),
  };
}
