import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// E2E del loop que no puede mentir (spec §16, §22): login ops → ofrecer → login member → aceptar → aparece TR.
// La API corre en modo e2e (almacén en memoria + seed determinista) y se resetea antes de cada test.
// Acceso (spec §3.3): equipo interno con contraseña + código TOTP; asociados con enlace mágico.
// En modo e2e la API expone los códigos y mensajes que en producción viajan por correo.

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101';
const PASSWORD = 'Asotracmet2026!';

const esMember = (email: string) => email.startsWith('member.');

async function codigoTotp(
  request: APIRequestContext,
  consulta: { email?: string; secret?: string },
) {
  const parametros = new URLSearchParams(consulta as Record<string, string>);
  const res = await request.get(`${API}/api/v1/__e2e/totp?${parametros.toString()}`);
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { codigo: string }).codigo;
}

async function ultimoMensaje(request: APIRequestContext, para: string) {
  const res = await request.get(`${API}/api/v1/__e2e/mensajes?para=${encodeURIComponent(para)}`);
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { codigo?: string; enlace?: string; asunto: string };
}

async function login(page: Page, request: APIRequestContext, email: string) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  if (esMember(email)) {
    // Sin contraseña: la API envía el enlace de acceso.
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-info')).toBeVisible();
    const { enlace } = await ultimoMensaje(request, email);
    expect(enlace).toBeTruthy();
    await page.goto(enlace!);
  } else {
    await page.getByTestId('login-password').fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('login-codigo').waitFor();
    // Sin segundo factor configurado (hseq en la semilla) la pantalla muestra la clave a registrar.
    const secretos = page.getByTestId('login-totp-secret');
    const secret =
      (await secretos.count()) > 0 ? (await secretos.textContent())?.trim() : undefined;
    await page
      .getByTestId('login-codigo')
      .fill(await codigoTotp(request, secret ? { secret } : { email }));
    await page.getByTestId('login-verificar').click();
  }
  await expect(page.getByTestId('logout')).toBeVisible();
}

async function logout(page: Page) {
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('login-submit')).toBeVisible();
}

