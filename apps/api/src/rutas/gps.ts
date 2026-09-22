import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ErrorDominio,
  type Actor,
  type GeneradorIds,
  type Reloj,
  type UnidadDeTrabajo,
} from '@asotracmet/domain';
import {
  FiltroHistorialGpsSchema,
  MotivoSchema,
  GPS_TOLERANCIA_FUTURO_MINUTOS,
  LoteUbicacionesGpsSchema,
  PLACAS_DESCONOCIDAS_MAX,
  mismoProveedorGps,
  type ResultadoIngestaGps,
} from '@asotracmet/shared';
import { actorDe, exigir, exigirReauth } from '../auth/plugin.js';
import { tokenServicioValido } from '../auth/token-servicio.js';
import type { Consultas } from '../consultas/tipos.js';
import type { NuevaUbicacion, RepositorioUbicaciones } from '../gps/tipos.js';
import { vistaUbicacion } from '../gps/vistas.js';
import type { RepositorioMaestros } from '../maestros/tipos.js';
import type { RegistroMetricas } from '../observabilidad.js';
import { conContexto } from '../persistencia/contexto.js';
import { enmascara, esMember, exigirPropio, placasPropias } from './alcance.js';

// Ingesta de ubicaciones del agente satélite (ADR-0007, TASK-0062).
//
// Es la única ruta pública que escribe, y una excepción explícita a RULE-022: no hay sesión ni
// actor humano detrás, solo un token de servicio (como `/metrics`). Para que ese token no sea una
// llave maestra, la escritura corre con el contexto RLS `gps_ingesta`, que en la base solo puede
// insertar en `vehiculo_ubicaciones`: ni cola, ni ofertas, ni TR, ni documentos.

const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = 24 * 60 * MS_POR_MINUTO;

export interface DepsGps {
  ubicaciones: RepositorioUbicaciones;
  maestros: RepositorioMaestros;
  consultas: Consultas;
  uow: UnidadDeTrabajo;
  reloj: Reloj;
  ids: GeneradorIds;
  /** Tokens aceptados; vacío = ingesta apagada (responde 401). */
  tokens: readonly string[];
  rateLimitMax: number;
  metricas?: RegistroMetricas;
  /** Solo conteos: ni placas ni coordenadas ni el token (spec §12). */
  log?: (datos: Record<string, unknown>, mensaje: string) => void;
}

/** Dependencias mínimas de la purga: la comparten la ruta y el job diario de `index.ts`. */
export type DepsPurga = Pick<DepsGps, 'ubicaciones' | 'consultas' | 'reloj'>;

/**
 * Borra lo anterior a `gps_retencion_dias` conservando la última lectura de cada placa. La llaman
 * el job diario (rol `sistema`) y `POST /jobs/purgar-ubicaciones` (superadmin); las dos están en
 * la política de borrado de la tabla.
 */
export async function purgarUbicaciones(
  deps: DepsPurga,
): Promise<{ borradas: number; corte: string }> {
  const parametros = await deps.consultas.parametros();
  const corte = new Date(
    deps.reloj.ahora().getTime() - parametros.gps_retencion_dias * MS_POR_DIA,
  ).toISOString();
  return { borradas: await deps.ubicaciones.purgarAnteriores(corte), corte };
}

