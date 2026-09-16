# ADR-0003 — Autenticación de desarrollo (password + token HMAC) antes de OTP/2FA

- Estado: aceptada (2026-09-16); se sustituye con TASK-0021
- Referencias: spec §3.3, §12; ARCHITECTURE §6.2

## Contexto

Los tests de RBAC, scope `own` y los e2e por rol necesitan sesiones reales por rol desde el primer
día. La spec exige OTP + 2FA para admins y magic link para asociados, que requieren correo/SMS y
almacenamiento de tokens que todavía no existen.

## Decisión

Login con email + contraseña (scrypt con salt) que emite un token firmado HMAC-SHA256 con expiración
por rol (`DURACION_SESION_HORAS`). Sin dependencias externas. Las contraseñas solo existen en el seed
de desarrollo. Rate limit en login.

## Alternativas descartadas

- **JWT con librería**: no aporta nada sobre HMAC propio en esta fase y añade superficie.
- **Sin auth hasta la fase producto**: dejaría sin probar el guard RBAC y el scope de member, que
  son criterios de aceptación del producto (§20.1, §20.2).

## Consecuencias

- El contrato `Authorization: Bearer` y `request.actor` no cambian al migrar a OTP/2FA.
- Pendiente en TASK-0021: OTP por correo, TOTP para admin/superadmin, magic link para member,
  refresh tokens con revocación, re-auth para reset de cola, cookies httpOnly + CSRF si se abandona
  el bearer puro.
