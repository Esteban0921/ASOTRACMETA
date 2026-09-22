import type { EventoNotificacion } from '@asotracmet/shared';

// Plantillas con variables (spec §11). Texto plano y corto: sirve igual en la bandeja, en un
// correo y en un WhatsApp. Sin PII más allá de la placa; los datos vienen del aviso (outbox).

export interface ContextoPlantilla {
  urlWeb: string;
  timezone: string;
}

export interface Redaccion {
  asunto: string;
  texto: string;
}

type Datos = Record<string, unknown>;

const texto = (d: Datos, clave: string, porDefecto = ''): string => {
  const v = d[clave];
  return v === undefined || v === null || v === '' ? porDefecto : String(v);
};
const numero = (d: Datos, clave: string): number => Number(d[clave] ?? 0);

function hora(iso: string, timezone: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function pesos(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor);
}

/**
 * "Te tocó porque" (brief §5, acta de turno): solo cuando el motor manda `posicionElegida` y
 * `saltadas` con la oferta; un aviso viejo o de otro origen no lleva la frase.
 */
function porQueTeToco(datos: Datos, cliente: string): string {
  const { posicionElegida, saltadas } = datos;
  if (typeof posicionElegida !== 'number' || typeof saltadas !== 'number') return '';
  const para = texto(datos, 'clienteCodigo') || cliente;
  const delante =
    saltadas === 0
      ? 'nadie por delante'
      : saltadas === 1
        ? 'se saltó 1 por delante'
        : `se saltaron ${saltadas} por delante`;
  return (
    ` Te tocó porque: eras la primera placa elegible${para ? ` para ${para}` : ''}` +
    ` (posición ${posicionElegida}, ${delante}).`
  );
}

/** Frases por motivo de elegibilidad (spec §7.2) para resumir una cola sin candidata, sin placas. */
const MOTIVOS_SIN_ELEGIBLE: Readonly<Record<string, [singular: string, plural: string]>> = {
  DOCUMENTO_VENCIDO: ['con documento vencido', 'con documento vencido'],
  VEHICULO_NO_HABILITADO: ['no habilitado', 'no habilitados'],
  OFERTA_ABIERTA_PREVIA: ['con oferta abierta', 'con oferta abierta'],
  TR_ACTIVO: ['en servicio', 'en servicio'],
  BLOQUEO_TEMPORAL: ['bloqueado temporalmente', 'bloqueados temporalmente'],
  PENALIZACION_PENDIENTE: ['con penalización pendiente', 'con penalización pendiente'],
  VEHICULO_NO_ACTIVO: ['inactivo', 'inactivos'],
};

function resumenMotivos(motivos: unknown): string {
  if (!motivos || typeof motivos !== 'object') return 'cola vacía';
  const partes = Object.entries(motivos as Record<string, unknown>)
    .map(([motivo, n]) => [motivo, Number(n)] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([motivo, n]) => {
      const [singular, plural] = MOTIVOS_SIN_ELEGIBLE[motivo] ?? [motivo, motivo];
      return `${n} ${n === 1 ? singular : plural}`;
    });
  return partes.length > 0 ? partes.join(', ') : 'cola vacía';
}

