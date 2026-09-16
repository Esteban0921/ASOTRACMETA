// Enmascarado de PII para roles con `R*` (spec §3.2, §12).

/** `1012341658` → `******1658`. */
export function enmascararDocumento(documento: string | null | undefined): string | null {
  if (!documento) return null;
  const visibles = documento.slice(-4);
  return `${'*'.repeat(Math.max(documento.length - 4, 2))}${visibles}`;
}

/** `3101234567` → `*******567`. */
export function enmascararCelular(celular: string | null | undefined): string | null {
  if (!celular) return null;
  return `${'*'.repeat(Math.max(celular.length - 3, 2))}${celular.slice(-3)}`;
}

/** Nombre visible completo, nunca recortado (`ELKIN GIOVANNI MOYA DUARTE · SOF336`). */
export function etiquetaAsociadoPlaca(nombreCompleto: string, placa: string): string {
  return `${nombreCompleto.trim().toUpperCase()} · ${placa}`;
}
