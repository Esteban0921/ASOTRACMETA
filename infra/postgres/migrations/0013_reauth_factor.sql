-- Con que factor se re-autentico la sesion (TASK-0024): el reset de cola exige el segundo factor
-- cuando el parametro reset_cola_requiere_2fa esta activo (spec §9.2, §10).
alter table sesiones add column reauth_factor text check (reauth_factor in ('password', 'totp'));
