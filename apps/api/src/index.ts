import { construirApp } from './app.js';

const { app, motor, config } = await construirApp();

// Job §14: expirar ofertas cada minuto.
const job = setInterval(() => {
  motor.expirarOfertas().catch((error: unknown) => app.log.error(error, 'job expirar-ofertas'));
}, 60_000);
job.unref();

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `API lista en http://${config.host}:${config.port} (${config.modoE2e ? 'modo e2e' : 'memoria'})`,
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
