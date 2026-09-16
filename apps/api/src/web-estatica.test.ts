import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construirApp, type AppConstruida } from './app.js';

// TASK-0032: en producción la API sirve el build de la web (WEB_DIR). Las rutas del SPA caen a
// index.html; los archivos se sirven tal cual; `/api/*` sigue devolviendo JSON con código estable.

describe('web estática servida por la API (WEB_DIR)', () => {
  let construida: AppConstruida;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'asotracmet-web-'));
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>ASOTRACMET</title>');
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log("ok")');
    construida = await construirApp({
      config: { persistencia: 'memoria', logger: false, webDir: dir, mensajeria: 'memoria' },
    });
  });

  afterAll(async () => {
    await construida.app.close();
  });

  it('sirve index.html en la raíz y en cualquier ruta del router de React', async () => {
    for (const url of ['/', '/ops', '/admin/usuarios', '/entrar?token=x']) {
      const res = await construida.app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('ASOTRACMET');
    }
  });

  it('sirve los archivos del build con su tipo', async () => {
    const res = await construida.app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.body).toContain('console.log');
  });

  it('la API no cae al SPA: sin token es 401 JSON y una ruta inexistente es 404 JSON', async () => {
    const sinToken = await construida.app.inject({ method: 'GET', url: '/api/v1/colas/TM-CBZ' });
    expect(sinToken.statusCode).toBe(401);
    expect(sinToken.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    const salud = await construida.app.inject({ method: 'GET', url: '/healthz' });
    expect(salud.json()).toMatchObject({ ok: true });
    const post = await construida.app.inject({ method: 'POST', url: '/no-existe' });
    expect(post.statusCode).toBe(404);
    expect(post.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('sin WEB_DIR (desarrollo) nada cambia', () => {
  it('la raíz exige token como cualquier ruta y responde JSON', async () => {
    const { app } = await construirApp({
      config: { persistencia: 'memoria', logger: false, webDir: null, mensajeria: 'memoria' },
    });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    await app.close();
  });
});
