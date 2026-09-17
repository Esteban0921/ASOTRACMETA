# Despliegue en producción (TASK-0032, spec §15 y §18)

Un solo contenedor `asotracmet` sirve la API (`/api/v1`) y la web (build de Vite) con Node 24.
Postgres 16 y Redis 7 corren al lado con `infra/compose.prod.yaml`. Un proxy con TLS (Caddy o
Nginx) publica el puerto 3001 en `https://turnos.<dominio>`. Es el arranque "un VPS" de la spec;
Fly/Render usan la misma imagen (sección 7).

## 1. Artefactos

| Comando                | Produce                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm build`           | `apps/api/dist/index.mjs` (esbuild, ESM, dominio y shared empaquetados; fastify/pg/zod externos), `apps/web/dist/` (Vite), `dist/scripts/{migrate-db,seed-db}.mjs`, `docs/openapi.json` (contrato) |
| `docker build -t asotracmet .` | Imagen multi-stage: `pnpm install --frozen-lockfile` + `pnpm build` + `pnpm deploy --prod` de la API; runtime `node:24-alpine` sin `tsx` ni fuentes |

Sin Docker: `pnpm build && WEB_DIR=apps/web/dist PERSISTENCIA=postgres DATABASE_URL=… node apps/api/dist/index.mjs`.

## 2. Variables de entorno

Las de `.env.example`, más las que solo aplican en producción:

| Variable            | Obligatoria | Uso                                                                                         |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`       | sí          | firma de sesiones; 32+ caracteres aleatorios (`openssl rand -base64 32`)                    |
| `CIFRADO_CLAVE`     | sí          | AES-256-GCM de secretos TOTP y cuentas bancarias: 32 bytes en base64 (`openssl rand -base64 32`). **Perderla deja ilegibles los secretos TOTP y las cuentas: guardarla en el gestor de secretos.** |
| `DATABASE_URL`      | sí          | la arma el compose con `POSTGRES_PASSWORD`                                                 |
| `REDIS_URL`         | no          | lock distribuido `cola:{clase}` entre instancias (TASK-0020); la fija el compose (`redis://redis:6379`). `LOCK_TTL_MS` (10 s) acota un lock huérfano |
| `WEB_URL`           | sí          | base pública (`https://turnos.asotracmet.co`): va en los enlaces de acceso de los asociados |
| `CORS_ORIGINS`      | no          | por defecto `WEB_URL` (misma origen: la web la sirve la API)                               |
| `WEB_DIR`           | fija        | `/app/web` en la imagen                                                                     |
| `MIGRACIONES_DIR`   | fija        | `/app/migrations` en la imagen                                                              |
| `MENSAJERIA`        | no          | `consola` por defecto: lo que no tenga proveedor sale por el log del contenedor            |
| `SMTP_URL`          | correo      | `smtp://usuario:clave@host:587` o `smtps://…:465` (nodemailer): códigos, enlaces y avisos por correo |
| `SMTP_FROM`         | no          | remitente (`ASOTRACMET <turnos@asotracmet.co>`)                                           |
| `WHATSAPP_TOKEN`    | WhatsApp    | token de la WhatsApp Cloud API (Meta); con `WHATSAPP_PHONE_ID` activa el canal celular (opt-in por usuario). Fuera de la ventana de 24 h de una conversación Meta exige plantillas aprobadas: hasta tenerlas, el aviso puede no entregarse y queda `fallida` en la bandeja |
| `WHATSAPP_PHONE_ID` | WhatsApp    | id del número emisor en Meta                                                               |
| `NOTIFICACIONES_INTERVALO_MS` | no | cada cuánto el worker consume la outbox de avisos (5000)                                |
| `S3_BUCKET`         | soportes    | con `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (y `S3_FORCE_PATH_STYLE=true` en MinIO): los soportes HSEQ van al bucket con URLs prefirmadas (TASK-0043). Sin bucket, al volumen `soportes` (`SOPORTES_DIR=/app/datos/soportes`), que hay que incluir en los backups |
| `SOPORTE_MAX_BYTES` | no          | tamaño máximo de un soporte (10 MB)                                                        |
| `APP_PORT`          | no          | `127.0.0.1:3001`: solo el proxy local llega a la app                                        |
| `BACKUP_PASSPHRASE` | backups     | frase de cifrado de los backups; nunca en el servidor en claro (variable del cron)          |

`.env.prod` nunca se commitea (`.gitignore` ya excluye `.env.*`).

## 3. Primer despliegue en un VPS (Ubuntu 24.04)

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER

# 2. Código y secretos
git clone git@github.com:Esteban0921/ASOTRACMETA.git && cd ASOTRACMETA
cp .env.example .env.prod
# editar .env.prod: POSTGRES_PASSWORD, AUTH_SECRET, CIFRADO_CLAVE, WEB_URL

# 3. Levantar (la app aplica las migraciones pendientes al arrancar)
docker compose -f infra/compose.prod.yaml --env-file .env.prod up -d --build
docker compose -f infra/compose.prod.yaml --env-file .env.prod logs -f app   # "API lista en http://0.0.0.0:3001 (postgres)"
curl -fsS http://127.0.0.1:3001/healthz   # {"ok":true,"modo":"postgres"}

# 4. Datos iniciales: UNA de las dos opciones
#   a) semilla anonimizada (pruebas):   docker compose ... exec app node scripts/seed-db.mjs
#   b) Excel legado (real): desde una máquina con el xlsx y túnel a Postgres
#      ssh -L 5432:127.0.0.1:5432 vps   (publicando 127.0.0.1:5432 en el compose solo mientras dura la carga)
#      DATABASE_URL=postgres://asotracmet:…@localhost:5432/asotracmet AUTH_SECRET=… CIFRADO_CLAVE=… pnpm db:migrate-xlsx
#      (misma AUTH_SECRET/CIFRADO_CLAVE que la app: la semilla cifra con esa clave)
```

