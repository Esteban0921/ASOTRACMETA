import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hexARgb,
  luminanciaRelativa,
  parsearTokens,
  ratioContraste,
  resolverToken,
  type MapaTokens,
} from './contraste';

// Contraste de los tokens "Llano Abierto" (brief §1, TASK-0044): cada par texto/fondo del sistema
// cumple WCAG AA (4,5:1) en claro y en oscuro; `--texto-3` y el anillo de foco solo exigen 3:1
// porque se usan a ≥ 18 px o como indicador no textual (§1.4.11).

// Se lee del disco: con `css: false` en vitest el plugin de CSS vacía cualquier import, incluso `?raw`.
const css = readFileSync(path.resolve(__dirname, 'tokens.css'), 'utf8');
const tokens = parsearTokens(css);

const AA = 4.5;
const GRANDE = 3;
const TONOS = ['ambar', 'verde', 'rojo', 'gris', 'info', 'marca'] as const;

interface Par {
  texto: string;
  fondo: string;
  minimo: number;
}

const pares: Par[] = [
  { texto: '--texto', fondo: '--fondo', minimo: AA },
  { texto: '--texto', fondo: '--superficie', minimo: AA },
  { texto: '--texto', fondo: '--superficie-2', minimo: AA },
  { texto: '--texto-2', fondo: '--fondo', minimo: AA },
  { texto: '--texto-2', fondo: '--superficie', minimo: AA },
  { texto: '--texto-2', fondo: '--superficie-2', minimo: AA },
  { texto: '--texto-3', fondo: '--fondo', minimo: GRANDE },
  { texto: '--texto-3', fondo: '--superficie', minimo: GRANDE },
  { texto: '--enlace', fondo: '--fondo', minimo: AA },
  { texto: '--enlace', fondo: '--superficie', minimo: AA },
  { texto: '--accion-texto', fondo: '--accion', minimo: AA },
  { texto: '--accion-texto', fondo: '--accion-hover', minimo: AA },
  { texto: '--sobre-marca', fondo: '--marca-900', minimo: AA },
  { texto: '--sobre-marca', fondo: '--marca-800', minimo: AA },
  { texto: '--sobre-marca-2', fondo: '--marca-900', minimo: AA },
  { texto: '--sobre-marca-2', fondo: '--marca-800', minimo: AA },
  { texto: '--sobre-marca', fondo: '--cabecera-fondo', minimo: AA },
  { texto: '--foco-sobre-marca', fondo: '--marca-900', minimo: GRANDE },
  { texto: '--foco-sobre-marca', fondo: '--marca-800', minimo: GRANDE },
  { texto: '--foco', fondo: '--fondo', minimo: GRANDE },
  { texto: '--foco', fondo: '--superficie', minimo: GRANDE },
  ...TONOS.flatMap((tono): Par[] => [
    { texto: `--${tono}-texto`, fondo: `--${tono}-fondo`, minimo: AA },
    { texto: `--${tono}-solido-texto`, fondo: `--${tono}-solido`, minimo: AA },
  ]),
];

function describirModo(nombre: string, mapa: MapaTokens) {
  describe(nombre, () => {
    it.each(pares.map((p) => [p.texto, p.fondo, p.minimo] as const))(
      '%s sobre %s ≥ %s:1',
      (texto, fondo, minimo) => {
        const ratio = ratioContraste(resolverToken(texto, mapa), resolverToken(fondo, mapa));
        expect(
          ratio,
          `${texto} (${resolverToken(texto, mapa)}) sobre ${fondo} (${resolverToken(fondo, mapa)}) da ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(minimo);
      },
    );
  });
}

describe('tokens.css', () => {
  describirModo('modo claro', tokens.claro);
  describirModo('modo oscuro (sistema)', tokens.oscuroSistema);
  describirModo('modo oscuro (elegido)', tokens.oscuroElegido);

  it('los dos bloques oscuros son idénticos (media query y data-tema)', () => {
    expect([...tokens.oscuroElegido.entries()]).toEqual([...tokens.oscuroSistema.entries()]);
  });

  it('el oscuro redefine todos los tokens de color del claro que dependen del modo', () => {
    const cambian = [
      '--fondo',
      '--superficie',
      '--superficie-2',
      '--borde',
      '--borde-fuerte',
      '--texto',
      '--texto-2',
      '--texto-3',
      '--accion',
      '--enlace',
      '--foco',
      ...TONOS.filter((t) => t !== 'marca').flatMap((t) => [`--${t}-texto`, `--${t}-fondo`]),
    ];
    for (const nombre of cambian) {
      expect(tokens.oscuroSistema.get(nombre), nombre).not.toBe(tokens.claro.get(nombre));
    }
  });

  it('respeta la tabla del brief en los tokens de referencia', () => {
    expect(resolverToken('--fondo', tokens.claro)).toBe('#f5f4ef');
    expect(resolverToken('--marca-800', tokens.claro)).toBe('#0f3d3e');
    expect(resolverToken('--accion', tokens.claro)).toBe('#16514e');
    expect(resolverToken('--ambar-solido', tokens.claro)).toBe('#d98324');
    expect(resolverToken('--fondo', tokens.oscuroSistema)).toBe('#0e1514');
    expect(resolverToken('--accion', tokens.oscuroSistema)).toBe('#2e7469');
    expect(resolverToken('--foco', tokens.oscuroSistema)).toBe('#f2b266');
  });

  it('declara la escala tipográfica, espaciado, radios, movimiento y capas', () => {
    for (const nombre of [
      '--t-xs',
      '--t-sm',
      '--t-md',
      '--t-base',
      '--t-lg',
      '--t-xl',
      '--t-2xl',
      '--t-3xl',
      '--t-display',
      '--e-1',
      '--e-12',
      '--r-s',
      '--r-pill',
      '--sombra-1',
      '--sombra-3',
      '--dur-1',
      '--dur-3',
      '--curva',
      '--z-sticky',
      '--z-toast',
    ]) {
      expect(tokens.claro.has(nombre), nombre).toBe(true);
    }
  });
});

describe('contraste', () => {
  it('convierte hexadecimales de 3 y 6 dígitos', () => {
    expect(hexARgb('#fff')).toEqual([255, 255, 255]);
    expect(hexARgb('#0F3D3E')).toEqual([15, 61, 62]);
    expect(() => hexARgb('rojo')).toThrow();
  });

  it('calcula la luminancia y el ratio de referencia (negro sobre blanco = 21)', () => {
    expect(luminanciaRelativa('#000000')).toBe(0);
    expect(luminanciaRelativa('#ffffff')).toBeCloseTo(1, 5);
    expect(ratioContraste('#000', '#fff')).toBeCloseTo(21, 5);
    expect(ratioContraste('#fff', '#000')).toBeCloseTo(21, 5);
  });

  it('el ámbar sólido del brief no admite texto blanco: por eso tiene texto oscuro', () => {
    expect(ratioContraste('#ffffff', '#d98324')).toBeLessThan(AA);
    expect(ratioContraste('#1a2321', '#d98324')).toBeGreaterThanOrEqual(AA);
  });
});