/** Sesión por API para preparar escenarios. */
async function tokenApi(request: APIRequestContext, email: string): Promise<string> {
  if (esMember(email)) {
    await request.post(`${API}/api/v1/auth/magic-link`, { data: { email } });
    const { enlace } = await ultimoMensaje(request, email);
    const token = new URL(enlace!).searchParams.get('token');
    const res = await request.post(`${API}/api/v1/auth/magic-link/canjear`, { data: { token } });
    expect(res.ok(), await res.text()).toBeTruthy();
    return ((await res.json()) as { token: string }).token;
  }
  const primero = await request.post(`${API}/api/v1/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(primero.ok(), await primero.text()).toBeTruthy();
  const { challenge } = (await primero.json()) as { challenge: string };
  const res = await request.post(`${API}/api/v1/auth/2fa/verify`, {
    data: { challenge, codigo: await codigoTotp(request, { email }) },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

test.beforeEach(async ({ request }) => {
  const res = await request.post(`${API}/api/v1/__e2e/reset`);
  expect(res.ok()).toBeTruthy();
});

test('login ops → ofrecer → login member → aceptar → aparece TR', async ({ page, request }) => {
  await login(page, request, 'ops@asotracmet.test');
  await expect(page).toHaveURL(/\/ops$/);

  // La cabeza SPS413 no está habilitada para HLB: se pinta gris con motivo, y la siguiente elegible es FST189.
  await expect(page.getByTestId('cola-fila-SPS413')).toContainText('No habilitada');
  await expect(page.getByTestId('cola-fila-FST189')).toHaveAttribute('data-cabeza', 'true');

  await page.getByTestId('ofrecer-req-hlb-castilla').click();
  await expect(page.getByTestId('oferta-abierta').filter({ hasText: 'FST189' })).toBeVisible();
  await logout(page);

  await login(page, request, 'member.fst189@asotracmet.test');
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

  await login(page, request, 'ops@asotracmet.test');
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

  await login(page, request, 'member.fst189@asotracmet.test');
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
  await login(page, request, 'viewer@asotracmet.test');
  await expect(page.getByTestId('cola-fila-FST189')).toBeVisible();
  await expect(page.getByTestId('ofrecer-req-hlb-castilla')).toHaveCount(0);
  // PII enmascarada: la cédula nunca sale completa para viewer.
  await expect(page.getByTestId('cola-TM-CBZ')).not.toContainText('10020000202');

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

test('un código TOTP incorrecto no entra; el correcto sí', async ({ page, request }) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill('ops@asotracmet.test');
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-info')).toContainText('aplicación de autenticación');
  const correcto = await codigoTotp(request, { email: 'ops@asotracmet.test' });
  const incorrecto = String((Number(correcto) + 1) % 1_000_000).padStart(6, '0');
  await page.getByTestId('login-codigo').fill(incorrecto);
  await page.getByTestId('login-verificar').click();
  await expect(page.getByTestId('login-error')).toContainText('no es válido');
  await page.getByTestId('login-codigo').fill(correcto);
  await page.getByTestId('login-verificar').click();
  await expect(page.getByTestId('logout')).toBeVisible();
  await expect(page).toHaveURL(/\/ops$/);
});

test('un administrador sin segundo factor lo configura en su primer acceso', async ({
  page,
  request,
}) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill('hseq@asotracmet.test');
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  const secret = (await page.getByTestId('login-totp-secret').textContent())?.trim();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByTestId('login-codigo').fill(await codigoTotp(request, { secret }));
  await page.getByTestId('login-verificar').click();
  await expect(page.getByTestId('logout')).toBeVisible();
  await logout(page);

  // Segundo acceso: ya no se muestra la clave, solo se pide el código.
  await page.getByTestId('login-email').fill('hseq@asotracmet.test');
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-codigo')).toBeVisible();
  await expect(page.getByTestId('login-totp-secret')).toHaveCount(0);
  await page
    .getByTestId('login-codigo')
    .fill(await codigoTotp(request, { email: 'hseq@asotracmet.test' }));
  await page.getByTestId('login-verificar').click();
  await expect(page.getByTestId('logout')).toBeVisible();
});

test('el enlace de acceso del asociado es de un solo uso', async ({ page, request }) => {
  await login(page, request, 'member.fst189@asotracmet.test');
  const { enlace } = await ultimoMensaje(request, 'member.fst189@asotracmet.test');
  await logout(page);
  await page.goto(enlace!);
  await expect(page.getByTestId('entrar-error')).toContainText('ya se usó');
  await expect(page).toHaveURL(/\/entrar/);
});

test('superadmin resetea la cola con motivo, confirmación y segundo factor; el veedor lo ve', async ({
  page,
  request,
}) => {
  await login(page, request, 'superadmin@asotracmet.test');
  await page.getByTestId('nav-admin').click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByTestId('reset-motivo').fill('Nueva ronda acordada en asamblea');
  await page.getByTestId('reset-confirmacion').fill('RESETEAR');
  await page
    .getByTestId('reset-codigo')
    .fill(await codigoTotp(request, { email: 'superadmin@asotracmet.test' }));
  page.once('dialog', (dialogo) => void dialogo.accept());
  await page.getByTestId('reset-enviar').click();
  await expect(page.getByTestId('admin-mensaje')).toContainText('reseteada');
  await expect(page.getByTestId('admin-intervenciones')).toContainText('Reset de cola');
  await logout(page);

  await login(page, request, 'viewer@asotracmet.test');
  // Tras el reset la cola va por placa: FST189 pasa a la cabeza y SPS413 deja de ser la primera.
  await expect(page.getByTestId('cola-TM-CBZ').locator('tbody tr').first()).toContainText('FST189');
  await expect(page.getByTestId('intervenciones')).toContainText('Reset de cola');
  await expect(page.getByTestId('intervenciones')).toContainText(
    'Nueva ronda acordada en asamblea',
  );
});

test('superadmin da de alta un asociado con placa y el asociado entra con su enlace', async ({
  page,
  request,
}) => {
  await login(page, request, 'superadmin@asotracmet.test');
  await page.getByTestId('nav-usuarios').click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);
  await page.getByTestId('usuario-nuevo-email').fill('member.qor007@asotracmet.test');
  await page.getByTestId('usuario-nuevo-nombre').fill('Asociado 03');
  await page.getByTestId('usuario-nuevo-rol').selectOption('member');
  await page.getByTestId('usuario-nuevo-placas').selectOption('veh-QOR007');
  await page.getByTestId('usuario-nuevo-enviar').click();
  await expect(page.getByTestId('usuarios-mensaje')).toContainText('creado');
  await expect(page.getByTestId('usuario-fila-member.qor007@asotracmet.test')).toBeVisible();
  await logout(page);

  await login(page, request, 'member.qor007@asotracmet.test');
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByTestId('mi-posicion')).toContainText('Tu posición: 5 de 10 en TM-CBZ');
});

test('HSEQ da de alta una placa que entra al final de la cola; un SOAT vencido la deja no elegible', async ({
  page,
  request,
}) => {
  await login(page, request, 'hseq@asotracmet.test');
  await page.getByTestId('nav-hseq').click();
  await expect(page).toHaveURL(/\/hseq$/);
  // Alertas de vencimiento (spec §9.2 HSEQ): la semilla trae el SOAT vencido de UFR114 y la tecnomecánica de QOR007 por vencer.
  await expect(page.getByTestId('hseq-alerta-UFR114')).toContainText('Vencido');
  await expect(page.getByTestId('hseq-alerta-QOR007')).toContainText('Vence en');
  await page.getByTestId('hseq-nueva-placa').fill('zza 111');
  await page.getByTestId('hseq-nueva-clase').selectOption('TM');
  await page.getByTestId('hseq-nueva-asociado').selectOption('a-01');
  await page.getByTestId('hseq-nueva-enviar').click();
  await expect(page.getByTestId('hseq-mensaje')).toContainText('ZZA111');
  await expect(page.getByTestId('ficha-titulo')).toContainText('ZZA111');
  await expect(page.getByTestId('ficha-cola')).toContainText('11 de 11 en TM-CBZ');
  await expect(page.getByTestId('ficha-semaforo')).toContainText('Vigente');

  await page.getByTestId('doc-tipo').selectOption('tipo-SOAT');
  await page.getByTestId('doc-numero').fill('SOAT-111-2025');
  await page.getByTestId('doc-vence').fill('2026-09-01');
  await page.getByTestId('doc-enviar').click();
  await expect(page.getByTestId('ficha-doc-estado-SOAT')).toContainText('Vencido');
  await expect(page.getByTestId('ficha-semaforo')).toContainText('Vencido');
  await expect(page.getByTestId('hseq-semaforo-ZZA111')).toContainText('Vencido');
  await logout(page);

  // La cola reacciona sola: la placa está al final y el motor la marca como no elegible.
  await login(page, request, 'ops@asotracmet.test');
  const fila = page.getByTestId('cola-fila-ZZA111');
  await expect(fila).toContainText('Documento vencido');
  await expect(fila.locator('td').first()).toHaveText('11');
});

test('finance crea el viaje del TR, liquida el 3 % y registra el pago; el resumen del mes lo refleja', async ({
  page,
  request,
}) => {
  // Preparación por API: ops ofrece el cupo HLB · Castilla y el asociado acepta (nace TR-41947).
  const ops = await tokenApi(request, 'ops@asotracmet.test');
  const oferta = await request.post(`${API}/api/v1/requerimientos/req-hlb-castilla/ofertas`, {
    headers: { authorization: `Bearer ${ops}` },
  });
  expect(oferta.ok(), await oferta.text()).toBeTruthy();
  const member = await tokenApi(request, 'member.fst189@asotracmet.test');
  const aceptada = await request.post(
    `${API}/api/v1/ofertas/${((await oferta.json()) as { id: string }).id}/aceptar`,
    { headers: { authorization: `Bearer ${member}` } },
  );
  expect(aceptada.ok(), await aceptada.text()).toBeTruthy();

  await login(page, request, 'finance@asotracmet.test');
  await page.getByTestId('nav-finance').click();
  await expect(page).toHaveURL(/\/finance$/);
  await page.getByTestId('finance-crear-TR-41947').click();
  await expect(page.getByTestId('finance-ficha-titulo')).toContainText('TR-41947');

  await page.getByTestId('finance-flete').fill('1500000');
  await page.getByTestId('finance-guardar').click();
  await expect(page.getByTestId('finance-mensaje')).toContainText('guardado');
  await page.getByTestId('finance-liquidar').click();
  await expect(page.getByTestId('finance-recaudo')).toContainText('45.000');
  await expect(page.getByTestId('finance-estado-recaudo')).toContainText('Pendiente');
  await expect(page.getByTestId('finance-viaje-TR-41947')).toContainText('Liquidado');

  await page.getByTestId('finance-pago-valor').fill('45000');
  await page.getByTestId('finance-pago-fecha').fill('2026-09-20');
  await page.getByTestId('finance-pago-referencia').fill('98765');
  await page.getByTestId('finance-pago-enviar').click();
  await expect(page.getByTestId('finance-estado-recaudo')).toContainText('Pagado');
  await expect(page.getByTestId('finance-resumen-recaudo')).toContainText('45.000');
  await expect(page.getByTestId('finance-resumen-pendiente')).toContainText('0');
});
