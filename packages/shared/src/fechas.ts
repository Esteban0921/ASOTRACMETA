/** Fecha de negocio `YYYY-MM-DD` en la zona horaria del parámetro `timezone`. */
export function fechaLocal(instante: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

export function sumarMinutos(instante: Date, minutos: number): Date {
  return new Date(instante.getTime() + minutos * 60_000);
}

export function sumarHoras(instante: Date, horas: number): Date {
  return sumarMinutos(instante, horas * 60);
}

export const FECHA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
