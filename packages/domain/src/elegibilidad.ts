import type { Parametros } from '@asotracmet/shared';
import type {
  Cliente,
  ColaPosicion,
  Documento,
  Elegibilidad,
  Habilitacion,
  Oferta,
  Tr,
  Vehiculo,
} from './tipos.js';

export interface ContextoElegibilidad {
  posicion: ColaPosicion;
  vehiculo: Vehiculo;
  cliente: Cliente | null;
  habilitacion: Habilitacion | undefined;
  documentosVencidos: Documento[];
  ofertasAbiertas: Oferta[];
  trsActivos: Tr[];
  parametros: Parametros;
  ahora: Date;
}

const OK: Elegibilidad = { elegible: true, motivo: null, detalle: null };

/** Filtros del algoritmo `siguienteElegible` (spec §7.2), en el mismo orden. Función pura. */
export function evaluarElegibilidad(ctx: ContextoElegibilidad): Elegibilidad {
  const { vehiculo, cliente, habilitacion, parametros, ahora } = ctx;

  if (vehiculo.estado !== 'activo') {
    return {
      elegible: false,
      motivo: 'VEHICULO_NO_ACTIVO',
      detalle: `${vehiculo.placa} está ${vehiculo.estado}`,
    };
  }

  if (parametros.bloquear_por_documento_vencido && ctx.documentosVencidos.length > 0) {
    const tipos = ctx.documentosVencidos.map((d) => d.tipoCodigo).join(', ');
    return {
      elegible: false,
      motivo: 'DOCUMENTO_VENCIDO',
      detalle: `${vehiculo.placa} con documento vencido: ${tipos}`,
    };
  }

  if (vehiculo.noElegibleHasta && new Date(vehiculo.noElegibleHasta) > ahora) {
    return {
      elegible: false,
      motivo: 'BLOQUEO_TEMPORAL',
      detalle: `${vehiculo.placa} bloqueada hasta ${vehiculo.noElegibleHasta}`,
    };
  }

  if (cliente?.requiereHabilitacion && habilitacion?.apto !== true) {
    return {
      elegible: false,
      motivo: 'VEHICULO_NO_HABILITADO',
      detalle: `${vehiculo.placa} no apta para ${cliente.codigo}${
        habilitacion?.motivoBloqueo ? ` (${habilitacion.motivoBloqueo})` : ''
      }`,
    };
  }

  const ofertaViva = ctx.ofertasAbiertas.find((o) => new Date(o.expiraEn) > ahora);
  if (ofertaViva) {
    return {
      elegible: false,
      motivo: 'OFERTA_ABIERTA_PREVIA',
      detalle: `${vehiculo.placa} ya tiene una oferta abierta`,
    };
  }

  if (parametros.un_tr_activo_por_placa && ctx.trsActivos.length > 0) {
    const codigos = ctx.trsActivos.map((t) => t.codigo).join(', ');
    return {
      elegible: false,
      motivo: 'TR_ACTIVO',
      detalle: `${vehiculo.placa} ocupada con ${codigos}`,
    };
  }

  if (ctx.posicion.saltosPendientes > 0) {
    return {
      elegible: false,
      motivo: 'PENALIZACION_PENDIENTE',
      detalle: `${vehiculo.placa} debe dejar pasar ${ctx.posicion.saltosPendientes} turno(s)`,
    };
  }

  return OK;
}
