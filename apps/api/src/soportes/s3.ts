import { createHash, createHmac } from 'node:crypto';
import type { UrlSubida } from '@asotracmet/shared';
import type { AlmacenSoportes, DescripcionObjeto } from './tipos.js';

// S3 compatible (AWS, MinIO, Backblaze B2, Cloudflare R2) con AWS Signature V4 escrita a mano
// (TASK-0043): dos firmas (query para URLs prefirmadas, cabecera para HEAD) son menos código y
// menos superficie que el SDK completo. Las claves del bucket viven en el entorno (spec §12).

export interface ConfigS3 {
  /** `https://s3.amazonaws.com`, `https://s3.eu-west-1.amazonaws.com`, `http://localhost:9000`... */
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** MinIO y similares: `endpoint/bucket/clave` en vez de `bucket.endpoint/clave`. */
  pathStyle?: boolean;
  fetch?: typeof fetch;
}

const ALGORITMO = 'AWS4-HMAC-SHA256';
const SIN_CUERPO = 'UNSIGNED-PAYLOAD';

const sha256 = (datos: string): string => createHash('sha256').update(datos, 'utf8').digest('hex');
const hmac = (clave: Buffer | string, datos: string): Buffer =>
  createHmac('sha256', clave).update(datos, 'utf8').digest();

/** RFC 3986 estricto, como exige SigV4 (`encodeURIComponent` deja `!'()*` sin codificar). */
export function codificarSigV4(valor: string): string {
  return encodeURIComponent(valor).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** `20130524T000000Z` y `20130524`. */
export function marcasDeTiempo(ahora: Date): { fechaHora: string; fecha: string } {
  const fechaHora = ahora
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return { fechaHora, fecha: fechaHora.slice(0, 8) };
}

export interface PeticionAFirmar {
  metodo: 'GET' | 'PUT' | 'HEAD';
  /** Ruta ya con el bucket si es path-style, sin query. */
  ruta: string;
  host: string;
  /** Cabeceras que se firman (siempre `host`). */
  cabeceras: Record<string, string>;
  query?: Record<string, string>;
  ahora: Date;
}

function claveDeFirma(secretKey: string, fecha: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secretKey}`, fecha), region), 's3'), 'aws4_request');
}

function rutaCanonica(ruta: string): string {
  return ruta
    .split('/')
    .map((segmento) => codificarSigV4(segmento))
    .join('/');
}

function queryCanonica(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((k) => `${codificarSigV4(k)}=${codificarSigV4(query[k] ?? '')}`)
    .join('&');
}

function firmar(
  peticion: PeticionAFirmar,
  credenciales: { accessKey: string; secretKey: string; region: string },
  query: Record<string, string>,
  hashCuerpo: string,
): { firma: string; credencial: string; cabecerasFirmadas: string; fechaHora: string } {
  const { fechaHora, fecha } = marcasDeTiempo(peticion.ahora);
  const alcance = `${fecha}/${credenciales.region}/s3/aws4_request`;
  const nombres = Object.keys(peticion.cabeceras)
    .map((k) => k.toLowerCase())
    .sort();
  const cabecerasCanonicas = nombres
    .map((k) => {
      const original = Object.keys(peticion.cabeceras).find((n) => n.toLowerCase() === k)!;
      return `${k}:${peticion.cabeceras[original]!.trim()}\n`;
    })
    .join('');
  const cabecerasFirmadas = nombres.join(';');
  const peticionCanonica = [
    peticion.metodo,
    rutaCanonica(peticion.ruta),
    queryCanonica(query),
    cabecerasCanonicas,
    cabecerasFirmadas,
    hashCuerpo,
  ].join('\n');
  const aFirmar = [ALGORITMO, fechaHora, alcance, sha256(peticionCanonica)].join('\n');
  const firma = createHmac(
    'sha256',
    claveDeFirma(credenciales.secretKey, fecha, credenciales.region),
  )
    .update(aFirmar, 'utf8')
    .digest('hex');
  return {
    firma,
    credencial: `${credenciales.accessKey}/${alcance}`,
    cabecerasFirmadas,
    fechaHora,
  };
}

/** URL prefirmada (autenticación por query, spec AWS "Authenticating Requests: Using Query Parameters"). */
export function presignar(
  peticion: PeticionAFirmar,
  credenciales: { accessKey: string; secretKey: string; region: string },
  expiraSeg: number,
  protocolo = 'https',
): string {
  const { fechaHora, fecha } = marcasDeTiempo(peticion.ahora);
  const cabecerasFirmadas = Object.keys(peticion.cabeceras)
    .map((k) => k.toLowerCase())
    .sort()
    .join(';');
  const query: Record<string, string> = {
    ...(peticion.query ?? {}),
    'X-Amz-Algorithm': ALGORITMO,
    'X-Amz-Credential': `${credenciales.accessKey}/${fecha}/${credenciales.region}/s3/aws4_request`,
    'X-Amz-Date': fechaHora,
    'X-Amz-Expires': String(expiraSeg),
    'X-Amz-SignedHeaders': cabecerasFirmadas,
  };
  const { firma } = firmar(peticion, credenciales, query, SIN_CUERPO);
  return `${protocolo}://${peticion.host}${rutaCanonica(peticion.ruta)}?${queryCanonica(query)}&X-Amz-Signature=${firma}`;
}

