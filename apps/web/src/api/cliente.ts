import type { CodigoError, ErrorApi } from '@asotracmet/shared';
import { borrarSesion, leerSesion } from '../sesion/almacen';

export class ErrorApiCliente extends Error {
  readonly status: number;
  readonly code: CodigoError | 'NETWORK';
  readonly details: Record<string, unknown> | undefined;

  constructor(
    status: number,
    code: CodigoError | 'NETWORK',
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ErrorApiCliente';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface OpcionesLlamada {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

/** Espera entre reintentos cuando otro coordinador tiene la cola (spec §7.7: "espera 2 s y reintenta"). */
export const ESPERA_COLA_LOCKED_MS = 2000;
/** Reintentos de una escritura ante `COLA_LOCKED` antes de rendirse y mostrar el aviso. */
export const REINTENTOS_COLA_LOCKED = 2;

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Cliente HTTP mínimo. El token viaja como Bearer; un 401 cierra la sesión local. Una escritura que
 * choca con `COLA_LOCKED` (409: nada se hizo) espera 2 s y se reintenta hasta dos veces (TASK-0020).
 */
export async function api<T>(ruta: string, opciones: OpcionesLlamada = {}): Promise<T> {
  for (let intento = 0; ; intento += 1) {
    try {
      return await llamar<T>(ruta, opciones);
    } catch (error) {
      const escritura = (opciones.method ?? 'GET') !== 'GET';
      const bloqueada = error instanceof ErrorApiCliente && error.code === 'COLA_LOCKED';
      if (!escritura || !bloqueada || intento >= REINTENTOS_COLA_LOCKED) throw error;
      await esperar(ESPERA_COLA_LOCKED_MS);
    }
  }
}

async function llamar<T>(ruta: string, opciones: OpcionesLlamada): Promise<T> {
  const sesion = leerSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api/v1${ruta}`, {
      method: opciones.method ?? 'GET',
      headers: {
        ...(opciones.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(sesion ? { authorization: `Bearer ${sesion.token}` } : {}),
        ...opciones.headers,
      },
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
    });
  } catch (error) {
    throw new ErrorApiCliente(
      0,
      'NETWORK',
      error instanceof Error ? error.message : 'Sin conexión',
    );
  }

  if (respuesta.status === 204) return undefined as T;
  const texto = await respuesta.text();
  const json: unknown = texto ? JSON.parse(texto) : null;

  if (!respuesta.ok) {
    const error = json as ErrorApi | null;
    if (respuesta.status === 401 && sesion && !ruta.startsWith('/auth/')) {
      borrarSesion();
      window.location.assign('/login');
    }
    throw new ErrorApiCliente(
      respuesta.status,
      error?.code ?? 'INTERNAL',
      error?.message ?? respuesta.statusText,
      error?.details,
    );
  }
  return json as T;
}

/** Descarga un archivo de la API (CSV, JSON) con el token de sesión y lo entrega al navegador. */
export async function descargar(ruta: string, nombreArchivo: string): Promise<void> {
  const sesion = leerSesion();
  const respuesta = await fetch(`/api/v1${ruta}`, {
    headers: sesion ? { authorization: `Bearer ${sesion.token}` } : {},
  });
  if (!respuesta.ok) {
    const error = (await respuesta.json().catch(() => null)) as ErrorApi | null;
    throw new ErrorApiCliente(
      respuesta.status,
      error?.code ?? 'INTERNAL',
      error?.message ?? respuesta.statusText,
      error?.details,
    );
  }
  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

export function codigoDeError(error: unknown): string {
  return error instanceof ErrorApiCliente ? error.code : 'INTERNAL';
}
