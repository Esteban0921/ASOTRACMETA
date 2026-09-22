import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ErrorDominio, type Actor, type Reloj, type UnidadDeTrabajo } from '@asotracmet/domain';
import { MesSchema, enmascararDocumento, veEnmascarado } from '@asotracmet/shared';
import { actorDe, exigir, sesionDe } from '../auth/plugin.js';
import type { Consultas } from '../consultas/tipos.js';
import type { RepositorioMaestros } from '../maestros/tipos.js';
import { nombreAsociado } from '../maestros/vistas.js';
import type { RepositorioViajes } from '../viajes/tipos.js';

import type { RepositorioUbicaciones } from '../gps/tipos.js';

export interface DepsExport {
  /** Resumen de ubicaciones para el extracto de habeas data (TASK-0069). */
  ubicaciones: RepositorioUbicaciones;
  consultas: Consultas;
  viajes: RepositorioViajes;
  maestros: RepositorioMaestros;
  uow: UnidadDeTrabajo;
  reloj: Reloj;
}

/** Celda CSV (RFC 4180): comillas dobladas y campo entrecomillado si hace falta. */
export function celdaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = typeof valor === 'number' ? String(valor) : String(valor);
  return /[",\n\r;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function aCsv(cabeceras: readonly string[], filas: readonly unknown[][]): string {
  return [cabeceras, ...filas].map((f) => f.map(celdaCsv).join(',')).join('\r\n');
}

/** Marca de agua (spec §12): quién exportó y cuándo, en la primera línea del archivo. */
export function marcaDeAgua(email: string, rol: string, instante: string): string {
  return `# ASOTRACMET · exportado por ${email} (${rol}) el ${instante} · uso interno, no redistribuir`;
}

/** Textos de habeas data (Ley 1581 de 2012): propósito, acceso y cancelación. */
export const HABEAS_DATA = {
  proposito:
    'ASOTRACMET trata tus datos (identificación, contacto, placas, documentos de la flota, turnos, TR, viajes, recaudos y la ubicación GPS del vehículo) con el único fin de administrar el enturnamiento gremial, la asignación de servicios y el recaudo del aporte sobre el flete. La ubicación se toma de la plataforma de rastreo que contrató el propietario, se refresca cada pocos minutos y se conserva un tiempo limitado que fija el parámetro de retención; pasado ese plazo se borra sola, salvo la última posición conocida de cada placa.',
  acceso:
    'Puedes consultar en cualquier momento tu posición en la cola, tus ofertas, tus TR, tus viajes y tus documentos desde "Mi turno", y pedir este extracto. Cada extracto queda registrado en la auditoría.',
  cancelacion:
    'Puedes pedir la corrección o supresión de tus datos, incluido el historial de ubicaciones de tus placas, escribiendo a la coordinación de ASOTRACMET; los registros de TR y recaudo ya cumplidos se conservan el tiempo que exige la ley y los estatutos de la asociación, anonimizando lo demás.',
} as const;

const CABECERAS = [
  'tr',
  'placa',
  'asociado',
  'documento',
  'cliente',
  'destino',
  'lugar_descargue',
  'fecha_cargue',
  'fecha_descargue',
  'transportadora',
  'flete',
  'porcentaje',
  'recaudo',
  'pagado',
  'estado',
] as const;

