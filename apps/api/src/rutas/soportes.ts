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
  CLAVE_SOPORTE_REGEX,
  ConfirmarSoporteSchema,
  SolicitarSoporteSchema,
  TIPOS_SOPORTE,
  extensionDeSoporte,
  fechaLocal,
} from '@asotracmet/shared';
import { actorDe, exigir } from '../auth/plugin.js';
import type { Consultas } from '../consultas/tipos.js';
import type { DocumentoRegistro, RepositorioMaestros } from '../maestros/tipos.js';
import { vistaDocumento } from '../maestros/vistas.js';
import type { AlmacenSoportes } from '../soportes/tipos.js';

export interface DepsSoportes {
  soportes: AlmacenSoportes;
  maestros: RepositorioMaestros;
  consultas: Consultas;
  uow: UnidadDeTrabajo;
  reloj: Reloj;
  ids: GeneradorIds;
  maxBytes: number;
  urlSegundos: number;
}

const IdParam = z.object({ id: z.string().min(1) });
const TIPOS = new Set<string>(TIPOS_SOPORTE);

/**
 * Soportes de documentos HSEQ (spec §6.3, §12; TASK-0043): pedir URL de subida → subir directo
 * (bucket o esta API) → confirmar. La descarga pasa siempre por la API con el rol del actor
 * (redirección prefirmada en S3, bytes en local) y queda auditada: son documentos sensibles.
 */
