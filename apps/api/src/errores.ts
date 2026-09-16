import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { esErrorDominio } from '@asotracmet/domain';
import { httpStatusDe, type ErrorApi } from '@asotracmet/shared';

// Contrato de error (spec §8.6): { code, message, details }. El código es estable.

export interface OpcionesErrores {
  /**
   * Con la web servida por la API (producción, TASK-0032), cualquier GET fuera de `/api/` que no
   * sea un archivo devuelve `index.html`: el router de React resuelve la ruta.
   */
  spaIndex?: boolean;
  /** Observabilidad: cada error de negocio con código estable se cuenta (`COLA_LOCKED`, etc.). */
  alErrorDominio?: (codigo: string) => void;
}

export function registrarManejoErrores(app: FastifyInstance, opciones: OpcionesErrores = {}): void {
  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    if (opciones.spaIndex && req.method === 'GET' && !req.url.startsWith('/api/')) {
      void reply.type('text/html; charset=utf-8').sendFile('index.html');
      return;
    }
    const cuerpo: ErrorApi = { code: 'NOT_FOUND', message: 'Recurso no encontrado' };
    void reply.status(404).send(cuerpo);
  });

  app.setErrorHandler((error: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) => {
    if (esErrorDominio(error)) {
      opciones.alErrorDominio?.(error.code);
      const cuerpo: ErrorApi = { code: error.code, message: error.message, details: error.details };
      void reply.status(httpStatusDe(error.code)).send(cuerpo);
      return;
    }
    if (error instanceof ZodError) {
      const cuerpo: ErrorApi = {
        code: 'VALIDATION_ERROR',
        message: 'Entrada inválida',
        details: {
          issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      };
      void reply.status(400).send(cuerpo);
      return;
    }
    const conStatus = error as FastifyError;
    if (conStatus.statusCode === 429) {
      const cuerpo: ErrorApi = { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes' };
      void reply.status(429).send(cuerpo);
      return;
    }
    if (conStatus.statusCode && conStatus.statusCode >= 400 && conStatus.statusCode < 500) {
      const cuerpo: ErrorApi = { code: 'VALIDATION_ERROR', message: error.message };
      void reply.status(conStatus.statusCode).send(cuerpo);
      return;
    }
    req.log.error(error);
    const cuerpo: ErrorApi = { code: 'INTERNAL', message: 'Error interno' };
    void reply.status(500).send(cuerpo);
  });
}
