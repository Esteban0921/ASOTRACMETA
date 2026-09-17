import { mkdirSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { CONTRATO } from '@asotracmet/api/openapi/contrato';
import { construirOpenApi, refsColgantes } from '@asotracmet/api/openapi/documento';
import { VERSION_CONTRATO } from '@asotracmet/api/openapi/version';

// `pnpm build:contrato` — escribe docs/openapi.json (el mismo documento que sirve
// GET /api/v1/openapi.json). CI comprueba que esté al día (`git diff --exit-code`).

const documento = construirOpenApi(CONTRATO, { version: VERSION_CONTRATO });
const colgantes = refsColgantes(documento);
if (colgantes.length > 0) {
  console.error(`Referencias sin componente: ${colgantes.join(', ')}`);
  process.exit(1);
}
mkdirSync('docs', { recursive: true });
const destino = 'docs/openapi.json';
const estilo = (await resolveConfig(destino)) ?? {};
const json = await format(JSON.stringify(documento, null, 2), {
  ...estilo,
  parser: 'json',
  filepath: destino,
});
writeFileSync(destino, json, 'utf-8');
const rutas = Object.keys(documento.paths as Record<string, unknown>).length;
const esquemas = Object.keys(
  (documento.components as { schemas: Record<string, unknown> }).schemas,
).length;
console.log(`docs/openapi.json: ${rutas} rutas, ${esquemas} esquemas (v${VERSION_CONTRATO}).`);
