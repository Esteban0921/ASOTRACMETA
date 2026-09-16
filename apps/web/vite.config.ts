import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// En e2e la API corre en otro puerto (ver playwright.config.ts): el destino del proxy es configurable.
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';

/**
 * PWA (spec §9.1, TASK-0031): "Mi turno" instalable, shell en caché y lectura offline de lo propio
 * (`/me/*`, alertas de documentos, motivos). Las escrituras nunca se cachean: sin red, la API dice
 * `NETWORK` y la web lo muestra. El service worker solo existe en el build: el e2e offline corre
 * contra `vite preview` (`preview:e2e`), no contra el dev server.
 */
const pwa = VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['icono.svg'],
  manifest: {
    name: 'Mi turno · ASOTRACMET',
    short_name: 'Mi turno',
    description: 'Enturnamiento gremial ASOTRACMET: posición en cola, ofertas y TR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f6f5',
    theme_color: '#0f3d3e',
    lang: 'es',
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      { src: '/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  },
  workbox: {
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//, /^\/healthz/, /^\/readyz/, /^\/metrics/],
    runtimeCaching: [
      {
        urlPattern: ({ url }) =>
          url.pathname.startsWith('/api/v1/me/') ||
          url.pathname === '/api/v1/documentos/alertas' ||
          url.pathname === '/api/v1/motivos-declinacion',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'mi-turno-lectura',
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 },
          cacheableResponse: { statuses: [200] },
        },
      },
    ],
  },
  devOptions: { enabled: true, type: 'module', navigateFallback: '/index.html' },
});

export default defineConfig({
  plugins: [react(), pwa],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API_URL, changeOrigin: true },
    },
  },
  preview: {
    port: 5373,
    strictPort: true,
    proxy: {
      '/api': { target: API_URL, changeOrigin: true },
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
