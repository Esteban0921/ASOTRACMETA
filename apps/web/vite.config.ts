import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// En e2e la API corre en otro puerto (ver playwright.config.ts): el destino del proxy es configurable.
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
