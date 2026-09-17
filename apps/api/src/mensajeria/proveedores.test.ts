import { describe, expect, it } from 'vitest';
import {
  MensajeriaEnrutada,
  MensajeriaSmtp,
  MensajeriaWhatsApp,
  mensajeriaDeConfig,
} from './proveedores.js';

// Canales reales (TASK-0026): SMTP y WhatsApp Cloud API con transportes de mentira.

describe('proveedores de mensajería', () => {
  it('SMTP: from/to/subject/text por el transporte; solo correo', async () => {
    const enviados: unknown[] = [];
    const smtp = new MensajeriaSmtp(
      {
        sendMail: async (c) => {
          enviados.push(c);
        },
      },
      'ASOTRACMET <turnos@asotracmet.co>',
    );
    await smtp.enviar({ canal: 'correo', para: 'a@b.co', asunto: 'Hola', texto: 'Cuerpo' });
    expect(enviados).toEqual([
      { from: 'ASOTRACMET <turnos@asotracmet.co>', to: 'a@b.co', subject: 'Hola', text: 'Cuerpo' },
    ]);
    await expect(
      smtp.enviar({ canal: 'celular', para: '+573001234567', asunto: 'x', texto: 'y' }),
    ).rejects.toThrow(/solo envía correo/);
  });

  it('WhatsApp Cloud API: POST al phoneId con el token y el texto; un error HTTP se propaga', async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    const wa = new MensajeriaWhatsApp({
      token: 'token-meta',
      phoneId: '123456',
      fetch: (async (url: string, init: RequestInit) => {
        llamadas.push({ url, init });
        return new Response('{"messages":[{"id":"wamid"}]}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    await wa.enviar({
      canal: 'celular',
      para: '+57 300 123 4567',
      asunto: 'Asunto',
      texto: 'Texto',
    });
    expect(llamadas[0]?.url).toBe('https://graph.facebook.com/v20.0/123456/messages');
    const cabeceras = llamadas[0]?.init.headers as Record<string, string>;
    expect(cabeceras.authorization).toBe('Bearer token-meta');
    expect(JSON.parse(String(llamadas[0]?.init.body))).toMatchObject({
      messaging_product: 'whatsapp',
      to: '573001234567',
      type: 'text',
      text: { body: 'Asunto\nTexto' },
    });

    const roto = new MensajeriaWhatsApp({
      token: 't',
      phoneId: '1',
      fetch: (async () =>
        new Response('token vencido', { status: 401 })) as unknown as typeof fetch,
    });
    await expect(
      roto.enviar({ canal: 'celular', para: '+573001234567', asunto: 'a', texto: 'b' }),
    ).rejects.toThrow(/401: token vencido/);
    await expect(
      roto.enviar({ canal: 'correo', para: 'a@b.co', asunto: 'a', texto: 'b' }),
    ).rejects.toThrow(/solo envía a celular/);
  });

  it('enrutada: cada canal a su proveedor; sin configuración todo sale por consola', async () => {
    const lineas: string[] = [];
    const porDefecto = mensajeriaDeConfig(
      { smtpUrl: null, smtpFrom: 'x', whatsappToken: null, whatsappPhoneId: null },
      (l) => lineas.push(l),
    );
    await porDefecto.enviar({ canal: 'correo', para: 'a@b.co', asunto: 'A', texto: 'B' });
    await porDefecto.enviar({ canal: 'celular', para: '+573001234567', asunto: 'C', texto: 'D' });
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toContain('correo -> a@b.co');
    expect(lineas[1]).toContain('celular -> +573001234567');

    const correos: string[] = [];
    const celulares: string[] = [];
    const enrutada = new MensajeriaEnrutada({
      correo: {
        enviar: async (m) => {
          correos.push(m.para);
        },
      },
      celular: {
        enviar: async (m) => {
          celulares.push(m.para);
        },
      },
    });
    await enrutada.enviar({ canal: 'celular', para: '+573001234567', asunto: 'a', texto: 'b' });
    await enrutada.enviar({ canal: 'correo', para: 'a@b.co', asunto: 'a', texto: 'b' });
    expect(correos).toEqual(['a@b.co']);
    expect(celulares).toEqual(['+573001234567']);

    // Con SMTP_URL se construye el transporte real (no se envía nada aquí).
    expect(
      mensajeriaDeConfig(
        {
          smtpUrl: 'smtp://usuario:clave@localhost:2525',
          smtpFrom: 'x',
          whatsappToken: 't',
          whatsappPhoneId: '1',
        },
        () => undefined,
      ),
    ).toBeInstanceOf(MensajeriaEnrutada);
  });
});
