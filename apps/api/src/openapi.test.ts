import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
import { IdsSecuenciales, RelojFijo } from '@asotracmet/domain';
import {
  AlertaDocumentoSchema,
  ClienteSchema,
  DetalleViajeSchema,
  EventoAuditoriaSchema,
  IntervencionSchema,
  MeSchema,
  MiPosicionSchema,
  MotivoDeclinacionSchema,
  NotificacionSchema,
  ParametrosSchema,
  PreferenciasNotificacionSchema,
  RespuestaLoginSchema,
  SemaforoPlacaSchema,
  SesionSchema,
  TableroSchema,
  TipoDocumentoSchema,
  TransportadoraSchema,
  UsuarioSesionSchema,
  VistaAsociadoSchema,
  VistaColaSchema,
  VistaDocumentoSchema,
  VistaFichaSchema,
  VistaOfertaSchema,
  VistaRequerimientoSchema,
  VistaResumenMesSchema,
  VistaTrSchema,
  VistaVehiculoSchema,
} from '@asotracmet/shared';
import { construirApp, type AppConstruida } from './app.js';
import { MensajeriaMemoria } from './auth/mensajeria.js';
import { codigoTotp } from './auth/totp.js';
import { CONTRATO } from './openapi/contrato.js';
import { construirOpenApi, refsColgantes, rutaOpenApi } from './openapi/documento.js';
import { PASSWORD_DEV, secretoTotpSemilla } from './seed.js';

// Contrato OpenAPI (TASK-0033): cada ruta registrada está documentada y viceversa; el documento
// es 3.1 sin referencias colgantes; y las respuestas reales cumplen las vistas compartidas con la
// web (packages/shared/src/vistas.ts), que es lo que hace del contrato algo más que un dibujo.

const INICIO = '2026-09-16T13:00:00Z';
const METODOS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

let app: FastifyInstance;
let construida: AppConstruida;
let reloj: RelojFijo;
let mensajeria: MensajeriaMemoria;
const tokens: Record<string, string> = {};
let ofertaId = '';
let viajeId = '';

const conToken = (email: string) => ({ authorization: `Bearer ${tokens[email]!}` });

async function login(email: string): Promise<string> {
  if (email.startsWith('member.')) {
    await app.inject({ method: 'POST', url: '/api/v1/auth/magic-link', payload: { email } });
    const enlace = mensajeria.ultimoPara(email, 'enlace')?.enlace;
    const token = new URL(enlace!).searchParams.get('token');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link/canjear',
      payload: { token },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(SesionSchema.safeParse(res.json()).success).toBe(true);
    return (res.json() as { token: string }).token;
  }
  reloj.fijar(new Date(reloj.ahora().getTime() + 30_000).toISOString());
  const primero = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD_DEV },
  });
  const paso = RespuestaLoginSchema.parse(primero.json());
  expect(paso.paso === 'totp' || paso.paso === 'totp_enrolar').toBe(true);
  const reto = primero.json() as { paso: string; challenge: string; secret?: string };
  const secreto = reto.paso === 'totp_enrolar' ? reto.secret! : secretoTotpSemilla(email);
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/2fa/verify',
    payload: { challenge: reto.challenge, codigo: codigoTotp(secreto, reloj.ahora()) },
  });
  expect(res.statusCode, res.body).toBe(200);
  return SesionSchema.parse(res.json()).token;
}

