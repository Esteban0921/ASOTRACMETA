-- IAM (spec §6.1, §3).

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  telefono text,
  nombre text not null,
  password_hash text, -- null si magic link
  rol text not null check (rol in ('superadmin', 'admin_ops', 'admin_hseq', 'admin_finance', 'viewer', 'member')),
  activo boolean not null default true,
  asociado_id uuid references asociados (id),
  totp_secret_enc text, -- 2FA para admin_* y superadmin
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table usuario_vehiculos (
  usuario_id uuid not null references usuarios (id) on delete cascade,
  vehiculo_id uuid not null references vehiculos (id),
  primary key (usuario_id, vehiculo_id)
);

create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id) on delete cascade,
  token_hash text not null unique,
  expira_en timestamptz not null,
  revocado_en timestamptz,
  user_agent text,
  ip inet,
  created_at timestamptz not null default now()
);

create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id) on delete cascade,
  codigo_hash text not null,
  proposito text not null check (proposito in ('login', 'magic_link', 'reauth')),
  expira_en timestamptz not null,
  usado_en timestamptz,
  intentos int not null default 0,
  created_at timestamptz not null default now()
);
