import type { UrlSubida } from '@asotracmet/shared';

// Puerto de object storage para soportes HSEQ (TASK-0043). Dos adaptadores: S3 compatible
// (URLs prefirmadas, el navegador sube y descarga directo del bucket) y local en disco (la API
// recibe y sirve los bytes; desarrollo, e2e y un VPS sin bucket).

export interface DescripcionObjeto {
  tamano: number;
  tipo: string | null;
}

export interface AlmacenSoportes {
  readonly clase: 'local' | 's3';
  /** Dónde subir: URL prefirmada (S3) o ruta de la API (local); caduca a los `expiraSeg`. */
  urlSubida(clave: string, tipo: string, expiraSeg: number, ahora: Date): Promise<UrlSubida>;
  /** Existe el objeto y cuánto pesa (al confirmar). `null` si no se subió. */
  describir(clave: string): Promise<DescripcionObjeto | null>;
  /** URL prefirmada de descarga (S3). El almacén local devuelve `null`: la API sirve los bytes. */
  urlDescarga(clave: string, expiraSeg: number, ahora: Date): Promise<string | null>;
  /** Referencia que se guarda en `documentos.archivo_url` (`s3://bucket/clave`, `local://clave`). */
  referencia(clave: string): string;
  /** Solo local: guardar y leer bytes. */
  guardar?(clave: string, cuerpo: Buffer, tipo: string): Promise<void>;
  leer?(clave: string): Promise<{ cuerpo: Buffer; tipo: string } | null>;
}