beforeAll(async () => {
  reloj = new RelojFijo(INICIO);
  mensajeria = new MensajeriaMemoria(reloj);
  construida = await construirApp({
    config: { logger: false, modoE2e: true, loginRateLimitMax: 10_000 },
    reloj,
    ids: new IdsSecuenciales('openapi'),
    mensajeria,
  });
  app = construida.app;
  await app.ready();
  for (const email of [
    'superadmin@asotracmet.test',
    'ops@asotracmet.test',
    'finance@asotracmet.test',
    'member.fst189@asotracmet.test',
  ]) {
    tokens[email] = await login(email);
  }
  // Datos para las respuestas: una oferta aceptada → TR → viaje liquidado, y un aviso entregado.
  const ofrecida = await app.inject({
    method: 'POST',
    url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
    headers: conToken('ops@asotracmet.test'),
  });
  expect(ofrecida.statusCode, ofrecida.body).toBe(201);
  ofertaId = (ofrecida.json() as { id: string }).id;
  await construida.worker.procesar();
  const aceptada = await app.inject({
    method: 'POST',
    url: `/api/v1/ofertas/${ofertaId}/aceptar`,
    headers: conToken('member.fst189@asotracmet.test'),
  });
  expect(aceptada.statusCode, aceptada.body).toBe(200);
  const trId = (aceptada.json() as { tr: { id: string } }).tr.id;
  const viaje = await app.inject({
    method: 'POST',
    url: '/api/v1/viajes',
    headers: conToken('finance@asotracmet.test'),
    payload: { trId },
  });
  expect(viaje.statusCode, viaje.body).toBe(201);
  viajeId = (viaje.json() as { id: string }).id;
  const liquidado = await app.inject({
    method: 'POST',
    url: `/api/v1/viajes/${viajeId}/liquidar`,
    headers: conToken('finance@asotracmet.test'),
    payload: { flete: 850_000 },
  });
  expect(liquidado.statusCode, liquidado.body).toBe(200);
  await construida.worker.procesar();
  // Una intervención (override) para que `/colas/:clase/intervenciones` tenga filas.
  reloj.fijar(new Date(reloj.ahora().getTime() + 30_000).toISOString());
  const reauth = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/reauth',
    headers: conToken('superadmin@asotracmet.test'),
    payload: {
      codigo: codigoTotp(secretoTotpSemilla('superadmin@asotracmet.test'), reloj.ahora()),
    },
  });
  expect(reauth.statusCode, reauth.body).toBe(200);
  const override = await app.inject({
    method: 'POST',
    url: '/api/v1/colas/TM-CBZ/override',
    headers: conToken('superadmin@asotracmet.test'),
    payload: { vehiculoId: 'veh-SUL470', posicion: 1, motivo: 'Acuerdo de asamblea' },
  });
  expect(override.statusCode, override.body).toBe(200);
  const intervenida = VistaColaSchema.pick({ claseCola: true, total: true, posiciones: true });
  const cola = intervenida.safeParse(override.json());
  expect(cola.success, JSON.stringify(cola.error?.issues)).toBe(true);
});

afterAll(async () => {
  await app.close();
});

