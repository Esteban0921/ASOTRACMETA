import ExcelJS from 'exceljs';
import type { ClaseVehiculo } from '@asotracmet/shared';

// Lectura del Excel legado (spec §13). Este módulo solo convierte celdas a valores planos;
// no sabe de hojas ni de negocio. Nunca se leen contraseñas: eso lo decide `modelo.ts` por columna.

export type Celda = string | number | null;
export type Fila = readonly Celda[];
export type Filas = readonly Fila[];
/** Nombre de hoja (espacios colapsados) → filas 0-based. */
export type Libro = Map<string, Filas>;

const EPOCA_EXCEL = Date.UTC(1899, 11, 30);
const DIA_MS = 86_400_000;

function pad(n: number | string): string {
  return String(n).padStart(2, '0');
}

function isoDesdeDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function valorCelda(v: ExcelJS.CellValue): Celda {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'SI' : 'NO';
  if (v instanceof Date) return isoDesdeDate(v);
  if ('richText' in v) return v.richText.map((t) => t.text).join('');
  if ('formula' in v || 'sharedFormula' in v) {
    const r = (v as ExcelJS.CellFormulaValue).result;
    return r === undefined ? null : valorCelda(r);
  }
  if ('text' in v) return typeof v.text === 'string' ? v.text : valorCelda(v.text);
  return null; // CellErrorValue (#N/A, #REF!...)
}

export function normalizarNombreHoja(nombre: string): string {
  return nombre.replace(/\s+/g, ' ').trim().toUpperCase();
}

export async function leerLibro(ruta: string): Promise<Libro> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  const libro: Libro = new Map();
  wb.eachSheet((hoja) => {
    // Solo filas y celdas que existen en el archivo: `rowCount`/`columnCount` incluyen el formato
    // aplicado (puede llegar a la última fila de la hoja) y recorrerlos por índice no termina nunca.
    const filas: Celda[][] = [];
    hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
      const celdas: Celda[] = [];
      fila.eachCell({ includeEmpty: true }, (celda, col) => {
        celdas[col - 1] = valorCelda(celda.value);
      });
      for (let i = 0; i < celdas.length; i += 1) celdas[i] ??= null;
      while (filas.length < numero - 1) filas.push([]);
      filas.push(celdas);
    });
    libro.set(normalizarNombreHoja(hoja.name), filas);
  });
  return libro;
}

// ---- Normalizadores (spec §13.1.2) ----

export function texto(c: Celda | undefined): string {
  return c === null || c === undefined ? '' : String(c).replace(/\s+/g, ' ').trim();
}

export function numero(c: Celda | undefined): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  const t = texto(c).replace(/[$\s]/g, '').replace(/,/g, '');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Serial de Excel (46281 → 2026-09-16), ISO ya convertido por exceljs, o `dd/mm/aa`. */
export function fechaExcel(c: Celda | undefined): string | null {
  if (typeof c === 'number') {
    if (c < 20_000 || c > 80_000) return null;
    return isoDesdeDate(new Date(EPOCA_EXCEL + Math.round(c) * DIA_MS));
  }
  const t = texto(c);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (dmy) {
    const anio = dmy[3]!.length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return `${anio}-${pad(dmy[2]!)}-${pad(dmy[1]!)}`;
  }
  return null;
}

/** `SUL 470` → `SUL470`; devuelve null si no cumple `[A-Z]{3}[0-9]{3}`. */
export function normalizarPlaca(c: Celda | undefined): string | null {
  const t = texto(c)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}[0-9]{3}$/.test(t) ? t : null;
}

export type Marca = 'X' | 'SI' | 'NA' | 'NO';

/** Celdas de habilitación del TURNERO: `X`, `SI`, `NA`, `NA REP`, `NO`. Cualquier otra cosa es "sin dato". */
export function marca(c: Celda | undefined): Marca | null {
  const t = texto(c).toUpperCase();
  if (!t) return null;
  if (t === 'X') return 'X';
  if (t === 'SI') return 'SI';
  if (t === 'NO') return 'NO';
  if (t.startsWith('NA')) return 'NA';
  return null;
}

/** `TM - CA` → `TM`, `MM -CA` → `MM`. */
export function claseDe(c: Celda | undefined): ClaseVehiculo | null {
  const m = /^(C100|C350|C600|MM|TM|CBZ)\b/.exec(texto(c).toUpperCase());
  return m ? (m[1] as ClaseVehiculo) : null;
}

export function esCorreo(c: Celda | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(c));
}

/** Nombre canónico de destino/lugar: mayúsculas, espacios colapsados, sin guion final. */
export function nombreCanonico(c: Celda | undefined): string {
  return texto(c)
    .toUpperCase()
    .replace(/\s*-\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
