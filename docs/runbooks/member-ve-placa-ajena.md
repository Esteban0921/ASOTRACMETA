# Un asociado ve placas, ofertas o TR que no son suyos

**Es un incidente de seguridad** (AGENTS RULE-022): se atiende antes que cualquier otra cosa y se
abre una `TASK` con prioridad `crítica`.

**Contener (minutos).**

1. Revocar las sesiones del usuario afectado: `PATCH /usuarios/:id { activo: false }` como
   superadmin (revoca todas sus sesiones) o `POST /auth/logout` si es la propia.
2. Si el fallo es general (varios asociados), poner `PERSISTENCIA` en modo mantenimiento no existe:
   bajar la app (`docker compose … stop app`) hasta entender el alcance.

**Diagnosticar.** Tres capas deben coincidir; la que falle es el bug:

- **Placas del usuario**: `select * from usuario_vehiculos where usuario_id = '<id>'`. Si tiene
  placas que no son suyas, alguien las asignó: `GET /audit?entidad=usuarios&id=<id>` muestra quién
  (`usuario.vehiculos`).
- **Guard de la ruta**: toda ruta `own` lleva `exigir(recurso, permiso, { permitirOwn: true })` y
  filtra por `actor.vehiculoIds` (`/me/*`, `/viajes`, `/recaudos`, `/documentos/alertas`,
  `/export/viajes.csv`). Revisar el diff reciente de `apps/api/src/rutas/*.ts`.
- **RLS en la base**: con `set local role asotracmet_app; set local app.rol = 'member';
  set local app.vehiculo_ids = '<uuid>'` las tablas `cola_posiciones`, `ofertas`, `trs`, `viajes`,
  `recaudos`, `documentos` y `metricas_mes` deben filtrar solas. `pnpm test:db` cubre este caso
  («member no lee TR ajenos»); si pasa y en producción no, la API se está conectando como owner
  (que se salta RLS): confirmar `DATABASE_URL` y que `enLecturaPg`/`enEscrituraPg` hacen
  `set local role asotracmet_app`.

**Cerrar.** Corregir, añadir el caso al test de API y al de Postgres, y registrar en la `TASK`
qué datos vio quién y cuándo (la auditoría de lecturas no existe: reconstruirlo desde los logs de
acceso del proxy).
