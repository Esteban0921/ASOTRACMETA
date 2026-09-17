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
          `${clase ? ` (${clase})` : ''}. Tienes hasta las ${hora(texto(datos, 'expiraEn'), ctx.timezone)}` +
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
  }
}
