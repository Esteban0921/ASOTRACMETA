import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Ubicación GPS en la web (ADR-0007, TASK-0065). El agente satélite no corre en los e2e: el lote
// se ingiere por la misma ruta que usaría él, con el token de desarrollo que acepta la API en modo
// memoria. Lo que se comprueba es el reparto de visibilidad del criterio §20.11: el coordinador ve
// la posición, el asociado solo la de sus placas y el veedor no recibe coordenadas.

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101';
const PASSWORD = 'Asotracmet2026!';
const TOKEN_GPS = 'token-gps-de-desarrollo';

const esMember = (email: string) => email.startsWith('member.');

async function codigoTotp(request: APIRequestContext, email: string) {
  const res = await request.get(`${API}/api/v1/__e2e/totp?email=${encodeURIComponent(email)}`);
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { codigo: string }).codigo;
}

async function login(page: Page, request: APIRequestContext, email: string) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  if (esMember(email)) {
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-info')).toBeVisible();
    const res = await request.get(
      `${API}/api/v1/__e2e/mensajes?para=${encodeURIComponent(email)}&con=enlace`,
    );
    const { enlace } = (await res.json()) as { enlace: string };
    await page.goto(enlace);
  } else {
    await page.getByTestId('login-password').fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('login-codigo').waitFor();
    await page.getByTestId('login-codigo').fill(await codigoTotp(request, email));
    await page.getByTestId('login-verificar').click();
  }
  await expect(page.getByTestId('logout')).toBeVisible();
}

/** Un lote como el que mandaría el agente, con la hora del servidor para que no se descarte. */
async function ingerir(request: APIRequestContext, placas: string[]) {
  const res = await request.post(`${API}/api/v1/gps/ubicaciones`, {
    headers: { authorization: `Bearer ${TOKEN_GPS}` },
    data: {
      loteId: crypto.randomUUID(),
      cuentaId: 'e2e',
      ubicaciones: placas.map((placa, i) => ({
        placa,
        latitud: 4.142 + i / 1000,
        longitud: -73.6266 + i / 1000,
        capturadaEn: new Date().toISOString(),
        proveedor: 'simulado',
      })),
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const cuerpo = (await res.json()) as { guardadas: number };
  expect(cuerpo.guardadas).toBe(placas.length);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/api/v1/__e2e/reset`);
  await ingerir(request, ['FST189', 'TKM221', 'SWI750']);
});

test('el coordinador ve en la cola qué placas están reportando', async ({ page, request }) => {
  await login(page, request, 'ops@asotracmet.test');
  await expect(page.getByTestId('ubicacion-FST189')).toContainText('Reportando');
});

test('el asociado ve la ubicación de sus placas y no la de otras', async ({ page, request }) => {
  await login(page, request, 'member.fst189@asotracmet.test');
  await expect(page.getByTestId('mis-ubicaciones')).toBeVisible();
  await expect(page.getByTestId('ubicacion-FST189')).toContainText('Reportando');
  await expect(page.getByTestId('ubicacion-FST189-mapa')).toBeVisible();
  // SWI750 es de otro asociado: ni siquiera llega a la pantalla.
  await expect(page.getByTestId('ubicacion-SWI750')).toHaveCount(0);
});

test('el veedor ve que el camión reporta, pero ninguna coordenada ni enlace a un mapa', async ({
  page,
  request,
}) => {
  await login(page, request, 'viewer@asotracmet.test');
  await expect(page.getByTestId('ubicacion-FST189')).toContainText('Reportando');
  await expect(page.getByTestId('ubicacion-FST189-coordenadas')).toHaveCount(0);
  await expect(page.getByTestId('ubicacion-FST189-mapa')).toHaveCount(0);
  // Y por si acaso: ningún enlace a un mapa externo en toda la página.
  await expect(page.locator('a[href*="google.com/maps"]')).toHaveCount(0);
});

test('el mapa de la flota carga aparte y el veedor no lo ve', async ({ page, request }) => {
  // Las teselas vienen de un tercero: en los tests no se piden (ni para no molestar al servidor
  // público, ni para que el resultado dependa de la red).
  await page.route('**/tile.openstreetmap.org/**', (ruta) => ruta.abort());

  await login(page, request, 'ops@asotracmet.test');
  await page.getByTestId('nav-mapa').click();
  await expect(page.getByTestId('mapa-lienzo')).toBeVisible();
  await expect(page.getByTestId('mapa-resumen')).toContainText('placas con ubicación');

  await page.getByTestId('logout').click();
  await login(page, request, 'viewer@asotracmet.test');
  // Sin coordenadas no hay mapa que pintar: el enlace ni aparece.
  await expect(page.getByTestId('nav-mapa')).toHaveCount(0);
});
