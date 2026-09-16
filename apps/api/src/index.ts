import { fechaLocal } from '@asotracmet/shared';
import { construirApp } from './app.js';
import { mesAnterior, tableroDe } from './rutas/tablero.js';

const { app, motor, config, actorSistema, almacenamiento, reloj } = await construirApp();

// Job §14: expirar ofertas cada minuto, con el usuario de servicio como autor.
const job = setInterval(() => {
  motor
    .expirarOfertas(actorSistema)
    .catch((error: unknown) => app.log.error(error, 'job expirar-ofertas'));
}, 60_000);
job.unref();

// Job §14: recalcular `documentos.estado` cada noche (y al arrancar), con el rol de servicio.
const DIA_MS = 24 * 60 * 60 * 1000;
async function recalcularDocumentos(): Promise<void> {
  const { timezone } = await almacenamiento.consultas.parametros();
  const hoy = fechaLocal(reloj.ahora(), timezone);
  const recalculados = await almacenamiento.maestros.recalcularEstadosDocumentos(hoy);
  app.log.info({ hoy, recalculados }, 'job recalcular-documentos');
  // Día 1 de cada mes: snapshot de equidad del mes que cerró (§14, `metricas_mes`).
  if (hoy.endsWith('-01')) {
    const mes = mesAnterior(hoy.slice(0, 7));
    const tablero = await tableroDe(almacenamiento, mes);
    await almacenamiento.metricas.guardarSnapshot({
      mes,
      generadoEn: reloj.ahora().toISOString(),
      filas: tablero.equidad,
    });
    app.log.info({ mes, placas: tablero.equidad.length }, 'job snapshot-metricas');
  }
}
const nocturno = setTimeout(() => {
  void recalcularDocumentos().catch((error: unknown) =>
    app.log.error(error, 'job recalcular-documentos'),
  );
  const diario = setInterval(() => {
    void recalcularDocumentos().catch((error: unknown) =>
      app.log.error(error, 'job recalcular-documentos'),
    );
  }, DIA_MS);
  diario.unref();
}, 60_000);
nocturno.unref();

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(senal, () => {
    clearInterval(job);
    clearTimeout(nocturno);
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `API lista en http://${config.host}:${config.port} (${config.modoE2e ? 'modo e2e' : config.persistencia})`,
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
