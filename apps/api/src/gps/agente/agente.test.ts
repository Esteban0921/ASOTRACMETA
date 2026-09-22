import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LoteUbicacionesGps, ResultadoIngestaGps, UbicacionGps } from '@asotracmet/shared';
import { ClienteIngesta, ErrorIngesta } from './api.js';
import { CicloGps } from './ciclo.js';
import { leerCuentas, type CuentaGps } from './cuentas.js';
import { crearLog, filtrarCampos } from './log.js';
import { registroProveedores } from './proveedores/registro.js';
import { GpsSimulado } from './proveedores/simulado.js';
import { ErrorProveedorGps, type ProveedorGps } from './proveedores/tipos.js';

// Agente GPS satélite (ADR-0007, TASK-0064). Todo con dobles: ni red, ni reloj real, ni
// credenciales (RULE-020). Lo que se prueba es lo que puede hacer daño en producción: que no se
// filtren credenciales, que una plataforma caída no arrastre a las demás y que una clave vieja no
// se reintente cada veinte minutos hasta que la plataforma bloquee la cuenta del asociado.

const AHORA = new Date('2026-09-22T13:00:00Z');
const reloj = () => AHORA;

const CUENTA: CuentaGps = {
  id: 'cuenta-uno',
  proveedor: 'prueba',
  usuario: 'propietario@correo',
  clave: 'clave-secreta-del-propietario',
  placas: ['FST189', 'TKM221'],
};

const LECTURA: UbicacionGps = {
  placa: 'FST189',
  latitud: 4.1421,
  longitud: -73.6266,
  capturadaEn: AHORA.toISOString(),
  proveedor: 'prueba',
};

const RESULTADO: ResultadoIngestaGps = {
  loteId: 'lote',
  recibidas: 1,
  guardadas: 1,
  duplicadas: 0,
  ignoradas: 0,
  vehiculosInactivos: 0,
  proveedorDistinto: 0,
  placasDesconocidas: [],
  intervaloMinutos: 20,
};

function proveedorFalso(
  responder: (cuenta: CuentaGps) => Promise<UbicacionGps[]>,
  clase = 'prueba',
): ProveedorGps {
  return { clase, ubicaciones: (cuenta) => responder(cuenta) };
}

interface ApiFalsa {
  enviados: LoteUbicacionesGps[];
  enviar: (lote: LoteUbicacionesGps) => Promise<ResultadoIngestaGps>;
}

function apiFalsa(
  responder: (lote: LoteUbicacionesGps, n: number) => Promise<ResultadoIngestaGps> = async () =>
    RESULTADO,
): ApiFalsa {
  const enviados: LoteUbicacionesGps[] = [];
  return {
    enviados,
    enviar: (lote) => {
      enviados.push(lote);
      return responder(lote, enviados.length);
    },
  };
}

function crearCiclo(opciones: {
  cuentas?: CuentaGps[] | (() => Promise<CuentaGps[]>);
  proveedor?: ProveedorGps;
  api?: ApiFalsa;
  lineas?: string[];
}) {
  const api = opciones.api ?? apiFalsa();
  const lineas = opciones.lineas ?? [];
  const proveedor =
    opciones.proveedor ?? proveedorFalso(async () => [LECTURA, { ...LECTURA, placa: 'TKM221' }]);
  const fuente = opciones.cuentas;
  const ciclo = new CicloGps({
    leerCuentas: typeof fuente === 'function' ? fuente : async () => fuente ?? [CUENTA],
    proveedores: registroProveedores([proveedor]),
    api: api as unknown as ClienteIngesta,
    fetch: (async () => new Response('')) as unknown as typeof fetch,
    ahora: reloj,
    nuevoId: () => '0199b1f0-3333-7000-8000-000000000001',
    log: crearLog((linea) => lineas.push(linea)),
    timeoutMs: 1000,
    concurrencia: 2,
    intervaloMinutos: 20,
  });
  return { ciclo, api, lineas };
}

