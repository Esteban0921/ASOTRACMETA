import { defineConfig } from 'vitest/config';

// Vitest en modo proyectos: cada paquete/app define su propio vitest.config.ts o vite.config.ts.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'infra/postgres', 'infra/migracion'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.*', '**/*.d.ts', 'apps/web/src/main.tsx', 'apps/api/src/index.ts'],
    },
  },
});