/** Export CSV por rol con watermark (spec §8.5, §12; TASK-0034) y extracto habeas data (§12; TASK-0036). */
export function rutasExport(app: FastifyInstance, deps: DepsExport): void {
  const { consultas, viajes, maestros, uow, reloj } = deps;

  const auditar = (
    actor: Actor,
    accion: string,
    entidad: string,
    entidadId: string,
    after: unknown,
  ) =>
    uow.ejecutar(null, (tx) =>
      tx.auditar({
        actorId: actor.id,
        actorRol: actor.rol,
        accion,
        entidad,
        entidadId,
        before: null,
        after,
      }),
    );

  app.get(
    '/api/v1/export/viajes.csv',
    { preHandler: exigir('export', 'A', { permitirOwn: true }) },
    async (req, reply) => {
      const { mes } = z.object({ mes: MesSchema }).parse(req.query);
      const actor = actorDe(req);
      const { usuario } = sesionDe(req);
      const enmascarar = veEnmascarado(actor.rol, 'export');
      const lista = await viajes.viajes({
        mes,
        vehiculoIds: actor.rol === 'member' ? (actor.vehiculoIds ?? []) : undefined,
      });
      const filas = lista.map((v) => [
        v.trCodigo,
        v.placa,
        v.asociadoNombre,
        // Viewer sin PII (spec §3.2): la cédula va enmascarada; el resto la ve completa.
        enmascarar ? enmascararDocumento(v.asociadoDocumento) : v.asociadoDocumento,
        v.cliente,
        v.destino,
        v.lugarDescargue,
        v.fechaCargue,
        v.fechaDescargue,
        v.transportadora,
        v.flete,
        v.porcentajeAplicado,
        v.valorRecaudo,
        v.valorPagado,
        v.estado,
      ]);
      const instante = reloj.ahora().toISOString();
      const cuerpo = `${marcaDeAgua(usuario.email, actor.rol, instante)}\r\n${aCsv(CABECERAS, filas)}\r\n`;
      await auditar(actor, 'export.viajes', 'export', mes, {
        filas: filas.length,
        enmascarado: enmascarar,
      });
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="viajes-${mes}.csv"`)
        .send(cuerpo);
    },
  );

  // Habeas data: el asociado pide el extracto de sus TR, viajes y recaudos (spec §12).
  app.get(
    '/api/v1/me/extracto',
    { preHandler: exigir('trs', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      const { usuario } = sesionDe(req);
      if (actor.rol !== 'member' || !usuario.asociadoId) {
        throw new ErrorDominio('FORBIDDEN', 'El extracto es del asociado sobre sus propios datos');
      }
      const placas = actor.vehiculoIds ?? [];
      const asociado = await maestros.asociado(usuario.asociadoId);
      const vehiculos = (await maestros.vehiculos()).filter((v) => placas.includes(v.id));
      const [trs, misViajes, recaudos] = await Promise.all([
        consultas.trs({ vehiculoIds: placas }),
        viajes.viajes({ vehiculoIds: placas }),
        viajes.recaudos({ vehiculoIds: placas }),
      ]);
      const extracto = {
        generadoEn: reloj.ahora().toISOString(),
        asociado: asociado
          ? {
              nombre: nombreAsociado(asociado),
              documento: asociado.documento,
              correo: asociado.correo,
              celular: asociado.celular,
              fechaAfiliacion: asociado.fechaAfiliacion,
            }
          : null,
        placas: vehiculos.map((v) => ({ placa: v.placa, clase: v.clase, estado: v.estado })),
        trs: trs.map((t) => ({
          codigo: t.codigo,
          placa: t.placa,
          cliente: t.cliente,
          destino: t.destino,
          fechaAsignacion: t.fechaAsignacion,
          estado: t.estado,
        })),
        viajes: misViajes.map((v) => ({
          tr: v.trCodigo,
          placa: v.placa,
          fechaCargue: v.fechaCargue,
          lugarDescargue: v.lugarDescargue ?? v.destino,
          flete: v.flete,
          porcentajeAplicado: v.porcentajeAplicado,
          valorRecaudo: v.valorRecaudo,
          valorPagado: v.valorPagado,
          estado: v.estado,
        })),
        recaudos: recaudos.map((r) => ({
          tr: r.trCodigo,
          valor: r.valor,
          estado: r.estado,
          fechaPago: r.fechaPago,
          referencia: r.referencia,
        })),
        // Habeas data (TASK-0069): qué se guarda de la ubicación de sus placas y desde cuándo.
        ubicaciones: (await deps.ubicaciones.resumenPorVehiculo(vehiculos.map((v) => v.id))).map(
          (r) => ({
            placa: vehiculos.find((v) => v.id === r.vehiculoId)?.placa ?? null,
            puntos: r.puntos,
            desde: r.desde,
            hasta: r.hasta,
          }),
        ),
        habeasData: HABEAS_DATA,
      };
      await auditar(actor, 'habeas.extracto', 'asociados', usuario.asociadoId, {
        trs: trs.length,
        viajes: misViajes.length,
        recaudos: recaudos.length,
      });
      return reply.send(extracto);
    },
  );
}
