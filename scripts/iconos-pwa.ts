/**
 * Genera los iconos PWA (apps/web/public/icono-192.png e icono-512.png) a partir del mismo
 * apps/web/public/icono.svg de la marca "Llano Abierto" (TASK-0044). Rasteriza con el Chromium de
 * Playwright (ya es devDependency) para no añadir librerías de imagen.
 *
 * Los PNG van a sangre completa sobre marca-900 (sin esquinas transparentes) porque el de 512 se
 * declara `maskable`: el sistema aplica su propia máscara y el símbolo queda dentro de la zona segura.
 *
 * Uso: pnpm exec tsx scripts/iconos-pwa.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const publico = new URL('../apps/web/public/', import.meta.url);
const TAMANOS = [192, 512] as const;
const FONDO = '#0a2b2c';

const svg = await readFile(new URL('icono.svg', publico), 'utf8');
if (!svg.includes('viewBox="0 0 64 64"')) throw new Error('icono.svg debe tener viewBox 0 0 64 64');

const navegador = await chromium.launch();
try {
  for (const tamano of TAMANOS) {
    const pagina = await navegador.newPage({
      viewport: { width: tamano, height: tamano },
      deviceScaleFactor: 1,
    });
    const svgLleno = svg
      .replace(/rx="\d+"/, 'rx="0"')
      .replace('width="64" height="64"', `width="${tamano}" height="${tamano}"`);
    await pagina.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;background:${FONDO}}svg{display:block}</style></head><body>${svgLleno}</body></html>`,
    );
    const png = await pagina.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: tamano, height: tamano },
    });
    const destino = new URL(`icono-${tamano}.png`, publico);
    await writeFile(destino, png);
    console.log(`icono-${tamano}.png: ${png.byteLength} bytes`);
    await pagina.close();
  }
} finally {
  await navegador.close();
}
