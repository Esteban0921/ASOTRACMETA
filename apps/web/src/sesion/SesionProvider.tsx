import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/cliente';
import type { Sesion } from '../api/tipos';
import { borrarSesion, guardarSesion, leerSesion } from './almacen';
import { SesionContext, type ContextoSesion } from './contexto';

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(() => leerSesion());
  const queryClient = useQueryClient();

  const establecer = useCallback(
    (nueva: Sesion) => {
      guardarSesion(nueva);
      setSesion(nueva);
      queryClient.clear();
    },
    [queryClient],
  );

  const cerrar = useCallback(async () => {
    try {
      // Revoca la sesión en el servidor: el token deja de valer aunque alguien lo copiara.
      await api<void>('/auth/logout', { method: 'POST' });
    } catch {
      // El token puede haber expirado; cerrar localmente igual.
    }
    borrarSesion();
    setSesion(null);
    queryClient.clear();
  }, [queryClient]);

  const valor = useMemo<ContextoSesion>(
    () => ({ sesion, establecer, cerrar }),
    [sesion, establecer, cerrar],
  );
  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}