describe('archivo de cuentas (RULE-021)', () => {
  let carpeta: string | null = null;

  afterEach(() => {
    carpeta = null;
  });

  async function escribirArchivo(contenido: string, modo = 0o400): Promise<string> {
    carpeta = await mkdtemp(path.join(tmpdir(), 'gps-cuentas-'));
    const ruta = path.join(carpeta, 'cuentas.json');
    await writeFile(ruta, contenido, 'utf8');
    await chmod(ruta, modo);
    return ruta;
  }

  it('lee un archivo válido y normaliza las placas', async () => {
    const ruta = await escribirArchivo(
      JSON.stringify({
        version: 1,
        cuentas: [{ ...CUENTA, placas: ['fst 189', 'tkm-221'] }],
      }),
    );
    const cuentas = await leerCuentas(ruta);
    expect(cuentas).toHaveLength(1);
    expect(cuentas[0]!.placas).toEqual(['FST189', 'TKM221']);
  });

  it('el ejemplo versionado del repositorio es válido', async () => {
    const cuentas = await leerCuentas(path.resolve('infra/gps-cuentas.example.json'));
    expect(cuentas.length).toBeGreaterThan(0);
    // Las 17 placas de la semilla, repartidas: el circuito se puede probar sin red.
    expect(cuentas.flatMap((c) => c.placas ?? [])).toHaveLength(17);
    expect(cuentas.every((c) => c.proveedor === 'simulado')).toBe(true);
  });

  it('un archivo con formato inválido falla sin revelar el contenido', async () => {
    const ruta = await escribirArchivo(
      JSON.stringify({ version: 1, cuentas: [{ ...CUENTA, usuario: 42 }] }),
    );
    await expect(leerCuentas(ruta)).rejects.toThrow(/no cumple el formato/);
    const error = await leerCuentas(ruta).catch((e: Error) => e.message);
    expect(error).not.toContain(CUENTA.clave);
    expect(error).not.toContain(CUENTA.usuario);
  });

  it('un archivo que no existe falla con la ruta, no con las credenciales', async () => {
    await expect(leerCuentas('/no/existe/cuentas.json')).rejects.toThrow(/No se pudo leer/);
  });

  it('avisa si el archivo es legible por otros usuarios', async () => {
    if (process.platform === 'win32') return;
    const ruta = await escribirArchivo(JSON.stringify({ version: 1, cuentas: [CUENTA] }), 0o644);
    const avisos: string[] = [];
    await leerCuentas(ruta, (aviso) => avisos.push(aviso));
    expect(avisos.join(' ')).toContain('0400');
  });
});

describe('proveedor simulado (RULE-020)', () => {
  it('da la misma posición para la misma placa y ventana de tiempo', async () => {
    const simulado = new GpsSimulado();
    const ctx = {
      fetch: (async () => new Response('')) as unknown as typeof fetch,
      ahora: reloj,
      signal: AbortSignal.timeout(1000),
      log: () => undefined,
    };
    const primera = await simulado.ubicaciones(CUENTA, ctx);
    const segunda = await simulado.ubicaciones(CUENTA, ctx);
    expect(primera).toEqual(segunda);
    expect(primera.map((u) => u.placa)).toEqual(['FST189', 'TKM221']);
    expect(primera[0]!.capturadaEn).toBe('2026-09-22T13:00:00.000Z');
  });

  it('cambia de punto en la siguiente ventana de veinte minutos', async () => {
    const simulado = new GpsSimulado();
    const ctx = (fecha: string) => ({
      fetch: (async () => new Response('')) as unknown as typeof fetch,
      ahora: () => new Date(fecha),
      signal: AbortSignal.timeout(1000),
      log: () => undefined,
    });
    const antes = await simulado.ubicaciones(CUENTA, ctx('2026-09-22T13:00:00Z'));
    const despues = await simulado.ubicaciones(CUENTA, ctx('2026-09-22T13:25:00Z'));
    expect(despues[0]!.latitud).not.toBe(antes[0]!.latitud);
  });
});

