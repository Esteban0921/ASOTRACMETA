import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { PLACA_REGEX, normalizarPlaca } from '@asotracmet/shared';

// Cuentas de las plataformas de GPS (ADR-0007, TASK-0064).
//
// Este es el único archivo del proyecto que lee credenciales de terceros, y vive fuera de la base
// a propósito (RULE-021, spec §12, criterio §20.9): un JSON en el host, con permisos 0400, montado
// de solo lectura únicamente en el contenedor del agente. Nunca se commitea, nunca se registra en
// el log y nunca viaja a la API: lo que sale de aquí son coordenadas, no contraseñas.

const PlacaLote = z
  .string()
  .trim()
  .transform(normalizarPlaca)
  .pipe(z.string().regex(PLACA_REGEX, 'Placa inválida: se espera formato AAA123'));

export const CuentaGpsSchema = z
  .object({
    /** Identificador opaco que sí puede aparecer en el log (`cuenta-01`), nunca el usuario real. */
    id: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/, 'El id de la cuenta es minúsculas, dígitos y guiones'),
    proveedor: z.string().min(1).max(60),
    usuario: z.string().min(1),
    clave: z.string().min(1),
    /** Si está, solo se consultan y envían estas placas de la cuenta. */
    placas: z.array(PlacaLote).min(1).optional(),
    /** Versión de los términos de asociado que amparan el tratamiento (ADR-0007). */
    autorizacion: z
      .object({ referencia: z.string().min(1), firmadaEn: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();
export type CuentaGps = z.infer<typeof CuentaGpsSchema>;

export const CuentasGpsSchema = z
  .object({
    version: z.literal(1),
    /**
     * JSON no admite comentarios y este archivo lo abre quien administra el servidor, no un
     * programador: `_comentario` existe para que el ejemplo pueda explicarse a sí mismo.
     */
    _comentario: z.union([z.string(), z.array(z.string())]).optional(),
    cuentas: z.array(CuentaGpsSchema),
  })
  .strict();
export type CuentasGps = z.infer<typeof CuentasGpsSchema>;

export interface AvisoPermisos {
  (mensaje: string): void;
}

/**
 * Lee y valida el archivo en cada ciclo: dar de alta una cuenta no exige reiniciar el agente, y
 * si alguien retira una, deja de consultarse en la siguiente vuelta.
 *
 * Un error aquí nunca arrastra el contenido del archivo: Zod descarta el valor de cada campo al
 * construir el mensaje, pero aun así se sustituye por uno propio para no depender de eso.
 */
export async function leerCuentas(ruta: string, avisar?: AvisoPermisos): Promise<CuentaGps[]> {
  let crudo: string;
  try {
    crudo = await readFile(ruta, 'utf8');
  } catch (error) {
    const causa = error instanceof Error ? error.message : String(error);
    // La causa original es del sistema de archivos (ENOENT, EACCES): no lleva el contenido.
    throw new Error(`No se pudo leer el archivo de cuentas GPS (${ruta}): ${causa}`, {
      cause: error,
    });
  }

  // En sistemas POSIX, que el grupo u otros puedan leerlo es un problema: son claves de terceros.
  if (process.platform !== 'win32') {
    try {
      const { mode } = await stat(ruta);
      if ((mode & 0o077) !== 0) {
        avisar?.(
          `El archivo de cuentas GPS (${ruta}) es legible por otros usuarios: debería ser 0400`,
        );
      }
    } catch {
      // Si no se puede consultar el modo, no se bloquea el ciclo por eso.
    }
  }

  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    throw new Error(`El archivo de cuentas GPS (${ruta}) no es JSON válido`);
  }

  const resultado = CuentasGpsSchema.safeParse(datos);
  if (!resultado.success) {
    // Solo la ruta del campo, nunca su valor.
    const campos = resultado.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`El archivo de cuentas GPS (${ruta}) no cumple el formato: ${campos}`);
  }

  const ids = new Set<string>();
  for (const cuenta of resultado.data.cuentas) {
    if (ids.has(cuenta.id))
      throw new Error(`El archivo de cuentas GPS repite el id "${cuenta.id}"`);
    ids.add(cuenta.id);
  }
  return resultado.data.cuentas;
}
