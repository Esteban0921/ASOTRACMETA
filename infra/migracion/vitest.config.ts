import { defineConfig } from 'vitest/config';

// Proyecto `migracion`: tests puros del plan de migración (TASK-0025). No necesita base de datos;
// el test sobre el xlsx real se omite si el archivo no está (vive fuera de git).
export default defineConfig({
  test: {
    name: 'migracion',
    environment: 'node',
    include: ['*.test.ts'],
    testTimeout: 60_000,
  },
});