describe('ciclo del agente (ADR-0007)', () => {
  it('comprueba el token con un lote vacío antes de consultar ninguna plataforma', async () => {
    let consultas = 0;
    const api = apiFalsa();
    const { ciclo } = crearCiclo({
      api,
      proveedor: proveedorFalso(async () => {
        consultas += 1;
        return [LECTURA];
      }),
    });
    await ciclo.correr();
    expect(api.enviados[0]!.ubicaciones).toEqual([]);
    expect(api.enviados[0]!.cuentaId).toBe('verificacion');
    expect(consultas).toBe(1);
  });

  it('si la API rechaza el token no se consulta ninguna plataforma', async () => {
    let consultas = 0;
    const api = apiFalsa(async () => {
      throw new ErrorIngesta('token', 'rechazado', 401);
    });
    const { ciclo, lineas } = crearCiclo({
      api,
      proveedor: proveedorFalso(async () => {
        consultas += 1;
        return [LECTURA];
      }),
    });
    const resumen = await ciclo.correr();
    expect(resumen.tokenInvalido).toBe(true);
    expect(consultas).toBe(0);
    expect(lineas.join(' ')).toContain('rechazó el token');
  });

  it('envía un lote por cuenta y adopta el intervalo que devuelve la API', async () => {
    const api = apiFalsa(async () => ({ ...RESULTADO, intervaloMinutos: 45 }));
    const { ciclo } = crearCiclo({
      api,
      cuentas: [CUENTA, { ...CUENTA, id: 'cuenta-dos' }],
    });
    const resumen = await ciclo.correr();
    expect(resumen.cuentas).toBe(2);
    expect(resumen.enviadas).toBe(2);
    // El primero es la verificación del token; luego uno por cuenta.
    expect(api.enviados.map((l) => l.cuentaId)).toEqual([
      'verificacion',
      'cuenta-uno',
      'cuenta-dos',
    ]);
    expect(ciclo.intervaloMinutos).toBe(45);
  });

  it('respeta la lista de placas de la cuenta y manda una sola lectura por placa', async () => {
    const api = apiFalsa();
    const { ciclo } = crearCiclo({
      api,
      proveedor: proveedorFalso(async () => [
        LECTURA,
        { ...LECTURA, capturadaEn: '2026-09-22T13:10:00.000Z', latitud: 5 },
        { ...LECTURA, placa: 'SWI750' },
      ]),
    });
    await ciclo.correr();
    const lote = api.enviados[1]!;
    expect(lote.ubicaciones).toHaveLength(1);
    expect(lote.ubicaciones[0]!.latitud).toBe(5);
    expect(lote.ubicaciones.some((u) => u.placa === 'SWI750')).toBe(false);
  });

  it('una plataforma caída no impide que las demás cuentas entreguen', async () => {
    const api = apiFalsa();
    const { ciclo } = crearCiclo({
      api,
      cuentas: [CUENTA, { ...CUENTA, id: 'cuenta-dos', proveedor: 'roto' }],
      proveedor: proveedorFalso(async (cuenta) => {
        if (cuenta.id === 'cuenta-dos') throw new ErrorProveedorGps('red', 'timeout');
        return [LECTURA];
      }),
    });
    const resumen = await ciclo.correr();
    expect(resumen.fallidas).toBe(0);
    expect(resumen.enviadas).toBe(1);
    // La cuenta con un proveedor sin adaptador se salta, no rompe el ciclo.
    expect(resumen.saltadas).toBe(1);
  });

  it('unas credenciales inválidas apartan la cuenta varios ciclos', async () => {
    const { ciclo, lineas } = crearCiclo({
      proveedor: proveedorFalso(async () => {
        throw new ErrorProveedorGps('credenciales_invalidas', 'usuario o clave incorrectos');
      }),
    });
    const primero = await ciclo.correr();
    expect(primero.fallidas).toBe(1);
    const estado = ciclo.estadoDe('cuenta-uno');
    expect(estado?.ultimoMotivo).toBe('credenciales_invalidas');
    expect(estado!.saltarHasta).toBeGreaterThan(1);

    // La vuelta siguiente ni lo intenta: repetir el acceso puede bloquear la cuenta del asociado.
    const segundo = await ciclo.correr();
    expect(segundo.saltadas).toBe(1);
    expect(segundo.fallidas).toBe(0);
    expect(lineas.join(' ')).toContain('apartada');
  });

  it('un fallo pasajero se reintenta en el siguiente ciclo', async () => {
    let intentos = 0;
    const { ciclo } = crearCiclo({
      proveedor: proveedorFalso(async () => {
        intentos += 1;
        if (intentos === 1) throw new ErrorProveedorGps('red', 'se cayó la conexión');
        return [LECTURA];
      }),
    });
    await ciclo.correr();
    const segundo = await ciclo.correr();
    expect(segundo.saltadas).toBe(0);
    expect(segundo.enviadas).toBe(1);
  });

  it('si el archivo de cuentas desaparece, el ciclo no reutiliza las credenciales anteriores', async () => {
    let existe = true;
    const { ciclo, api, lineas } = crearCiclo({
      cuentas: async () => {
        if (!existe) throw new Error('No se pudo leer el archivo de cuentas GPS (/x): ENOENT');
        return [CUENTA];
      },
    });
    await ciclo.correr();
    existe = false;
    const resumen = await ciclo.correr();
    expect(resumen.cuentas).toBe(0);
    expect(resumen.enviadas).toBe(0);
    // Solo la verificación del token y el envío del primer ciclo.
    expect(api.enviados).toHaveLength(2);
    expect(lineas.join(' ')).toContain('no se pudieron leer las cuentas');
  });

  it('el log del ciclo no contiene usuario, clave, placas ni coordenadas', async () => {
    const { ciclo, lineas } = crearCiclo({});
    await ciclo.correr();
    const registrado = lineas.join(' ');
    expect(registrado).toContain('gps agente');
    expect(registrado).not.toContain(CUENTA.usuario);
    expect(registrado).not.toContain(CUENTA.clave);
    expect(registrado).not.toContain('FST189');
    expect(registrado).not.toContain('4.1421');
    // Sí lleva lo que sirve para operar: el id opaco de la cuenta y los conteos.
    expect(registrado).toContain('cuenta-uno');
    expect(registrado).toContain('"guardadas"');
  });

  it('la lista blanca del log descarta cualquier campo no previsto', () => {
    expect(
      filtrarCampos({
        cuentaId: 'cuenta-uno',
        clave: 'secreta',
        placa: 'FST189',
        latitud: 4.14,
        guardadas: 2,
      }),
    ).toEqual({ cuentaId: 'cuenta-uno', guardadas: 2 });
  });
});

