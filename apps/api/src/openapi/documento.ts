import { z, type ZodType } from 'zod';
import { ErrorApiSchema } from '@asotracmet/shared';
import { NOMBRES_ESQUEMAS, type EntradaContrato, type Respuesta } from './contrato.js';

// OpenAPI 3.1 a partir del contrato (TASK-0033). Los esquemas Zod se convierten con
// `z.toJSONSchema` (JSON Schema 2020-12, el dialecto de OpenAPI 3.1); cuerpos y queries con
// `io: 'input'` (lo que acepta la API), respuestas con `io: 'output'`.

export interface OpcionesOpenApi {
  version: string;
  servidor?: string;
}

type Json = Record<string, unknown>;

const REF_ERROR = { $ref: '#/components/schemas/ErrorApi' };

function aJsonSchema(schema: ZodType, io: 'input' | 'output'): Json {
  const json = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'any',
    reused: 'inline',
  }) as Json;
  const { $schema: _dialecto, ...resto } = json;
  return resto;
}

/** `/api/v1/colas/:clase` → `/api/v1/colas/{clase}` y sus parámetros de ruta. */
export function rutaOpenApi(ruta: string): { ruta: string; parametros: string[] } {
  const parametros: string[] = [];
  const convertida = ruta
    .replace(/:([A-Za-z]+)/g, (_todo, nombre: string) => {
      parametros.push(nombre);
      return `{${nombre}}`;
    })
    // Comodín de Fastify (`/soportes/*`): la clave del objeto, con sus barras.
    .replace(/\/\*$/, () => {
      parametros.push('clave');
      return '/{clave}';
    });
  return { ruta: convertida, parametros };
}

function operationId(metodo: string, ruta: string): string {
  const partes = ruta
    .replace(/^\/api\/v1\//, '')
    .replace(/^\//, '')
    .split('/')
    .map((p) =>
      p
        .replace(/[{}:]/g, '')
        .replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string) => c?.toUpperCase() ?? ''),
    )
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)));
  return `${metodo}${partes.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')}`;
}

export function construirOpenApi(
  contrato: readonly EntradaContrato[],
  opciones: OpcionesOpenApi,
): Json {
  const componentes: Record<string, Json> = { ErrorApi: aJsonSchema(ErrorApiSchema, 'output') };
  const referenciar = (nombre: string, schema: ZodType, io: 'input' | 'output'): Json => {
    componentes[nombre] ??= aJsonSchema(schema, io);
    return { $ref: `#/components/schemas/${nombre}` };
  };
  const cuerpoDe = (schema: ZodType): Json => {
    const nombre = NOMBRES_ESQUEMAS.get(schema);
    return nombre ? referenciar(nombre, schema, 'input') : aJsonSchema(schema, 'input');
  };
  const respuestaDe = (r: Respuesta | undefined): Json => {
    if (!r) return { type: 'object' };
    const base: Json = r.schema
      ? referenciar(r.nombre, r.schema, 'output')
      : { type: 'object', description: r.descripcion ?? r.nombre, 'x-tipo': r.nombre };
    return r.lista ? { type: 'array', items: base } : base;
  };

  const paths: Record<string, Json> = {};
  const etiquetas = new Set<string>();
  for (const e of contrato) {
    etiquetas.add(e.etiqueta);
    const { ruta, parametros } = rutaOpenApi(e.ruta);
    const parameters: Json[] = parametros.map((nombre) => ({
      name: nombre,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    if (e.query) {
      const json = aJsonSchema(e.query, 'input');
      const requeridos = new Set((json.required as string[] | undefined) ?? []);
      for (const [nombre, esquema] of Object.entries(
        (json.properties as Record<string, Json> | undefined) ?? {},
      )) {
        parameters.push({
          name: nombre,
          in: 'query',
          required: requeridos.has(nombre),
          schema: esquema,
        });
      }
    }
    const status = e.respuesta?.status ?? 200;
    const responses: Record<string, Json> = {
      [String(status)]: {
        description: e.respuesta?.descripcion ?? e.respuesta?.nombre ?? 'OK',
        content: { 'application/json': { schema: respuestaDe(e.respuesta) } },
      },
      default: {
        description:
          'Error con código estable (spec §8.6): 400 VALIDATION_ERROR, 401, 403, 404, 409 o 422 según el código',
        content: { 'application/json': { schema: REF_ERROR } },
      },
    };
    const operacion: Json = {
      tags: [e.etiqueta],
      summary: e.resumen,
      operationId: operationId(e.metodo, ruta),
      'x-guard': e.guard,
      ...(e.reauth ? { 'x-reauth': true } : {}),
      security: e.publica ? [] : [{ bearerAuth: [] }],
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(e.body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: cuerpoDe(e.body) } },
            },
          }
        : {}),
      responses,
    };
    paths[ruta] = { ...(paths[ruta] ?? {}), [e.metodo]: operacion };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'ASOTRACMET · Enturnamiento',
      version: opciones.version,
      description:
        'API REST del sistema de enturnamiento (spec §8). Errores con código estable (`ErrorApi`); ' +
        'sesiones Bearer opacas y revocables; RBAC por recurso (`x-guard`); `x-reauth` exige ' +
        're-autenticación reciente.',
    },
    servers: [{ url: opciones.servidor ?? '/' }],
    tags: [...etiquetas].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      schemas: componentes,
    },
  };
}

/** Todas las `$ref` del documento apuntan a un componente existente. */
export function refsColgantes(documento: Json): string[] {
  const esquemas =
    (documento.components as { schemas?: Record<string, unknown> } | undefined)?.schemas ?? {};
  const colgantes = new Set<string>();
  const recorrer = (valor: unknown): void => {
    if (Array.isArray(valor)) {
      valor.forEach(recorrer);
    } else if (valor && typeof valor === 'object') {
      for (const [clave, v] of Object.entries(valor as Json)) {
        if (clave === '$ref' && typeof v === 'string') {
          const nombre = v.replace('#/components/schemas/', '');
          if (!(nombre in esquemas)) colgantes.add(v);
        } else {
          recorrer(v);
        }
      }
    }
  };
  recorrer(documento);
  return [...colgantes];
}