export function rutasGps(app: FastifyInstance, deps: DepsGps): void {
  app.post(
    '/api/v1/gps/ubicaciones',
    {
      config: { rateLimit: { max: deps.rateLimitMax, timeWindow: '1 minute' } },
      bodyLimit: 256 * 1024,
    },
    async (req, reply) => {
      if (!tokenServicioValido(req.headers.authorization, deps.tokens)) {
        throw new ErrorDominio('UNAUTHORIZED', 'Token de ingesta GPS inválido o no configurado');
      }
      const lote = LoteUbicacionesGpsSchema.parse(req.body);

      const parametros = await deps.consultas.parametros();
      const ahora = deps.reloj.ahora();
      const limiteFuturo = ahora.getTime() + GPS_TOLERANCIA_FUTURO_MINUTOS * MS_POR_MINUTO;
      const limitePasado = ahora.getTime() - parametros.gps_retencion_dias * MS_POR_DIA;
      const porPlaca = new Map(
        (await deps.maestros.vehiculos({ incluirEliminados: true })).map((v) => [v.placa, v]),
      );

      const filas: NuevaUbicacion[] = [];
      const desconocidas = new Set<string>();
      let lecturasDesconocidas = 0;
      let vehiculosInactivos = 0;
      let fueraDeRango = 0;
      let proveedorDistinto = 0;

      for (const lectura of lote.ubicaciones) {
        const vehiculo = porPlaca.get(lectura.placa);
        if (!vehiculo) {
          lecturasDesconocidas += 1;
          desconocidas.add(lectura.placa);
          continue;
        }
        // Una placa vendida, inactiva o dada de baja deja de rastrearse aunque la plataforma siga
        // reportándola: la verdad de la flota son los maestros, no el archivo de cuentas.
        if (vehiculo.estado !== 'activo' || vehiculo.eliminadoEn !== null) {
          vehiculosInactivos += 1;
          continue;
        }
        const capturada = new Date(lectura.capturadaEn).getTime();
        // Reloj del GPS desfasado o lectura más vieja que la retención: no entra.
        if (capturada > limiteFuturo || capturada < limitePasado) {
          fueraDeRango += 1;
          continue;
        }
        if (!mismoProveedorGps(vehiculo.gpsProveedor, lectura.proveedor)) proveedorDistinto += 1;
        filas.push({
          id: deps.ids.nuevo(),
          vehiculoId: vehiculo.id,
          latitud: lectura.latitud,
          longitud: lectura.longitud,
          velocidadKmh: lectura.velocidadKmh ?? null,
          rumboGrados: lectura.rumboGrados ?? null,
          capturadaEn: new Date(capturada).toISOString(),
          proveedor: lectura.proveedor,
          loteId: lote.loteId,
        });
      }

      const { guardadas, duplicadas } = await conContexto(
        { rol: 'gps_ingesta', vehiculoIds: [] },
        () => deps.ubicaciones.guardarLote(filas, ahora.toISOString()),
      );

      const resultado: ResultadoIngestaGps = {
        loteId: lote.loteId,
        recibidas: lote.ubicaciones.length,
        guardadas,
        duplicadas,
        ignoradas: lecturasDesconocidas + vehiculosInactivos + fueraDeRango,
        vehiculosInactivos,
        proveedorDistinto,
        placasDesconocidas: [...desconocidas].slice(0, PLACAS_DESCONOCIDAS_MAX),
        intervaloMinutos: parametros.gps_intervalo_minutos,
      };
      deps.metricas?.gpsLote({
        guardadas: resultado.guardadas,
        duplicadas: resultado.duplicadas,
        ignoradas: resultado.ignoradas,
      });
      deps.log?.(
        {
          loteId: resultado.loteId,
          cuentaId: lote.cuentaId,
          recibidas: resultado.recibidas,
          guardadas,
          duplicadas,
          ignoradas: resultado.ignoradas,
          proveedorDistinto,
        },
        'gps ingesta',
      );
      return reply.send(resultado);
    },
  );

  /**
   * Última ubicación de cada placa que haya reportado. El asociado solo ve las suyas (scope `own`
   * más RLS en la base); el veedor las recibe enmascaradas, sin coordenadas. Se registra antes que
   * ninguna ruta con `:id`, aunque hoy no haya un `GET /vehiculos/:id` con el que pudiera chocar.
   */
  app.get(
    '/api/v1/vehiculos/ubicaciones',
    { preHandler: exigir('vehiculos', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      const [parametros, vehiculos] = await Promise.all([
        deps.consultas.parametros(),
        deps.maestros.vehiculos({ incluirEliminados: true }),
      ]);
      const placas = new Map(vehiculos.map((v) => [v.id, v.placa]));
      const registros = await deps.ubicaciones.ultimas(
        esMember(actor) ? [...placasPropias(actor)] : undefined,
      );
      const ahora = deps.reloj.ahora();
      const oculta = enmascara(actor, 'vehiculos');
      return reply.send(
        registros
          .filter((r) => placas.has(r.vehiculoId))
          .map((r) => vistaUbicacion(r, placas.get(r.vehiculoId)!, ahora, parametros, oculta))
          .sort((a, b) => a.placa.localeCompare(b.placa)),
      );
    },
  );

  /**
   * Recorrido de una placa (el mapa, TASK-0066). Por defecto las últimas 24 horas.
   *
   * El veedor queda fuera a propósito y hace falta comprobarlo a mano: `exigir('vehiculos','R')`
   * lo deja pasar porque su concesión es `R*`, y enmascarar un recorrido entero no tendría
   * sentido (sin coordenadas no hay línea que pintar). Su función es la equidad de la cola, no
   * seguir camiones (criterio §20.11).
   */
  app.get(
    '/api/v1/vehiculos/:id/ubicaciones',
    { preHandler: exigir('vehiculos', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const actor = actorDe(req);
      if (enmascara(actor, 'vehiculos')) {
        throw new ErrorDominio('FORBIDDEN', 'Tu rol no accede al recorrido de un vehículo');
      }
      exigirPropio(actor, id);
      const filtro = FiltroHistorialGpsSchema.parse(req.query);
      const vehiculo = await deps.maestros.vehiculo(id);
      if (!vehiculo) throw new ErrorDominio('NOT_FOUND', 'Vehículo no existe');

      const ahora = deps.reloj.ahora();
      const parametros = await deps.consultas.parametros();
      const registros = await deps.ubicaciones.historial(id, {
        desde: filtro.desde ?? new Date(ahora.getTime() - 24 * 60 * 60_000).toISOString(),
        hasta: filtro.hasta,
        limite: filtro.limite,
      });
      return reply.send(
        registros.map((r) => vistaUbicacion(r, vehiculo.placa, ahora, parametros, false)),
      );
    },
  );

  /**
   * Supresión del historial de una placa (habeas data, Ley 1581 de 2012; TASK-0069). Es lo que se
   * hace cuando un propietario retira su autorización: se borra todo lo suyo, con motivo, con
   * re-autenticación y dejando rastro de quién lo hizo. El borrado corre con el rol de servicio
   * (ADR-0005), como el resto de las escrituras; quién puede pedirlo lo decide el RBAC.
   */
  app.delete(
    '/api/v1/vehiculos/:id/ubicaciones',
    { preHandler: [exigir('vehiculos', 'D'), exigirReauth(deps.reloj)] },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const { motivo } = MotivoSchema.parse(req.body);
      const actor = actorDe(req);
      const vehiculo = await deps.maestros.vehiculo(id);
      if (!vehiculo) throw new ErrorDominio('NOT_FOUND', 'Vehículo no existe');

      const borradas = await conContexto({ rol: 'sistema', vehiculoIds: [] }, () =>
        deps.ubicaciones.suprimirDeVehiculo(id),
      );
      await deps.uow.ejecutar(null, (tx) =>
        tx.auditar({
          actorId: actor.id,
          actorRol: actor.rol,
          accion: 'gps.suprimir',
          entidad: 'vehiculos',
          entidadId: id,
          before: null,
          after: { placa: vehiculo.placa, borradas, motivo },
        }),
      );
      return reply.send({ borradas });
    },
  );

  // Disparo manual de la purga (el job diario hace lo mismo). Auditado: borrar es una decisión.
  app.post(
    '/api/v1/jobs/purgar-ubicaciones',
    { preHandler: exigir('cola', 'U') },
    async (req, reply) => {
      const actor: Actor = actorDe(req);
      const { borradas, corte } = await purgarUbicaciones(deps);
      await deps.uow.ejecutar(null, (tx) =>
        tx.auditar({
          actorId: actor.id,
          actorRol: actor.rol,
          accion: 'gps.purgar',
          entidad: 'vehiculos',
          entidadId: corte,
          before: null,
          after: { borradas, corte },
        }),
      );
      return reply.send({ borradas, corte });
    },
  );
}
