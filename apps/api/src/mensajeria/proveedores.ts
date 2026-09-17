import { createTransport } from 'nodemailer';
import { MensajeriaConsola, type Mensaje, type Mensajeria } from '../auth/mensajeria.js';

// Canales reales (spec §11, TASK-0026): SMTP para correo y WhatsApp Cloud API para celular.
// Cada uno es un `Mensajeria` de un solo canal; `MensajeriaEnrutada` elige por `mensaje.canal`.
// Sin SMTP_URL o sin WHATSAPP_TOKEN el canal cae a la consola (desarrollo), nunca a un error.

type Saliente = Omit<Mensaje, 'enviadoEn'>;

export interface TransporteCorreo {
  sendMail(correo: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

export class MensajeriaSmtp implements Mensajeria {
  constructor(
    private readonly transporte: TransporteCorreo,
    private readonly remitente: string,
  ) {}

  async enviar(mensaje: Saliente): Promise<void> {
    if (mensaje.canal !== 'correo') throw new Error('MensajeriaSmtp solo envía correo');
    await this.transporte.sendMail({
      from: this.remitente,
      to: mensaje.para,
      subject: mensaje.asunto,
      text: mensaje.texto,
    });
  }
}

/** `smtp://usuario:clave@host:587` o `smtps://...:465` (formato de nodemailer). */
export function transporteSmtp(url: string): TransporteCorreo {
  return createTransport(url);
}

export interface OpcionesWhatsApp {
  token: string;
  phoneId: string;
  fetch?: typeof fetch;
  base?: string;
}

/**
 * WhatsApp Cloud API (Meta): texto libre. Fuera de la ventana de 24 h de una conversación abierta
 * Meta exige plantillas aprobadas; ese caso queda documentado en despliegue.md.
 */
export class MensajeriaWhatsApp implements Mensajeria {
  private readonly llamar: typeof fetch;
  private readonly base: string;

  constructor(private readonly opciones: OpcionesWhatsApp) {
    this.llamar = opciones.fetch ?? fetch;
    this.base = (opciones.base ?? 'https://graph.facebook.com/v20.0').replace(/\/$/, '');
  }

  async enviar(mensaje: Saliente): Promise<void> {
    if (mensaje.canal !== 'celular') throw new Error('MensajeriaWhatsApp solo envía a celular');
    const res = await this.llamar(`${this.base}/${this.opciones.phoneId}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.opciones.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: mensaje.para.replace(/\D/g, ''),
        type: 'text',
        text: { body: `${mensaje.asunto}\n${mensaje.texto}` },
      }),
    });
    if (!res.ok) {
      const cuerpo = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`WhatsApp respondió ${res.status}${cuerpo ? `: ${cuerpo}` : ''}`);
    }
  }
}

export class MensajeriaEnrutada implements Mensajeria {
  constructor(private readonly canales: { correo: Mensajeria; celular: Mensajeria }) {}

  enviar(mensaje: Saliente): Promise<void> {
    return this.canales[mensaje.canal].enviar(mensaje);
  }
}

export interface ConfigMensajeria {
  smtpUrl: string | null;
  smtpFrom: string;
  whatsappToken: string | null;
  whatsappPhoneId: string | null;
}

/** Proveedores según entorno; lo que no esté configurado sale por el log (desarrollo). */
export function mensajeriaDeConfig(
  config: ConfigMensajeria,
  escribir: (linea: string) => void,
): Mensajeria {
  const consola = new MensajeriaConsola(escribir);
  return new MensajeriaEnrutada({
    correo: config.smtpUrl
      ? new MensajeriaSmtp(transporteSmtp(config.smtpUrl), config.smtpFrom)
      : consola,
    celular:
      config.whatsappToken && config.whatsappPhoneId
        ? new MensajeriaWhatsApp({ token: config.whatsappToken, phoneId: config.whatsappPhoneId })
        : consola,
  });
}
