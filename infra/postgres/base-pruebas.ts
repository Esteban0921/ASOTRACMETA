// Guardia de la base de pruebas (TASK-0061). Los tests del proyecto `db` truncan tablas de
// operación y vuelven a sembrar: solo pueden correr contra una base cuyo nombre termine en `_test`.
// El 2026-09-18 una corrida contra la base de desarrollo (con el Excel legado cargado) borró
// viajes, TR y recaudos; esta comprobación convierte ese descuido en un error inmediato.

/** `DATABASE_URL_TEST` tiene precedencia; si no existe, `DATABASE_URL`. `undefined` = se omite. */
export function urlBasePruebas(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env.DATABASE_URL_TEST ?? env.DATABASE_URL;
  if (!url) return undefined;
  exigirBaseDePruebas(url);
  return url;
}

export function nombreBase(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

/** Lanza si la base no es de pruebas: nunca se truncan datos reales por accidente. */
export function exigirBaseDePruebas(url: string): void {
  const nombre = nombreBase(url);
  if (!/_test$/.test(nombre)) {
    throw new Error(
      `pnpm test:db trunca tablas y solo corre contra una base cuyo nombre termine en "_test" ` +
        `(recibió "${nombre || url}"). Define DATABASE_URL_TEST=postgres://.../asotracmet_test.`,
    );
  }
}
