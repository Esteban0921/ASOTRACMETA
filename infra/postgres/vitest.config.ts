import { defineConfig } from 'vitest/config';

// Proyecto `db`: corre solo con DATABASE_URL (CI job "Migraciones Postgres" o `pnpm test:db` local).
export default defineConfig({
  test: {
    name: 'db',
    environment: 'node',
    include: ['*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
