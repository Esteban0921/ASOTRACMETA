// Log del agente GPS (ADR-0007, TASK-0064).
//
// El agente corre en el contenedor que tiene las credenciales de los propietarios y consulta
// posiciones, que son dato personal del conductor (spec §12). Por eso el log no acepta cualquier
// objeto: filtra por lista blanca de campos. Lo que no esté en la lista no se escribe, aunque
// alguien lo pase por descuido; así un `catch` que arrastre la respuesta del proveedor o la URL
// con la clave en la query no puede acabar en los registros del servidor.

export type NivelLog = 'info' | 'warn' | 'error';

export type Log = (datos: Record<string, unknown>, mensaje: string, nivel?: NivelLog) => void;

/** Ni placas, ni coordenadas, ni usuario, ni clave, ni token: conteos y estados. */
const CAMPOS_PERMITIDOS = new Set([
  'ciclo',
  'cuentaId',
  'proveedor',
  'cuentas',
  'consultadas',
  'saltadas',
  'fallidas',
  'enviadas',
  'placas',
  'recibidas',
  'guardadas',
  'duplicadas',
  'ignoradas',
  'proveedorDistinto',
  'placasDesconocidas',
  'intervaloMinutos',
  'motivo',
  'status',
  'ms',
  'intentos',
  'saltarHasta',
  'error',
]);

const MAX_TEXTO = 200;

export function filtrarCampos(datos: Record<string, unknown>): Record<string, unknown> {
  const limpio: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(datos)) {
    if (!CAMPOS_PERMITIDOS.has(clave)) continue;
    if (typeof valor === 'string') limpio[clave] = valor.slice(0, MAX_TEXTO);
    else if (typeof valor === 'number' || typeof valor === 'boolean' || valor === null) {
      limpio[clave] = valor;
    }
  }
  return limpio;
}

export function crearLog(escribir: (linea: string) => void): Log {
  return (datos, mensaje, nivel = 'info') => {
    escribir(JSON.stringify({ nivel, mensaje, ...filtrarCampos(datos) }));
  };
}