/** Cabeceras de una petición firmada (autenticación por cabecera `Authorization`). */
export function cabecerasFirmadas(
  peticion: PeticionAFirmar,
  credenciales: { accessKey: string; secretKey: string; region: string },
): Record<string, string> {
  const { fechaHora } = marcasDeTiempo(peticion.ahora);
  const cabeceras = {
    ...peticion.cabeceras,
    'x-amz-date': fechaHora,
    'x-amz-content-sha256': SIN_CUERPO,
  };
  const {
    firma,
    credencial,
    cabecerasFirmadas: firmadas,
  } = firmar({ ...peticion, cabeceras }, credenciales, peticion.query ?? {}, SIN_CUERPO);
  return {
    ...cabeceras,
    authorization: `${ALGORITMO} Credential=${credencial}, SignedHeaders=${firmadas}, Signature=${firma}`,
  };
}

export class SoportesS3 implements AlmacenSoportes {
  readonly clase = 's3' as const;
  private readonly llamar: typeof fetch;
  private readonly protocolo: string;
  private readonly hostBase: string;

  constructor(private readonly config: ConfigS3) {
    this.llamar = config.fetch ?? fetch;
    const endpoint = new URL(config.endpoint);
    this.protocolo = endpoint.protocol.replace(':', '');
    this.hostBase = endpoint.host;
  }

  /** Host y ruta del objeto según el estilo de direccionamiento. */
  private direccion(clave: string): { host: string; ruta: string } {
    return this.config.pathStyle
      ? { host: this.hostBase, ruta: `/${this.config.bucket}/${clave}` }
      : { host: `${this.config.bucket}.${this.hostBase}`, ruta: `/${clave}` };
  }

  private get credenciales() {
    const { accessKey, secretKey, region } = this.config;
    return { accessKey, secretKey, region };
  }

  async urlSubida(clave: string, tipo: string, expiraSeg: number, ahora: Date): Promise<UrlSubida> {
    const { host, ruta } = this.direccion(clave);
    // `content-type` firmado: el navegador debe mandar exactamente el tipo declarado.
    const url = presignar(
      { metodo: 'PUT', ruta, host, cabeceras: { host, 'content-type': tipo }, ahora },
      this.credenciales,
      expiraSeg,
      this.protocolo,
    );
    return {
      clave,
      metodo: 'PUT',
      url,
      cabeceras: { 'content-type': tipo },
      expiraEn: new Date(ahora.getTime() + expiraSeg * 1000).toISOString(),
    };
  }

  async describir(clave: string): Promise<DescripcionObjeto | null> {
    const { host, ruta } = this.direccion(clave);
    const cabeceras = cabecerasFirmadas(
      { metodo: 'HEAD', ruta, host, cabeceras: { host }, ahora: new Date() },
      this.credenciales,
    );
    const res = await this.llamar(`${this.protocolo}://${host}${ruta}`, {
      method: 'HEAD',
      headers: cabeceras,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 HEAD ${clave}: ${res.status}`);
    return {
      tamano: Number(res.headers.get('content-length') ?? 0),
      tipo: res.headers.get('content-type'),
    };
  }

  async urlDescarga(clave: string, expiraSeg: number, ahora: Date): Promise<string> {
    const { host, ruta } = this.direccion(clave);
    return presignar(
      { metodo: 'GET', ruta, host, cabeceras: { host }, ahora },
      this.credenciales,
      expiraSeg,
      this.protocolo,
    );
  }

  referencia(clave: string): string {
    return `s3://${this.config.bucket}/${clave}`;
  }
}
