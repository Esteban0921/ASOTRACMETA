import { createContext, useContext } from 'react';
import type { Sesion } from '../api/tipos';

export interface ContextoSesion {
  sesion: Sesion | null;
  iniciar(email: string, password: string): Promise<Sesion>;
  cerrar(): Promise<void>;
}

export const SesionContext = createContext<ContextoSesion | null>(null);

export function useSesion(): ContextoSesion {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error('useSesion requiere <SesionProvider>');
  return ctx;
}
