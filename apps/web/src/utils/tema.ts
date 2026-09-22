/**
 * Tema de color (brief §1): el usuario elige claro, oscuro o el del sistema. La elección va en
 * `data-tema` de <html> (tokens.css la lee) y en localStorage; index.html la aplica antes del
 * primer pintado para que no haya destello.
 */
export type Tema = 'claro' | 'oscuro' | 'sistema';

export const CLAVE_TEMA = 'asotracmet.tema';

/** Colores de la cabecera por modo: los mismos de las <meta name="theme-color"> de index.html. */
export const COLOR_TEMA = { claro: '#0f3d3e', oscuro: '#0a2b2c' } as const;

export function leerTema(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE_TEMA);
    return guardado === 'claro' || guardado === 'oscuro' ? guardado : 'sistema';
  } catch {
    return 'sistema';
  }
}

export function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement;
  if (tema === 'sistema') delete raiz.dataset.tema;
  else raiz.dataset.tema = tema;
  try {
    if (tema === 'sistema') localStorage.removeItem(CLAVE_TEMA);
    else localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    /* sin almacenamiento (modo privado): el tema dura lo que dure la página */
  }
  // El color de la barra del navegador acompaña al tema elegido, no solo al del sistema.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (tema === 'sistema') {
      meta.content = meta.media.includes('dark') ? COLOR_TEMA.oscuro : COLOR_TEMA.claro;
    } else {
      meta.content = COLOR_TEMA[tema];
    }
  }
}