describe('contrato OpenAPI', () => {
  it('cada ruta registrada en Fastify está en el contrato y viceversa', () => {
    const reales = new Set(
      construida.rutasRegistradas
        .filter((r) => METODOS.has(r.metodo) && !r.ruta.startsWith('/api/v1/__e2e'))
        .filter(
          (r) => r.ruta.startsWith('/api/') || ['/healthz', '/readyz', '/metrics'].includes(r.ruta),
        )
        .map((r) => `${r.metodo} ${r.ruta}`),
    );
    const documentadas = new Set(CONTRATO.map((e) => `${e.metodo.toUpperCase()} ${e.ruta}`));
    expect(
      [...reales].filter((r) => !documentadas.has(r)),
      'rutas sin documentar',
    ).toEqual([]);
    expect(
      [...documentadas].filter((r) => !reales.has(r)),
      'documentadas inexistentes',
    ).toEqual([]);
    expect(CONTRATO.length).toBe(documentadas.size);
  });

  it('GET /api/v1/openapi.json es público, OpenAPI 3.1, con cuerpos y respuestas como componentes y sin $ref colgantes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json() as {
      openapi: string;
      paths: Record<
        string,
        Record<
          string,
          {
            requestBody?: unknown;
            responses: Record<string, unknown>;
            parameters?: Array<{ name: string; in: string; required: boolean }>;
            security: unknown[];
            'x-guard': string;
          }
        >
      >;
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(refsColgantes(doc)).toEqual([]);
    const operaciones = Object.values(doc.paths).flatMap((p) => Object.keys(p)).length;
    expect(operaciones).toBe(CONTRATO.length);

    const crearViaje = doc.paths['/api/v1/viajes']!.post!;
    expect(crearViaje.requestBody).toEqual({
      required: true,
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/CrearViaje' } },
      },
    });
    expect(crearViaje.responses['201']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/DetalleViaje' } } },
    });
    expect(crearViaje.responses.default).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorApi' } } },
    });
    expect(crearViaje['x-guard']).toBe('viajes C');
    expect(doc.components.schemas.CrearViaje).toMatchObject({
      type: 'object',
      required: ['trId'],
    });

    const cola = doc.paths['/api/v1/colas/{clase}']!.get!;
    expect(cola.parameters).toEqual(
      expect.arrayContaining([
        { name: 'clase', in: 'path', required: true, schema: { type: 'string' } },
        expect.objectContaining({ name: 'clienteId', in: 'query', required: false }),
      ]),
    );
    expect(doc.paths['/api/v1/auth/login']!.post!.security).toEqual([]);
    expect(doc.paths['/api/v1/me']!.get!.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.paths['/api/v1/colas/{clase}/reset']!.post).toMatchObject({ 'x-reauth': true });
    expect(rutaOpenApi('/api/v1/vehiculos/:id/habilitaciones/:clienteId')).toEqual({
      ruta: '/api/v1/vehiculos/{id}/habilitaciones/{clienteId}',
      parametros: ['id', 'clienteId'],
    });
    // El documento que sirve la API es el mismo que genera `pnpm build:contrato`.
    expect(doc).toEqual(
      construirOpenApi(CONTRATO, {
        version: (doc as unknown as { info: { version: string } }).info.version,
      }),
    );
  });

  const casos: Array<[string, string, ZodType]> = [
    ['/api/v1/me', 'superadmin@asotracmet.test', MeSchema],
    ['/api/v1/clientes', 'ops@asotracmet.test', ClienteSchema.array()],
    ['/api/v1/motivos-declinacion', 'ops@asotracmet.test', MotivoDeclinacionSchema.array()],
    ['/api/v1/vehiculos', 'ops@asotracmet.test', VistaVehiculoSchema.array()],
    ['/api/v1/parametros', 'superadmin@asotracmet.test', ParametrosSchema],
    ['/api/v1/audit', 'superadmin@asotracmet.test', EventoAuditoriaSchema.array()],
    ['/api/v1/asociados', 'superadmin@asotracmet.test', VistaAsociadoSchema.array()],
    ['/api/v1/vehiculos/semaforo', 'superadmin@asotracmet.test', SemaforoPlacaSchema.array()],
    ['/api/v1/vehiculos/veh-FST189/ficha', 'superadmin@asotracmet.test', VistaFichaSchema],
    ['/api/v1/transportadoras', 'finance@asotracmet.test', TransportadoraSchema.array()],
    ['/api/v1/tipos-documento', 'superadmin@asotracmet.test', TipoDocumentoSchema.array()],
    ['/api/v1/documentos', 'superadmin@asotracmet.test', VistaDocumentoSchema.array()],
    ['/api/v1/documentos/alertas', 'superadmin@asotracmet.test', AlertaDocumentoSchema.array()],
    ['/api/v1/colas/TM-CBZ', 'ops@asotracmet.test', VistaColaSchema],
    ['/api/v1/colas/TM-CBZ/intervenciones', 'ops@asotracmet.test', IntervencionSchema.array()],
    ['/api/v1/requerimientos', 'ops@asotracmet.test', VistaRequerimientoSchema.array()],
    ['/api/v1/ofertas', 'ops@asotracmet.test', VistaOfertaSchema.array()],
    ['/api/v1/trs', 'ops@asotracmet.test', VistaTrSchema.array()],
    ['/api/v1/me/cola', 'member.fst189@asotracmet.test', MiPosicionSchema.array()],
    ['/api/v1/me/ofertas', 'member.fst189@asotracmet.test', VistaOfertaSchema.array()],
    ['/api/v1/me/trs', 'member.fst189@asotracmet.test', VistaTrSchema.array()],
    ['/api/v1/viajes/resumen?mes=2026-09', 'finance@asotracmet.test', VistaResumenMesSchema],
    ['/api/v1/tablero?mes=2026-09', 'superadmin@asotracmet.test', TableroSchema],
    ['/api/v1/usuarios', 'superadmin@asotracmet.test', UsuarioSesionSchema.array()],
    ['/api/v1/me/notificaciones', 'member.fst189@asotracmet.test', NotificacionSchema.array()],
    ['/api/v1/me/preferencias', 'member.fst189@asotracmet.test', PreferenciasNotificacionSchema],
  ];

  it.each(casos)(
    'la respuesta de GET %s cumple la vista compartida',
    async (ruta, email, schema) => {
      const res = await app.inject({ method: 'GET', url: ruta, headers: conToken(email) });
      expect(res.statusCode, res.body).toBe(200);
      const resultado = schema.safeParse(res.json());
      expect(resultado.success, JSON.stringify(resultado.error?.issues, null, 2)).toBe(true);
      // Las listas de datos de la semilla no vienen vacías: el contrato se prueba con filas reales.
      if (Array.isArray(res.json())) expect((res.json() as unknown[]).length).toBeGreaterThan(0);
    },
  );

  it('el detalle del viaje liquidado y la oferta aceptada cumplen sus vistas', async () => {
    const viaje = await app.inject({
      method: 'GET',
      url: `/api/v1/viajes/${viajeId}`,
      headers: conToken('finance@asotracmet.test'),
    });
    const detalle = DetalleViajeSchema.safeParse(viaje.json());
    expect(detalle.success, JSON.stringify(detalle.error?.issues)).toBe(true);
    expect(detalle.data?.recaudo?.estado).toBe('pendiente');
    const ofertas = VistaOfertaSchema.array().parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/ofertas?estado=aceptada',
          headers: conToken('ops@asotracmet.test'),
        })
      ).json(),
    );
    expect(ofertas.map((o) => o.id)).toContain(ofertaId);
  });
});
