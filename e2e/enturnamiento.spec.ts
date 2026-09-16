import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// E2E del loop que no puede mentir (spec §16, §22): login ops → ofrecer → login member → aceptar → aparece TR.
// La API corre en modo e2e (almacén en memoria + seed determinista) y se resetea antes de cada test.

const API = 'http://127.0.0.1:3001';
const PASSWORD = 'Asotracmet2026!';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('logout')).toBeVisible();
}

async function logout(page: Page) {
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('login-submit')).toBeVisible();
}

async function tokenApi(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${API}/api/v1/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

test.beforeEach(async ({ request }) => {
  const res = await request.post(`${API}/api/v1/__e2e/reset`);
  expect(res.ok()).toBeTruthy();
});

test('login ops → ofrecer → login member → aceptar → aparece TR', async ({ page }) => {
  await login(page, 'ops@asotracmet.test');
  await expect(page).toHaveURL(/\/ops$/);

  // La cabeza SPS413 no está habilitada para HLB: se pinta gris con motivo, y la siguiente elegible es FST189.
  await expect(page.getByTestId('cola-fila-SPS413')).toContainText('No habilitada');
  await expect(page.getByTestId('cola-fila-FST189')).toHaveAttribute('data-cabeza', 'true');

  await page.getByTestId('ofrecer-req-hlb-castilla').click();
  await expect(page.getByTestId('oferta-abierta').filter({ hasText: 'FST189' })).toBeVisible();
  await logout(page);

  await login(page, 'member.fst189@asotracmet.test');
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByTestId('mi-posicion').first()).toContainText(
    'Tu posición: 2 de 10 en TM-CBZ',
  );
  await expect(page.getByTestId('oferta-card')).toContainText('FST189');
  await page.getByTestId('aceptar-oferta').click();

  await expect(page.getByTestId('mis-trs')).toContainText('TR-41947');
  await expect(page.getByTestId('sin-oferta')).toBeVisible();
  // Al aceptar, la placa rota al final de la cola.
  await expect(page.getByTestId('mi-posicion').first()).toContainText(
    'Tu posición: 10 de 10 en TM-CBZ',
  );
  await logout(page);

  await login(page, 'ops@asotracmet.test');
  await expect(page.getByTestId('actividad')).toContainText('TR-41947');
  await expect(page.getByTestId('cola-fila-FST189')).toContainText('10');
});

test('member declina con motivo de catálogo y la oferta pasa a la siguiente placa', async ({
  page,
  request,
}) => {
  const token = await tokenApi(request, 'ops@asotracmet.test');
  const oferta = await request.post(`${API}/api/v1/requerimientos/req-hlb-castilla/ofertas`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(oferta.status()).toBe(201);

  await login(page, 'member.fst189@asotracmet.test');
  await expect(page.getByTestId('oferta-card')).toContainText('FST189');
  await expect(page.getByTestId('declinar-oferta')).toBeDisabled();
  await page.getByTestId('motivo-declinacion').selectOption('mot-mantenimiento');
  await page.getByTestId('nota-declinacion').fill('Cambio de llantas');
  await page.getByTestId('declinar-oferta').click();

  // El mismo asociado tiene dos TM (FST189 y TKM221): la siguiente oferta cae en su otra placa.
  await expect(page.getByTestId('oferta-card')).toContainText('TKM221');
  await expect(page.getByTestId('mi-posicion').filter({ hasText: 'FST189' })).toContainText(
    '10 de 10',
  );

  const ofertas = await request.get(`${API}/api/v1/ofertas?estado=declinada`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const declinadas = (await ofertas.json()) as Array<{
    placa: string;
    motivoDeclinacion: string;
    nota: string;
  }>;
  expect(declinadas).toEqual([
    expect.objectContaining({
      placa: 'FST189',
      motivoDeclinacion: 'Vehículo en mantenimiento',
      nota: 'Cambio de llantas',
    }),
  ]);
});

test('viewer ve la cola en vivo sin botones y la API le niega mutar', async ({ page, request }) => {
  await login(page, 'viewer@asotracmet.test');
  await expect(page.getByTestId('cola-fila-FST189')).toBeVisible();
  await expect(page.getByTestId('ofrecer-req-hlb-castilla')).toHaveCount(0);
  // PII enmascarada: la cédula nunca sale completa para viewer.
  await expect(page.getByTestId('cola-TM-CBZ')).not.toContainText('1002000202');

  const token = await tokenApi(request, 'viewer@asotracmet.test');
  const res = await request.post(`${API}/api/v1/requerimientos/req-hlb-castilla/ofertas`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { code: string }).code).toBe('FORBIDDEN');
});

test('credenciales inválidas muestran error traducido y no entran', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill('ops@asotracmet.test');
  await page.getByTestId('login-password').fill('incorrecta!!');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('Sesión inválida');
  await expect(page).toHaveURL(/\/login$/);
});
