import { claveDesdeEntorno } from './auth/cifrado.js';

export interface Config {
  port: number;
  host: string;
  authSecret: string;
  corsOrigins: string[];
  /** Modo e2e: seed determinista + endpoints de reset y de lectura de códigos. Nunca en producción. */
  modoE2e: boolean;
  logger: boolean;
  /** Intentos de login por minuto y por IP (spec §12 rate limit). */
  loginRateLimitMax: number;
  /** `memoria` es la fase puente; `postgres` requiere DATABASE_URL migrada y sembrada. */
  persistencia: 'memoria' | 'postgres';
  databaseUrl: string | null;
  /** AES-256-GCM para secretos TOTP y datos sensibles (spec §12). */
  claveCifrado: Buffer;
  /** Base pública de la web para los enlaces de acceso (`/entrar?token=`). */
  urlWeb: string;
  /** Carpeta con el build de la web (`apps/web/dist`). Si se define, la API la sirve (producción). */
  webDir: string | null;
  /** Canal de códigos y enlaces: `consola` (dev, salen por el log) o `memoria` (tests/e2e). */
  mensajeria: 'consola' | 'memoria';
  otpTtlMinutos: number;
  magicLinkTtlMinutos: number;
  challengeTtlMinutos: number;
  reauthMinutos: number;
  maxIntentosOtp: number;
}

export function cargarConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
): Config {
  const modoE2e = argv.includes('--e2e') || env.ASOTRACMET_E2E === '1';
  const persistencia = env.PERSISTENCIA === 'postgres' && !modoE2e ? 'postgres' : 'memoria';
  const corsOrigins = (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim());
  return {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? '127.0.0.1',
    authSecret: env.AUTH_SECRET ?? 'secreto-de-desarrollo-no-usar-en-produccion',
    corsOrigins,
    modoE2e,
    logger: env.LOG_LEVEL !== 'silent',
    loginRateLimitMax: Number(env.LOGIN_RATE_LIMIT_MAX ?? (modoE2e ? 1000 : 10)),
    persistencia,
    databaseUrl: env.DATABASE_URL ?? null,
    claveCifrado: claveDesdeEntorno(env),
    urlWeb: env.WEB_URL ?? corsOrigins[0] ?? 'http://localhost:5173',
    webDir: env.WEB_DIR ? env.WEB_DIR : null,
    mensajeria: env.MENSAJERIA === 'memoria' || modoE2e ? 'memoria' : 'consola',
    otpTtlMinutos: Number(env.OTP_TTL_MINUTOS ?? 10),
    magicLinkTtlMinutos: Number(env.MAGIC_LINK_TTL_MINUTOS ?? 15),
    challengeTtlMinutos: 5,
    reauthMinutos: Number(env.REAUTH_MINUTOS ?? 5),
    maxIntentosOtp: 5,
  };
}
