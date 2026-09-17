import { describe, expect, it } from 'vitest';
import { SoportesS3, cabecerasFirmadas, codificarSigV4, marcasDeTiempo, presignar } from './s3.js';

// AWS Signature V4 a mano (TASK-0043). El vector de prueba es el de la documentación de AWS
// "Authenticating Requests: Using Query Parameters": GET examplebucket/test.txt, 24 de mayo de 2013,
// 86400 s, credenciales de ejemplo → firma conocida.

const EJEMPLO = {
  accessKey: 'AKIAIOSFODNN7EXAMPLE',
  secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
};

describe('SigV4', () => {
  it('reproduce la URL prefirmada del ejemplo oficial de AWS', () => {
    const url = presignar(
      {
        metodo: 'GET',
        ruta: '/test.txt',
        host: 'examplebucket.s3.amazonaws.com',
        cabeceras: { host: 'examplebucket.s3.amazonaws.com' },
        ahora: new Date('2013-05-24T00:00:00Z'),
      },
      EJEMPLO,
      86_400,
    );
    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('codifica como RFC 3986 estricto y formatea las marcas de tiempo', () => {
    expect(codificarSigV4("a b/c*d'(e)!")).toBe('a%20b%2Fc%2Ad%27%28e%29%21');
    expect(marcasDeTiempo(new Date('2026-09-17T13:05:09.123Z'))).toEqual({
      fechaHora: '20260917T130509Z',
      fecha: '20260917',
    });
  });

  it('firma por cabecera con x-amz-date y payload sin firmar', () => {
    const cabeceras = cabecerasFirmadas(
      {
        metodo: 'HEAD',
        ruta: '/soportes/documentos/doc-1/a.pdf',
        host: 'localhost:9000',
        cabeceras: { host: 'localhost:9000' },
        ahora: new Date('2026-09-17T13:00:00Z'),
      },
      EJEMPLO,
    );
    expect(cabeceras['x-amz-date']).toBe('20260917T130000Z');
    expect(cabeceras['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD');
    expect(cabeceras.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20260917\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });
});

describe('SoportesS3', () => {
  const ahora = new Date('2026-09-17T13:00:00Z');

  it('MinIO path-style: URL de subida con content-type firmado, HEAD firmado y referencia s3://', async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    let respuesta = new Response(null, {
      status: 200,
      headers: { 'content-length': '1234', 'content-type': 'application/pdf' },
    });
    const s3 = new SoportesS3({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'soportes',
      accessKey: EJEMPLO.accessKey,
      secretKey: EJEMPLO.secretKey,
      pathStyle: true,
      fetch: (async (url: string, init: RequestInit) => {
        llamadas.push({ url, init });
        return respuesta;
      }) as unknown as typeof fetch,
    });
    const subida = await s3.urlSubida('documentos/doc-1/a.pdf', 'application/pdf', 300, ahora);
    expect(subida.metodo).toBe('PUT');
    expect(subida.url).toMatch(/^http:\/\/localhost:9000\/soportes\/documentos\/doc-1\/a\.pdf\?/);
    expect(subida.url).toContain('X-Amz-SignedHeaders=content-type%3Bhost');
    expect(subida.url).toContain('X-Amz-Expires=300');
    expect(subida.cabeceras).toEqual({ 'content-type': 'application/pdf' });
    expect(subida.expiraEn).toBe('2026-09-17T13:05:00.000Z');

    expect(await s3.describir('documentos/doc-1/a.pdf')).toEqual({
      tamano: 1234,
      tipo: 'application/pdf',
    });
    expect(llamadas[0]?.url).toBe('http://localhost:9000/soportes/documentos/doc-1/a.pdf');
    expect(llamadas[0]?.init.method).toBe('HEAD');
    const cabeceras = llamadas[0]?.init.headers as Record<string, string>;
    expect(cabeceras.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=/);

    respuesta = new Response(null, { status: 404 });
    expect(await s3.describir('documentos/doc-1/no.pdf')).toBeNull();
    respuesta = new Response('denied', { status: 403 });
    await expect(s3.describir('documentos/doc-1/a.pdf')).rejects.toThrow(/403/);

    expect(await s3.urlDescarga('documentos/doc-1/a.pdf', 60, ahora)).toMatch(
      /^http:\/\/localhost:9000\/soportes\/documentos\/doc-1\/a\.pdf\?X-Amz-Algorithm=.*X-Amz-SignedHeaders=host&X-Amz-Signature=[0-9a-f]{64}$/,
    );
    expect(s3.referencia('documentos/doc-1/a.pdf')).toBe('s3://soportes/documentos/doc-1/a.pdf');
  });

  it('AWS virtual-hosted: el bucket va en el host', async () => {
    const s3 = new SoportesS3({
      endpoint: 'https://s3.eu-west-1.amazonaws.com',
      region: 'eu-west-1',
      bucket: 'asotracmet-soportes',
      accessKey: EJEMPLO.accessKey,
      secretKey: EJEMPLO.secretKey,
    });
    const subida = await s3.urlSubida('documentos/doc-1/a.jpg', 'image/jpeg', 300, ahora);
    expect(subida.url).toMatch(
      /^https:\/\/asotracmet-soportes\.s3\.eu-west-1\.amazonaws\.com\/documentos\/doc-1\/a\.jpg\?/,
    );
    expect(subida.url).toContain('%2Feu-west-1%2Fs3%2Faws4_request');
  });
});
