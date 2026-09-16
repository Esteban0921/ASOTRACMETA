# Restaurar un backup y simulacro trimestral (spec §15, §20.8)

Objetivo de la spec: restore en staging en menos de dos horas, una vez por trimestre.

**Backups.** `scripts/backup-db.sh` corre cada noche por cron (ver `docs/despliegue.md` §5):
`pg_dump` → gzip → AES-256 con `BACKUP_PASSPHRASE`, 30 días de retención, copia fuera del
servidor.

**Simulacro (staging).**

1. Traer el backup más reciente al servidor de staging.
2. `BACKUP_PASSPHRASE=… scripts/restore-db.sh backups/asotracmet-<fecha>.sql.gz.enc asotracmet_restore`
   restaura en una base nueva y cuenta vehículos, TR y auditoría.
3. Anonimizar la copia (spec §15: staging nunca con datos ni claves reales):
   `DATABASE_URL=…/asotracmet_restore pnpm db:anonymize-staging --confirmo asotracmet_restore`.
   Reemplaza nombres, documentos, celulares, correos y direcciones por valores deterministas,
   borra cuentas bancarias, secretos TOTP y sesiones, vacía la PII de la auditoría de maestros e IAM
   y deja los roles internos con la contraseña de desarrollo (re-enrolan el segundo factor al
   entrar). Rechaza por nombre la base de producción.
4. Apuntar la app de staging a esa base (`DATABASE_URL=…/asotracmet_restore`, `AUTH_SECRET` y
   `CIFRADO_CLAVE` propias), arrancar y entrar como `ops@`: la cola, los TR y el resumen de
   finance deben coincidir con producción a la hora del backup.
5. Anotar en la `TASK-0035` la fecha, el tamaño del backup y el tiempo total.

**Volver a producción con un backup (desastre).**

1. `docker compose -f infra/compose.prod.yaml --env-file .env.prod stop app`.
2. Restaurar sobre `asotracmet` (parámetro 2 del script) tras renombrar la actual:
   `alter database asotracmet rename to asotracmet_roto`.
3. `start app`: aplica migraciones pendientes al arrancar y `/readyz` debe responder `ok`.
4. Revisar `parametros.secuencia_tr` contra el mayor TR real (ver
   [secuencia-tr-desfasada.md](secuencia-tr-desfasada.md)).
