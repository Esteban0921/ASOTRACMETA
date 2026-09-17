import { z } from 'zod';

// Soportes HSEQ (spec §6.3, §12, §18; TASK-0043): el archivo nunca va dentro de la base. La API
// entrega una URL de subida (prefirmada en S3, o propia con el almacén local), el navegador sube
// directo y luego confirma; `documentos.archivo_url` guarda solo la referencia.

export const TIPOS_SOPORTE = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type TipoSoporte = (typeof TIPOS_SOPORTE)[number];

/** 10 MB: un PDF escaneado de varias páginas cabe; un vídeo no. */
export const SOPORTE_MAX_BYTES = 10 * 1024 * 1024;

const EXTENSIONES: Record<TipoSoporte, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export function extensionDeSoporte(tipo: TipoSoporte): string {
  return EXTENSIONES[tipo];
}

/** Claves de objeto que acepta la API: `documentos/<documento>/<archivo>.<ext>`, sin `..` ni `/` sueltos. */
export const CLAVE_SOPORTE_REGEX =
  /^documentos\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.(pdf|jpg|png)$/;

export const SolicitarSoporteSchema = z.object({
  nombre: z.string().trim().min(1).max(160),
  tipo: z.enum(TIPOS_SOPORTE),
  tamano: z.number().int().positive().max(SOPORTE_MAX_BYTES),
});
export type SolicitarSoporteInput = z.infer<typeof SolicitarSoporteSchema>;

export const ConfirmarSoporteSchema = z.object({
  clave: z.string().regex(CLAVE_SOPORTE_REGEX, 'Clave de soporte inválida'),
});

/** Respuesta de `POST /documentos/:id/soporte`: dónde y cómo subir el archivo. */
export const UrlSubidaSchema = z.object({
  clave: z.string(),
  metodo: z.literal('PUT'),
  /** Absoluta (S3 prefirmada) o relativa a la API (`/api/v1/soportes/...`, almacén local). */
  url: z.string(),
  cabeceras: z.record(z.string(), z.string()),
  expiraEn: z.string(),
});
export type UrlSubida = z.infer<typeof UrlSubidaSchema>;
