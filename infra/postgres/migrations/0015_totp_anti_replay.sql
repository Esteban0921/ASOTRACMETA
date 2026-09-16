-- Anti-replay del código TOTP (TASK-0040, RFC 6238 §5.2): se guarda el último paso de 30 s aceptado
-- por usuario (login o re-autenticación) y se rechaza cualquier código de un paso igual o anterior.
alter table usuarios add column totp_ultimo_paso bigint;
comment on column usuarios.totp_ultimo_paso is
  'Último paso TOTP aceptado; un código no vale dos veces dentro de su ventana (TASK-0040)';