Proxy con TLS (Caddy, `/etc/caddy/Caddyfile`):

```
turnos.asotracmet.co {
  reverse_proxy 127.0.0.1:3001
  encode zstd gzip
}
```

## 4. Actualizar

```bash
git pull
docker compose -f infra/compose.prod.yaml --env-file .env.prod up -d --build app
```

Las migraciones son append-only (RULE-025): la app aplica las nuevas en el arranque y registra
`schema_migrations`. Si una migración falla, el contenedor no arranca y el anterior sigue en pie
solo si se hizo `up` sin `--force-recreate`; por eso el backup va antes de cada actualización.

## 5. Backups y restore (spec §15, §20.8)

```bash
# Cron del usuario (crontab -e), cada noche a las 03:00, con la frase fuera del repo:
0 3 * * * cd /srv/ASOTRACMETA && BACKUP_PASSPHRASE="$(cat /root/.asotracmet-backup)" scripts/backup-db.sh /srv/backups >> /var/log/asotracmet-backup.log 2>&1
# y copiar /srv/backups fuera del servidor (rclone a S3/Backblaze, o rsync a otra máquina).
```

- `scripts/backup-db.sh [carpeta]`: `pg_dump` → gzip → AES-256 (openssl, PBKDF2). Conserva 30 días.
- `scripts/restore-db.sh <archivo> [base]`: restaura en una base nueva (`asotracmet_restore`) y
  cuenta vehículos, TR y auditoría. Simulacro trimestral: restaurar, apuntar una app de staging a
  esa base y entrar. Para volver a producción: `docker compose … stop app`, restaurar en
  `asotracmet`, `start app`.
- Objetivo de la spec: restore en staging en menos de dos horas; con este flujo son minutos.

## 6. Operación

- Logs: `docker compose … logs -f app` (pino JSON, sin PII; los códigos de acceso salen aquí mientras
  `MENSAJERIA=consola`).
- Salud: `/healthz` (proceso) y `/readyz` (consulta a Postgres). El `HEALTHCHECK` de la imagen usa
  `/healthz`.
- Jobs: el proceso expira ofertas y encola avisos por tiempo cada minuto, entrega notificaciones
  cada 5 s y recalcula documentos cada noche (spec §14); no hay que programar nada aparte.
- Runbooks mínimos en ARCHITECTURE §14.

## 7. Fly.io / Render

La misma imagen sirve: `fly launch --dockerfile Dockerfile`, Postgres gestionado y las variables de
la sección 2 como secretos (`fly secrets set …`). En Render: servicio web desde el Dockerfile y una
base Postgres; `DATABASE_URL` la inyecta la plataforma. En ambos, `APP_PORT` no aplica y el proxy
TLS lo pone la plataforma.
