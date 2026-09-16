-- Sesiones opacas y revocables + índices de códigos de un solo uso (TASK-0021, spec §3.3).

create table sesiones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id) on delete cascade,
  rol text not null check (rol in ('superadmin', 'admin_ops', 'admin_hseq', 'admin_finance', 'viewer', 'member')),
  token_hash text not null unique,      -- el token nunca se guarda, solo su hash
  creada_en timestamptz not null default now(),
  expira_en timestamptz not null,       -- superadmin 4 h, admin_* 8 h, viewer 12 h, member 7 d
  revocada_en timestamptz,              -- logout o baja: la sesion deja de valer al instante
  reauth_hasta timestamptz,             -- ventana de re-autenticacion para acciones sensibles
  user_agent text,
  ip inet
);

create index sesiones_usuario on sesiones (usuario_id, expira_en desc);

-- otp_codes (0003) guarda hashes con clave de: codigos por correo (login), enlaces magicos
-- (magic_link) y re-autenticacion (reauth). Indices para "el mas reciente vigente" y "por hash".
create index otp_codes_usuario_proposito on otp_codes (usuario_id, proposito, created_at desc);
create index otp_codes_hash on otp_codes (codigo_hash);

-- refresh_tokens (0003) queda sustituida por sesiones: una sola nocion de sesion revocable.
drop table if exists refresh_tokens;

grant select, insert, update, delete on sesiones to asotracmet_app;