describe('cliente de la ingesta', () => {
  it('reintenta una vez si la API no responde, y no reintenta si rechaza el token', async () => {
    let llamadas = 0;
    const cliente = new ClienteIngesta({
      baseUrl: 'http://api',
      token: 'token-de-prueba',
      esperar: async () => undefined,
      fetch: (async () => {
        llamadas += 1;
        if (llamadas === 1) throw new Error('ECONNREFUSED');
        return new Response(JSON.stringify(RESULTADO), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as unknown as typeof fetch,
    });
    const resultado = await cliente.enviar({ loteId: 'l', cuentaId: 'c', ubicaciones: [] });
    expect(resultado.guardadas).toBe(1);
    expect(llamadas).toBe(2);

    const conToken = new ClienteIngesta({
      baseUrl: 'http://api',
      token: 'malo',
      esperar: async () => undefined,
      fetch: (async () => new Response('', { status: 401 })) as unknown as typeof fetch,
    });
    await expect(conToken.enviar({ loteId: 'l', cuentaId: 'c', ubicaciones: [] })).rejects.toThrow(
      ErrorIngesta,
    );
  });

  it('manda el token en la cabecera y el lote como JSON', async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    const cliente = new ClienteIngesta({
      baseUrl: 'http://api/',
      token: 'token-de-prueba',
      fetch: (async (url: string, init: RequestInit) => {
        llamadas.push({ url, init });
        return new Response(JSON.stringify(RESULTADO), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as unknown as typeof fetch,
    });
    await cliente.enviar({ loteId: 'l', cuentaId: 'c', ubicaciones: [LECTURA] });
    expect(llamadas[0]!.url).toBe('http://api/api/v1/gps/ubicaciones');
    expect((llamadas[0]!.init.headers as Record<string, string>).authorization).toBe(
      'Bearer token-de-prueba',
    );
    expect(String(llamadas[0]!.init.body)).toContain('FST189');
  });
});

describe('bucle del agente', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('programa la vuelta siguiente, no solapa dos y deja de programar al detenerse', async () => {
    vi.useFakeTimers();
    const { AgenteGps } = await import('./agente.js');
    const mensajes: string[] = [];
    const agente = new AgenteGps({
      config: {
        apiUrl: 'http://api',
        token: 'token',
        cuentasArchivo: 'no-existe-a-proposito.json',
        intervaloMinutos: 20,
        timeoutMs: 1000,
        concurrencia: 1,
      },
      ahora: reloj,
      nuevoId: () => 'id',
      log: (_datos, mensaje) => mensajes.push(mensaje),
      fetch: (async () =>
        new Response(JSON.stringify(RESULTADO), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as unknown as typeof fetch,
    });
    // Dos llamadas a la vez son la misma vuelta: un ciclo lento nunca se solapa con el siguiente.
    const primera = agente.correr();
    expect(agente.correr()).toBe(primera);
    await primera;

    agente.iniciar();
    await agente.correr();
    await vi.advanceTimersByTimeAsync(1);
    // Queda programada la vuelta siguiente (a `intervaloMinutos`), y es lo único que mantiene
    // vivo el proceso: por eso el temporizador no se desreferencia.
    expect(vi.getTimerCount()).toBe(1);

    await agente.detener();
    expect(vi.getTimerCount()).toBe(0);
    expect(mensajes.some((m) => m.includes('no se pudieron leer'))).toBe(true);
  });
});
