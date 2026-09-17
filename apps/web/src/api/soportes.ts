import type { UrlSubida } from '@asotracmet/shared';
import { leerSesion } from '../sesion/almacen';
import { ErrorApiCliente, api, descargar } from './cliente';
import type { VistaDocumento } from './tipos';

// Soportes HSEQ (TASK-0043): pedir URL → subir directo (bucket prefirmado o la propia API) →
// confirmar. Solo la URL relativa (almacén local) lleva el token; a una URL prefirmada de S3 no se
// le puede añadir `Authorization` sin romper la firma.

export async function subirSoporte(documentoId: string, archivo: File): Promise<VistaDocumento> {
  const solicitud = await api<UrlSubida>(`/documentos/${documentoId}/soporte`, {
    method: 'POST',
    body: { nombre: archivo.name, tipo: archivo.type, tamano: archivo.size },
  });
  const sesion = leerSesion();
  const esLocal = solicitud.url.startsWith('/');
  let respuesta: Response;
  try {
    respuesta = await fetch(solicitud.url, {
      method: solicitud.metodo,
      headers: {
        ...solicitud.cabeceras,
        ...(esLocal && sesion ? { authorization: `Bearer ${sesion.token}` } : {}),
      },
      body: archivo,
    });
  } catch (error) {
    throw new ErrorApiCliente(
      0,
      'NETWORK',
      error instanceof Error ? error.message : 'Sin conexión',
    );
  }
  if (!respuesta.ok) {
    throw new ErrorApiCliente(
      respuesta.status,
      'INTERNAL',
      `La subida falló (${respuesta.status})`,
    );
  }
  return api<VistaDocumento>(`/documentos/${documentoId}/soporte/confirmar`, {
    method: 'POST',
    body: { clave: solicitud.clave },
  });
}

export function descargarSoporte(documentoId: string, nombre: string): Promise<void> {
  return descargar(`/documentos/${documentoId}/soporte`, nombre);
}
