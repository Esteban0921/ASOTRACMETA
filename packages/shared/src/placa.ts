import { z } from 'zod';

/** Placa colombiana de vehículo pesado: tres letras + tres dígitos (`SUL470`). */
export const PLACA_REGEX = /^[A-Z]{3}[0-9]{3}$/;

/** `SUL 470` → `SUL470`, `sps-413` → `SPS413`. */
export function normalizarPlaca(entrada: string): string {
  return entrada.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function esPlacaValida(placa: string): boolean {
  return PLACA_REGEX.test(placa);
}

export const PlacaSchema = z
  .string()
  .trim()
  .transform(normalizarPlaca)
  .pipe(z.string().regex(PLACA_REGEX, 'Placa inválida: se espera formato AAA123'));
