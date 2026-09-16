#!/usr/bin/env sh
# Restaura un backup cifrado en la base indicada (TASK-0032, spec §15 y §20.8: simulacro < 2 h).
#   BACKUP_PASSPHRASE=... scripts/restore-db.sh backups/asotracmet-20260916T030000Z.sql.gz.enc [asotracmet_restore]
# Por defecto restaura en una base NUEVA (asotracmet_restore) para no pisar producción; para volver
# a producción, parar la app, restaurar en `asotracmet` y arrancar (ver docs/despliegue.md).
set -eu

ARCHIVO="${1:?Ruta del backup .sql.gz.enc}"
BASE="${2:-asotracmet_restore}"
: "${BACKUP_PASSPHRASE:?Define BACKUP_PASSPHRASE}"
COMPOSE="${COMPOSE:-docker compose -f infra/compose.prod.yaml --env-file .env.prod}"

$COMPOSE exec -T postgres psql -U asotracmet -d postgres -v ON_ERROR_STOP=1 \
  -c "drop database if exists $BASE" -c "create database $BASE"

openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$ARCHIVO" \
  | gunzip \
  | $COMPOSE exec -T postgres psql -U asotracmet -d "$BASE" -v ON_ERROR_STOP=1 -q

$COMPOSE exec -T postgres psql -U asotracmet -d "$BASE" -tAc \
  "select 'vehiculos=' || count(*) from vehiculos union all select 'trs=' || count(*) from trs union all select 'audit_log=' || count(*) from audit_log"
echo "Restaurado en la base $BASE"
