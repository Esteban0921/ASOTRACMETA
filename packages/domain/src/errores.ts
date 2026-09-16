import type { CodigoError } from '@asotracmet/shared';

export class ErrorDominio extends Error {
  readonly code: CodigoError;
  readonly details: Record<string, unknown>;

  constructor(code: CodigoError, message?: string, details: Record<string, unknown> = {}) {
    super(message ?? code);
    this.name = 'ErrorDominio';
    this.code = code;
    this.details = details;
  }
}

export function esErrorDominio(error: unknown): error is ErrorDominio {
  return error instanceof ErrorDominio;
}
