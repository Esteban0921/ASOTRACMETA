import { useEffect, useState } from 'react';

/** `navigator.onLine` reactivo: aviso de sin conexión (spec §9.1). */
function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const conectado = () => setEnLinea(true);
    const desconectado = () => setEnLinea(false);
    window.addEventListener('online', conectado);
    window.addEventListener('offline', desconectado);
    return () => {
      window.removeEventListener('online', conectado);
      window.removeEventListener('offline', desconectado);
    };
  }, []);
  return enLinea;
}

export function EstadoConexion() {
  const enLinea = useEnLinea();
  if (enLinea) return null;
  return (
    <p role="status" className="sin-conexion" data-testid="sin-conexion">
      Sin conexión: ves la última información guardada. Aceptar o declinar necesita red.
    </p>
  );
}
