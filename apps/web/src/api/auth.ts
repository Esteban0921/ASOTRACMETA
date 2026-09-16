import { api } from './cliente';
import type { RespuestaLogin, Sesion } from './tipos';

// Flujos de acceso (spec §3.3). Roles internos: contraseña + código de la app de autenticación,
// o código de un solo uso por correo. Asociados: enlace mágico.

export function login(email: string, password: string): Promise<RespuestaLogin> {
  return api<RespuestaLogin>('/auth/login', {
    method: 'POST',
    body: { email, password: password || undefined },
  });
}

export function verificarTotp(challenge: string, codigo: string): Promise<Sesion> {
  return api<Sesion>('/auth/2fa/verify', { method: 'POST', body: { challenge, codigo } });
}

export function verificarOtp(email: string, codigo: string): Promise<Sesion> {
  return api<Sesion>('/auth/otp/verify', { method: 'POST', body: { email, codigo } });
}

export function canjearEnlace(token: string): Promise<Sesion> {
  return api<Sesion>('/auth/magic-link/canjear', { method: 'POST', body: { token } });
}

/** Re-autenticación para acciones sensibles: abre una ventana corta con contraseña o código TOTP. */
export function reauth(credencial: {
  password?: string;
  codigo?: string;
}): Promise<{ reauthHasta: string }> {
  return api<{ reauthHasta: string }>('/auth/reauth', { method: 'POST', body: credencial });
}
