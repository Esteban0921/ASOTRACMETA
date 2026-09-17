// Puerto de envío de mensajes de acceso (códigos y enlaces). Spec §11: WhatsApp/SMS/email son
// canales, no estado. Proveedores reales (SMTP, WhatsApp Cloud API) llegan en TASK-0026.

export interface Mensaje {
  canal: 'correo' | 'celular';
  para: string;
  asunto: string;
  texto: string;
  /** Datos estructurados para que e2e y tests no tengan que parsear el texto. */
  codigo?: string;
  enlace?: string;
  enviadoEn: string;
}

export interface Mensajeria {
  enviar(mensaje: Omit<Mensaje, 'enviadoEn'>): Promise<void>;
}

/** Guarda los mensajes en memoria: tests, modo e2e. */
export class MensajeriaMemoria implements Mensajeria {
  readonly mensajes: Mensaje[] = [];

  constructor(private readonly reloj: { ahora(): Date } = { ahora: () => new Date() }) {}

  async enviar(mensaje: Omit<Mensaje, 'enviadoEn'>): Promise<void> {
    this.mensajes.push({ ...mensaje, enviadoEn: this.reloj.ahora().toISOString() });
  }

  /** Último mensaje para alguien; `con` exige que traiga enlace o código (los avisos no lo traen). */
  ultimoPara(para: string, con?: 'enlace' | 'codigo'): Mensaje | undefined {
    const normalizado = para.trim().toLowerCase();
    return [...this.mensajes]
      .reverse()
      .find((m) => m.para.toLowerCase() === normalizado && (!con || m[con] !== undefined));
  }

  limpiar(): void {
    this.mensajes.length = 0;
  }
}

/** Desarrollo sin SMTP: el código o el enlace salen por el log de la API. Nunca en producción. */
export class MensajeriaConsola implements Mensajeria {
  constructor(private readonly escribir: (linea: string) => void) {}

  async enviar(mensaje: Omit<Mensaje, 'enviadoEn'>): Promise<void> {
    const detalle = mensaje.codigo
      ? `código ${mensaje.codigo}`
      : mensaje.enlace
        ? `enlace ${mensaje.enlace}`
        : mensaje.texto;
    this.escribir(
      `[mensajeria] ${mensaje.canal} -> ${mensaje.para} · ${mensaje.asunto} · ${detalle}`,
    );
  }
}
