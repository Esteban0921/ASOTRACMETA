/**
 * Contraste WCAG 2.x (luminancia relativa, §1.4.3 y §1.4.11) y lectura de tokens.css.
 * Lo usa tokens.test.ts para que ningún par texto/fondo del sistema baje de AA en ninguno de los
 * dos modos (TASK-0044). Sin dependencias: solo hexadecimales de 3 o 6 dígitos.
 */

export type Rgb = readonly [number, number, number];

export function hexARgb(hex: string): Rgb {
  const limpio = hex.trim().replace(/^#/, '');
  const largo =
    limpio.length === 3
      ? limpio
          .split('')
          .map((c) => c + c)
          .join('')
      : limpio;
  if (!/^[0-9a-f]{6}$/i.test(largo)) throw new Error(`Color no hexadecimal: ${hex}`);
  return [
    Number.parseInt(largo.slice(0, 2), 16),
    Number.parseInt(largo.slice(2, 4), 16),
    Number.parseInt(largo.slice(4, 6), 16),
  ];
}

function canalLineal(valor: number): number {
  const s = valor / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa (0 = negro, 1 = blanco) según WCAG 2.x. */
export function luminanciaRelativa(hex: string): number {
  const [r, g, b] = hexARgb(hex);
  return 0.2126 * canalLineal(r) + 0.7152 * canalLineal(g) + 0.0722 * canalLineal(b);
}

/** Ratio de contraste entre dos colores, siempre ≥ 1 (21 = negro sobre blanco). */
export function ratioContraste(a: string, b: string): number {
  const la = luminanciaRelativa(a);
  const lb = luminanciaRelativa(b);
  const [claro, oscuro] = la >= lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

export type MapaTokens = ReadonlyMap<string, string>;

/** Declaraciones `--nombre: valor;` de un bloque CSS (valores multilínea incluidos). */
function declaraciones(bloque: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const coincidencia of bloque.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    mapa.set(`--${coincidencia[1] ?? ''}`, (coincidencia[2] ?? '').replace(/\s+/g, ' ').trim());
  }
  return mapa;
}

/** Texto entre las llaves que siguen al selector dado (soporta llaves anidadas). */
function bloqueDe(css: string, selector: string): string {
  const inicio = css.indexOf(selector);
  if (inicio < 0) throw new Error(`No se encontró el selector ${selector} en tokens.css`);
  const apertura = css.indexOf('{', inicio);
  let nivel = 0;
  for (let i = apertura; i < css.length; i += 1) {
    if (css[i] === '{') nivel += 1;
    if (css[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return css.slice(apertura + 1, i);
    }
  }
  throw new Error(`Bloque sin cerrar para ${selector}`);
}

export interface TokensPorModo {
  claro: MapaTokens;
  /** Oscuro por preferencia del sistema (`@media (prefers-color-scheme: dark)`). */
  oscuroSistema: MapaTokens;
  /** Oscuro elegido por el usuario (`:root[data-tema='oscuro']`). */
  oscuroElegido: MapaTokens;
}

/** Lee los tres bloques de tokens.css. El oscuro hereda del claro lo que no redefine. */
export function parsearTokens(css: string): TokensPorModo {
  const claro = declaraciones(bloqueDe(css, ':root {'));
  const sistema = declaraciones(bloqueDe(css, ":root:not([data-tema='claro'])"));
  const elegido = declaraciones(bloqueDe(css, ":root[data-tema='oscuro']"));
  return {
    claro,
    oscuroSistema: new Map([...claro, ...sistema]),
    oscuroElegido: new Map([...claro, ...elegido]),
  };
}

/** Resuelve `var(--x)` en cadena hasta llegar a un valor literal. */
export function resolverToken(nombre: string, tokens: MapaTokens): string {
  let valor = tokens.get(nombre);
  let saltos = 0;
  while (valor !== undefined) {
    const referencia = /^var\((--[\w-]+)\)$/.exec(valor);
    if (!referencia) return valor;
    valor = tokens.get(referencia[1] ?? '');
    saltos += 1;
    if (saltos > 10) throw new Error(`Referencia circular en ${nombre}`);
  }
  throw new Error(`Token sin definir: ${nombre}`);
}
