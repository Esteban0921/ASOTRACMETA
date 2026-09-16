#!/usr/bin/env sh
# Backup cifrado de Postgres en producción (TASK-0032, spec §15).
#   BACKUP_PASSPHRASE=... scripts/backup-db.sh [carpeta_destino]
# Usa el contenedor de infra/compose.prod.yaml; el archivo queda cifrado con AES-256 (openssl, PBKDF2).
# Programarlo en cron cada noche y copiar la carpeta fuera del servidor (rclone, S3, otro VPS).
set -eu

DESTINO="${1:-backups}"
: "${BACKUP_PASSPHRASE:?Define BACKUP_PASSPHRASE (frase de cifrado; guárdala fuera del servidor)}"
COMPOSE="${COMPOSE:-docker compose -f infra/compose.prod.yaml --env-file .env.prod}"
FECHA="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVO="$DESTINO/asotracmet-$FECHA.sql.gz.enc"

mkdir -p "$DESTINO"
$COMPOSE exec -T postgres pg_dump -U asotracmet --no-owner --no-privileges asotracmet \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$ARCHIVO"

echo "Backup escrito: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"
# Conserva los últimos 30 días.
find "$DESTINO" -name 'asotracmet-*.sql.gz.enc' -mtime +30 -delete
