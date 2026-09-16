import type { Sesion } from '../api/tipos';

const CLAVE = 'asotracmet.sesion';

// sessionStorage: la sesión muere al cerrar la pestaña. Fase producto: cookie httpOnly + refresh (TASK-0018).

export function leerSesion(): Sesion | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (!crudo) return null;
    const sesion = JSON.parse(crudo) as Sesion;
    if (new Date(sesion.expiraEn).getTime() <= Date.now()) {
      sessionStorage.removeItem(CLAVE);
      return null;
    }
    return sesion;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion: Sesion): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
  } catch {
    // Modo privado o storage bloqueado: la sesión vive solo en memoria.
  }
}

export function borrarSesion(): void {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // ignorar
  }
}
