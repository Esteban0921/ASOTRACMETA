import { describe, expect, it } from 'vitest';
import { exigirBaseDePruebas, nombreBase, urlBasePruebas } from './base-pruebas.js';

// TASK-0061: la guardia no depende de Postgres, así que corre siempre (también sin DATABASE_URL).

describe('guardia de la base de pruebas (TASK-0061)', () => {
  it('acepta bases cuyo nombre termina en _test y prefiere DATABASE_URL_TEST', () => {
    expect(nombreBase('postgres://u:p@localhost:5434/asotracmet_test')).toBe('asotracmet_test');
    expect(
      urlBasePruebas({
        DATABASE_URL: 'postgres://u:p@localhost:5434/asotracmet',
        DATABASE_URL_TEST: 'postgres://u:p@localhost:5434/asotracmet_test',
      }),
    ).toBe('postgres://u:p@localhost:5434/asotracmet_test');
    expect(urlBasePruebas({})).toBeUndefined();
  });

  it('rechaza la base de desarrollo o producción antes de truncar nada', () => {
    expect(() => exigirBaseDePruebas('postgres://u:p@localhost:5434/asotracmet')).toThrow(/_test/);
    expect(() => urlBasePruebas({ DATABASE_URL: 'postgres://u:p@db/asotracmet' })).toThrow(
      /asotracmet/,
    );
    expect(() => exigirBaseDePruebas('postgres://u:p@db/asotracmet_test_anonimizar')).toThrow();
  });
});
