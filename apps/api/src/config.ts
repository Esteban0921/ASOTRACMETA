export interface Config {
  port: number;
  host: string;
  authSecret: string;
  corsOrigins: string[];
  /** Modo e2e: seed determinista + endpoint de reset. Nunca en producción. */
  modoE2e: boolean;
  logger: boolean;
  /** Intentos de login por minuto y por IP (spec §12 rate limit). */
  loginRateLimitMax: number;
}

export function cargarConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
): Config {
  const modoE2e = argv.includes('--e2e') || env.ASOTRACMET_E2E === '1';
  return {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? '127.0.0.1',
    authSecret: env.AUTH_SECRET ?? 'secreto-de-desarrollo-no-usar-en-produccion',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
    modoE2e,
    logger: env.LOG_LEVEL !== 'silent',
    loginRateLimitMax: Number(env.LOGIN_RATE_LIMIT_MAX ?? (modoE2e ? 1000 : 10)),
  };
}