export function redactar(
  evento: EventoNotificacion,
  datos: Datos,
  ctx: ContextoPlantilla,
): Redaccion {
  const placa = texto(datos, 'placa', 'tu placa');
  const cliente = texto(datos, 'cliente');
  const codigo = texto(datos, 'codigo', 'sin código');
  switch (evento) {
    case 'oferta.abierta': {
      const clase = texto(datos, 'claseCola');
      return {
        asunto: `Nuevo turno para ${placa}`,
        texto:
          `Te ofrecieron un turno${cliente ? ` de ${cliente}` : ''} para la placa ${placa}` +
          `${clase ? ` (${clase})` : ''}.${porQueTeToco(datos, cliente)}` +
          ` Tienes hasta las ${hora(texto(datos, 'expiraEn'), ctx.timezone)}` +
          ` para aceptarlo o declinarlo: ${ctx.urlWeb}/me`,
      };
    }
    case 'oferta.por_expirar':
      return {
        asunto: `El turno de ${placa} vence en ${numero(datos, 'minutos')} min`,
        texto:
          `La oferta para ${placa} vence a las ${hora(texto(datos, 'expiraEn'), ctx.timezone)}.` +
          ` Si no respondes, el turno pasa a la siguiente placa: ${ctx.urlWeb}/me`,
      };
    case 'oferta.declinada': {
      const motivo = texto(datos, 'motivo');
      const nota = texto(datos, 'nota');
      return {
        asunto: `${placa} declinó el turno`,
        texto:
          `${placa} declinó la oferta${motivo ? ` (${motivo})` : ''}${nota ? `: ${nota}` : ''}.` +
          ` La cola siguió con la siguiente placa: ${ctx.urlWeb}/ops`,
      };
    }
    case 'tr.asignado': {
      const fecha = texto(datos, 'fechaAsignacion');
      return {
        asunto: `TR ${codigo} asignado a ${placa}`,
        texto:
          `Se generó el TR ${codigo} para ${placa}${cliente ? ` con ${cliente}` : ''}` +
          `${fecha ? ` (${fecha})` : ''}. Detalle: ${ctx.urlWeb}/me`,
      };
    }
    case 'tr.cancelado': {
      const motivo = texto(datos, 'motivo');
      return {
        asunto: `TR ${codigo} cancelado`,
        texto:
          `El TR ${codigo} de ${placa} fue cancelado${motivo ? `: ${motivo}` : ''}.` +
          ` Tu posición en la cola se actualizó: ${ctx.urlWeb}/me`,
      };
    }
    case 'documento.por_vencer': {
      const tipo = texto(datos, 'tipo', 'Un documento');
      const dias = numero(datos, 'dias');
      return {
        asunto: `${tipo} de ${placa} vence en ${dias} días`,
        texto:
          `${tipo} de ${placa} vence el ${texto(datos, 'venceEn')} (${dias} días).` +
          ` Renuévalo a tiempo para seguir elegible: ${ctx.urlWeb}/hseq`,
      };
    }
    case 'recaudo.pendiente': {
      const cantidad = numero(datos, 'cantidad');
      return {
        asunto: `Recaudos pendientes: ${cantidad}`,
        texto:
          `Hay ${cantidad} recaudos pendientes por ${pesos(numero(datos, 'valor'))}` +
          ` al ${texto(datos, 'hoy')}: ${ctx.urlWeb}/finance`,
      };
    }
    case 'cola.proximo': {
      const orden = numero(datos, 'posicionElegible');
      const clase = texto(datos, 'claseCola');
      return {
        asunto: `Estás de ${orden}.º en ${clase}: alista ${placa}`,
        texto:
          `Estás de ${orden}.º: alista el vehículo. ${placa} es la ${orden}.ª placa elegible` +
          ` de ${clase} y el próximo turno puede ser tuyo. Mantente disponible: ${ctx.urlWeb}/me`,
      };
    }
    case 'documento.bloquea_turno': {
      const tipo = texto(datos, 'tipo', 'Un documento');
      const clase = texto(datos, 'claseCola');
      return {
        asunto: `${tipo} vencido: ${placa} va a perder el turno`,
        texto:
          `${placa} está de ${numero(datos, 'posicion')}.º en ${clase} con ${tipo} vencido` +
          ` desde el ${texto(datos, 'venceEn')}. Mientras no se renueve, la cola la salta.` +
          ` HSEQ: ${ctx.urlWeb}/hseq · Asociado: ${ctx.urlWeb}/me`,
      };
    }
    case 'cola.sin_elegibles': {
      const clienteCodigo = texto(datos, 'clienteCodigo') || cliente || 'Cliente';
      const destino = texto(datos, 'destino');
      const clase = texto(datos, 'claseCola');
      const cupos = numero(datos, 'cuposDisponibles');
      return {
        asunto: `Sin placas elegibles en ${clase} para ${clienteCodigo}`,
        texto:
          `${clienteCodigo}${destino ? ` · ${destino}` : ''}: ningún vehículo elegible en ${clase}` +
          ` (${resumenMotivos(datos.motivos)}). Quedan ${cupos} cupo(s) para el` +
          ` ${texto(datos, 'fechaServicio')}: ${ctx.urlWeb}/ops`,
      };
    }
  }
}
