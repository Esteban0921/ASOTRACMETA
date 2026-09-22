/**
 * Marca propia "Llano Abierto" (brief §1, TASK-0044): monograma "A" formado por dos líneas de
 * carretera que convergen en el horizonte, con el sol ocre amaneciendo entre ellas. Las carreteras
 * heredan `currentColor` (paper sobre marca, marca sobre papel); el sol siempre es ocre.
 * public/icono.svg y los PNG 192/512 se generan del mismo dibujo (scripts/iconos-pwa.ts).
 */

interface Props {
  variante?: 'completa' | 'simbolo';
  /** Lado del símbolo en px. */
  tamano?: number;
  className?: string;
}

export const OCRE_SOL = '#f0b64a';

export function SimboloMarca({ tamano = 28 }: { tamano?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={tamano}
      height={tamano}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 54 L32 14 L52 54" strokeWidth="5.5" />
      <path d="M8 40 H56" strokeWidth="3.5" />
      <path d="M25.5 40 A6.5 6.5 0 0 1 38.5 40 Z" fill={OCRE_SOL} stroke="none" />
    </svg>
  );
}

export function Marca({ variante = 'completa', tamano = 28, className }: Props) {
  return (
    <span
      className={['marca', `marca-${variante}`, className].filter(Boolean).join(' ')}
      role="img"
      aria-label="ASOTRACMET · Enturnamiento"
    >
      <SimboloMarca tamano={tamano} />
      {variante === 'completa' && (
        <span className="marca-texto" aria-hidden="true">
          <span className="marca-nombre">ASOTRACMET</span>
          <span className="marca-lema">Enturnamiento</span>
        </span>
      )}
    </span>
  );
}