export function rutasSoportes(app: FastifyInstance, deps: DepsSoportes): void {
  const { soportes, maestros, uow, reloj, ids } = deps;

  const auditar = (
    actor: Actor,
    accion: string,
    documentoId: string,
    before: unknown,
    after: unknown,
  ) =>
    uow.ejecutar(null, (tx) =>
      tx.auditar({
        actorId: actor.id,
        actorRol: actor.rol,
        accion,
        entidad: 'documentos',
        entidadId: documentoId,
        before,
        after,
      }),
    );

  async function documentoOr404(id: string): Promise<DocumentoRegistro> {
    const d = await maestros.documento(id);
    if (!d || d.eliminadoEn) throw new ErrorDominio('NOT_FOUND', 'Documento no existe');
    return d;
  }

  async function vista(d: DocumentoRegistro) {
    const tipo = (await maestros.tiposDocumento()).find((t) => t.id === d.tipoId);
    const { timezone } = await deps.consultas.parametros();
    return vistaDocumento(d, tipo, fechaLocal(reloj.ahora(), timezone), false);
  }

  const claveValida = (clave: string, documentoId: string): boolean =>
    CLAVE_SOPORTE_REGEX.test(clave) && clave.startsWith(`documentos/${documentoId}/`);

  app.post(
    '/api/v1/documentos/:id/soporte',
    { preHandler: exigir('documentos', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const entrada = SolicitarSoporteSchema.parse(req.body);
      if (entrada.tamano > deps.maxBytes) {
        throw new ErrorDominio('VALIDATION_ERROR', `El archivo supera ${deps.maxBytes} bytes`);
      }
      await documentoOr404(id);
      const clave = `documentos/${id}/${ids.nuevo()}.${extensionDeSoporte(entrada.tipo)}`;
      return reply.send(
        await soportes.urlSubida(clave, entrada.tipo, deps.urlSegundos, reloj.ahora()),
      );
    },
  );

  // Solo almacén local: recibe los bytes que en S3 irían directo al bucket.
  app.put('/api/v1/soportes/*', { preHandler: exigir('documentos', 'U') }, async (req, reply) => {
    if (soportes.clase !== 'local' || !soportes.guardar) {
      throw new ErrorDominio('NOT_FOUND', 'Las subidas van directo al bucket');
    }
    const clave = (req.params as { '*': string })['*'];
    if (!CLAVE_SOPORTE_REGEX.test(clave)) {
      throw new ErrorDominio('VALIDATION_ERROR', 'Clave de soporte inválida');
    }
    const tipo = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
    if (!TIPOS.has(tipo)) throw new ErrorDominio('VALIDATION_ERROR', `Tipo no permitido: ${tipo}`);
    const cuerpo = req.body;
    if (!Buffer.isBuffer(cuerpo) || cuerpo.length === 0) {
      throw new ErrorDominio('VALIDATION_ERROR', 'Cuerpo vacío');
    }
    if (cuerpo.length > deps.maxBytes) {
      throw new ErrorDominio('VALIDATION_ERROR', `El archivo supera ${deps.maxBytes} bytes`);
    }
    await soportes.guardar(clave, cuerpo, tipo);
    return reply.status(201).send({ clave, tamano: cuerpo.length });
  });

  app.post(
    '/api/v1/documentos/:id/soporte/confirmar',
    { preHandler: exigir('documentos', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { clave } = ConfirmarSoporteSchema.parse(req.body);
      const actor = actorDe(req);
      const actual = await documentoOr404(id);
      if (!claveValida(clave, id)) {
        throw new ErrorDominio('VALIDATION_ERROR', 'La clave no corresponde a este documento');
      }
      const objeto = await soportes.describir(clave);
      if (!objeto) throw new ErrorDominio('NOT_FOUND', 'El archivo no se subió');
      if (objeto.tamano > deps.maxBytes) {
        throw new ErrorDominio('VALIDATION_ERROR', `El archivo supera ${deps.maxBytes} bytes`);
      }
      if (objeto.tipo && !TIPOS.has(objeto.tipo.split(';')[0]!.trim())) {
        throw new ErrorDominio('VALIDATION_ERROR', `Tipo no permitido: ${objeto.tipo}`);
      }
      const actualizado: DocumentoRegistro = {
        ...actual,
        archivoUrl: soportes.referencia(clave),
        actualizadoEn: reloj.ahora().toISOString(),
      };
      await maestros.guardarDocumento(actualizado);
      await auditar(
        actor,
        'documento.soporte',
        id,
        { archivoUrl: actual.archivoUrl },
        { archivoUrl: actualizado.archivoUrl, tamano: objeto.tamano },
      );
      return reply.send(await vista(actualizado));
    },
  );

  app.get(
    '/api/v1/documentos/:id/soporte',
    { preHandler: exigir('documentos', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      const d = await documentoOr404(id);
      if (
        actor.rol === 'member' &&
        !(d.sujetoTipo === 'vehiculo' && (actor.vehiculoIds ?? []).includes(d.sujetoId))
      ) {
        throw new ErrorDominio('FORBIDDEN_OWN_SCOPE', 'El documento no es de tus placas');
      }
      if (!d.archivoUrl) throw new ErrorDominio('NOT_FOUND', 'El documento no tiene soporte');
      await auditar(actor, 'documento.descargar', id, null, { archivoUrl: d.archivoUrl });

      const local = /^local:\/\/(.+)$/.exec(d.archivoUrl);
      if (local) {
        const archivo = soportes.leer ? await soportes.leer(local[1]!) : null;
        if (!archivo) throw new ErrorDominio('NOT_FOUND', 'El archivo ya no está en el almacén');
        const nombre = local[1]!.split('/').pop() ?? 'soporte';
        return reply
          .type(archivo.tipo)
          .header('content-disposition', `inline; filename="${nombre}"`)
          .header('cache-control', 'private, no-store')
          .send(archivo.cuerpo);
      }
      const s3 = /^s3:\/\/[^/]+\/(.+)$/.exec(d.archivoUrl);
      if (s3) {
        const url = await soportes.urlDescarga(s3[1]!, deps.urlSegundos, reloj.ahora());
        if (!url) throw new ErrorDominio('NOT_FOUND', 'El almacén no puede servir este soporte');
        return reply.redirect(url, 302);
      }
      // Referencia externa registrada a mano (spec §6.3): se redirige tal cual.
      return reply.redirect(d.archivoUrl, 302);
    },
  );
}
