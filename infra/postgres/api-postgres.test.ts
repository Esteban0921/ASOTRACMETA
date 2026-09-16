import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { RelojFijo } from '@asotracmet/domain';
import { construirApp } from '@asotracmet/api/app';
import { claveDesdeEntorno } from '@asotracmet/api/cifrado';
import { MensajeriaMemoria } from '@asotracmet/api/mensajeria';
import { almacenamientoPostgres } from '@asotracmet/api/persistencia';
import { PASSWORD_DEV, secretoTotpSemilla } from '@asotracmet/api/seed';
import { sembrarPostgres, uuidSemilla } from '@asotracmet/api/seed-postgres';
import { codigoTotp } from '@asotracmet/api/totp';
import { migrar } from './migrar.js';

// La API completa contra Postgres real (TASK-0019): mismos criterios de aceptación de la spec §20
// que ya cumple el almacén en memoria, ahora con transacciones, locks, RLS y sesiones de verdad.

const url = process.env.DATABASE_URL;
const AHORA = '2026-09-16T13:00:00Z';
const REQ_HLB = uuidSemilla('req-hlb-castilla');
const CLAVE = claveDesdeEntorno(process.env);

describe.skipIf(!url)('API sobre Postgres (spec §20)', () => {
  let pool: pg.Pool;
  let app: FastifyInstance;
  let reloj: RelojFijo;
  let mensajeria: MensajeriaMemoria;
  let motivoMantenimientoId: string;
  let clienteHlbId: string;

  /** Flujo de acceso real (spec §3.3): TOTP para roles internos, enlace mágico para member. */
  async function login(email: string): Promise<string> {
    if (email.startsWith('member.')) {
      await app.inject({ method: 'POST', url: '/api/v1/auth/magic-link', payload: { email } });
      const enlace = mensajeria.ultimoPara(email)?.enlace;
      expect(enlace).toBeDefined();
      const token = new URL(enlace!).searchParams.get('token');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/magic-link/canjear',
        payload: { token },
      });
      expect(res.statusCode, res.body).toBe(200);
      return (res.json() as { token: string }).token;
    }
    // Anti-replay TOTP (TASK-0040): cada acceso con código va en un paso de 30 s distinto.
    reloj.fijar(new Date(reloj.ahora().getTime() + 30_000).toISOString());
    const primero = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD_DEV },
    });
    expect(primero.statusCode, primero.body).toBe(200);
    const reto = primero.json() as { paso: string; challenge: string; secret?: string };
    const secreto = reto.paso === 'totp_enrolar' ? reto.secret! : secretoTotpSemilla(email);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { challenge: reto.challenge, codigo: codigoTotp(secreto, reloj.ahora()) },
    });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { token: string }).token;
  }

  function conToken(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  /** Deja solo los maestros: la operación y las sesiones se rehacen en cada test. */
  async function limpiarOperacion(): Promise<void> {
    await pool.query(
      'truncate audit_log, ofertas, trs, requerimientos, cola_posiciones, sesiones, otp_codes, metricas_mes restart identity cascade',
    );
    await pool.query(
      `update parametros set value = '{"prefix": "TR-", "next": 41947}'::jsonb where key = 'secuencia_tr'`,
    );
    // Anti-replay TOTP (TASK-0040): el reloj vuelve a AHORA, así que el último paso aceptado también.
    await pool.query('update usuarios set totp_ultimo_paso = null');
    await sembrarPostgres(pool, new Date(AHORA), CLAVE);
    mensajeria.limpiar();
  }

  beforeAll(async () => {
    await migrar(url!);
    pool = new pg.Pool({ connectionString: url, max: 10 });
    reloj = new RelojFijo(AHORA);
    mensajeria = new MensajeriaMemoria(reloj);
    app = (
      await construirApp({
        config: { logger: false, loginRateLimitMax: 10_000, persistencia: 'postgres' },
        reloj,
        almacenamiento: almacenamientoPostgres({ pool }),
        mensajeria,
      })
    ).app;
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    reloj.fijar(AHORA);
    await limpiarOperacion();
    const token = await login('ops@asotracmet.test');
    const motivos = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/motivos-declinacion',
        headers: conToken(token),
      })
    ).json() as Array<{ id: string; codigo: string }>;
    motivoMantenimientoId = motivos.find((m) => m.codigo === 'MANTENIMIENTO')!.id;
    const clientes = (
      await app.inject({ method: 'GET', url: '/api/v1/clientes', headers: conToken(token) })
    ).json() as Array<{ id: string; codigo: string }>;
    clienteHlbId = clientes.find((c) => c.codigo === 'HLB')!.id;
  });

  it('readyz confirma que la base responde', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.json()).toMatchObject({ ok: true, almacen: 'postgres', db: { ok: true } });
  });

  it('sesiones y enlaces viven en Postgres: logout revoca y el enlace es de un solo uso', async () => {
    const token = await login('member.fst189@asotracmet.test');
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/me', headers: conToken(token) })).statusCode,
    ).toBe(200);
    const salida = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: conToken(token),
    });
    expect(salida.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/me', headers: conToken(token) })).statusCode,
    ).toBe(401);
    const { rows } = await pool.query<{ revocadas: string; usados: string }>(
      `select (select count(*) from sesiones where revocada_en is not null) as revocadas,
              (select count(*) from otp_codes where proposito = 'magic_link' and usado_en is not null) as usados`,
    );
    expect(Number(rows[0]?.revocadas)).toBe(1);
    expect(Number(rows[0]?.usados)).toBe(1);

    const enlace = mensajeria.ultimoPara('member.fst189@asotracmet.test')!.enlace!;
    const reutilizado = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link/canjear',
      payload: { token: new URL(enlace).searchParams.get('token') },
    });
    expect(reutilizado.statusCode).toBe(401);
  });

  it('un administrador sin segundo factor lo configura y queda cifrado en la base', async () => {
    const primero = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'hseq@asotracmet.test', password: PASSWORD_DEV },
    });
    const enrolar = primero.json() as { paso: string; challenge: string; secret: string };
    expect(enrolar.paso).toBe('totp_enrolar');
    const activado = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { challenge: enrolar.challenge, codigo: codigoTotp(enrolar.secret, reloj.ahora()) },
    });
    expect(activado.statusCode, activado.body).toBe(200);
    const { rows } = await pool.query<{ totp_secret_enc: string }>(
      "select totp_secret_enc from usuarios where email = 'hseq@asotracmet.test'",
    );
    expect(rows[0]?.totp_secret_enc).toMatch(/^v1\./);
    expect(rows[0]?.totp_secret_enc).not.toContain(enrolar.secret);
  });

  it('la cola se lee desde Postgres con la elegibilidad del motor', async () => {
    const token = await login('ops@asotracmet.test');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/colas/TM-CBZ?clienteId=${clienteHlbId}`,
      headers: conToken(token),
    });
    const cola = res.json() as {
      total: number;
      cabezaElegible: string;
      posiciones: Array<{
        placa: string;
        elegibilidad: { elegible: boolean; motivo: string | null };
      }>;
    };
    expect(cola.total).toBe(10);
    expect(cola.posiciones[0]?.placa).toBe('SPS413');
    expect(cola.posiciones[0]?.elegibilidad.motivo).toBe('VEHICULO_NO_HABILITADO');
    expect(cola.posiciones[1]?.placa).toBe('FST189');
    expect(cola.cabezaElegible).toBe(uuidSemilla('veh-FST189'));
    // UFR114 tiene el SOAT vencido en la semilla.
    expect(cola.posiciones.find((p) => p.placa === 'UFR114')?.elegibilidad.motivo).toBe(
      'DOCUMENTO_VENCIDO',
    );
  });

  it('ofrecer → aceptar crea el TR, rota la cola y deja auditoría, todo persistido', async () => {
    const ops = await login('ops@asotracmet.test');
    const oferta = await app.inject({
      method: 'POST',
      url: `/api/v1/requerimientos/${REQ_HLB}/ofertas`,
      headers: conToken(ops),
    });
    expect(oferta.statusCode, oferta.body).toBe(201);
    expect(oferta.json()).toMatchObject({ estado: 'abierta', placa: 'FST189' });

    const dueno = await login('member.fst189@asotracmet.test');
    const aceptada = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${(oferta.json() as { id: string }).id}/aceptar`,
      headers: conToken(dueno),
    });
    expect(aceptada.statusCode, aceptada.body).toBe(200);
    expect(aceptada.json()).toMatchObject({
      tr: { codigo: 'TR-41947', estado: 'asignado', placa: 'FST189', cliente: 'HLB' },
    });

    // Los efectos están en la base, no en memoria.
    const { rows: posiciones } = await pool.query<{ placa: string; posicion: number }>(
      `select v.placa, p.posicion from cola_posiciones p join vehiculos v on v.id = p.vehiculo_id
        where p.clase_cola = 'TM-CBZ' order by p.posicion`,
    );
    expect(posiciones.map((p) => p.placa).at(-1)).toBe('FST189');
    expect(posiciones.map((p) => p.posicion)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const { rows: acciones } = await pool.query<{ accion: string }>(
      'select accion from audit_log order by at asc',
    );
    expect(acciones.map((a) => a.accion)).toEqual([
      'oferta.crear',
      'oferta.aceptar',
      'tr.crear',
      'cola.rotar',
    ]);

    const { rows: secuencia } = await pool.query<{ next: number }>(
      `select (value->>'next')::int as next from parametros where key = 'secuencia_tr'`,
    );
    expect(secuencia[0]?.next).toBe(41948);
  });

  it('declinar exige motivo del catálogo y reoferta a la siguiente placa en la misma transacción', async () => {
    const ops = await login('ops@asotracmet.test');
    const oferta = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/requerimientos/${REQ_HLB}/ofertas`,
        headers: conToken(ops),
      })
    ).json() as { id: string };

    const dueno = await login('member.fst189@asotracmet.test');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${oferta.id}/declinar`,
      headers: conToken(dueno),
      payload: { motivoId: motivoMantenimientoId, nota: 'Cambio de llantas' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      oferta: { estado: 'declinada', motivoDeclinacion: 'Vehículo en mantenimiento' },
      siguiente: { estado: 'abierta', placa: 'TKM221' },
    });
  });

  it('un TR cancelado conserva la historia y libera el cupo', async () => {
    const ops = await login('ops@asotracmet.test');
    const oferta = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/requerimientos/${REQ_HLB}/ofertas`,
        headers: conToken(ops),
      })
    ).json() as { id: string };
    const { tr } = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/ofertas/${oferta.id}/aceptar`,
        headers: conToken(ops),
      })
    ).json() as { tr: { id: string } };

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trs/${tr.id}/cancelar`,
      headers: conToken(ops),
      payload: { motivo: 'HLB canceló el servicio' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      tr: { estado: 'cancelado', motivoCancelacion: 'HLB canceló el servicio' },
      siguiente: { estado: 'abierta' },
    });
    const { rows } = await pool.query('select codigo, estado from trs');
    expect(rows).toEqual([{ codigo: 'TR-41947', estado: 'cancelado' }]);
  });

  it('un viewer no muta nada y un member no lee TR ajenos (§20.1, §20.2)', async () => {
    const ops = await login('ops@asotracmet.test');
    const oferta = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/requerimientos/${REQ_HLB}/ofertas`,
        headers: conToken(ops),
      })
    ).json() as { id: string };
    const { tr } = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/ofertas/${oferta.id}/aceptar`,
        headers: conToken(ops),
      })
    ).json() as { tr: { id: string } };

    const viewer = await login('viewer@asotracmet.test');
    const mutacion = await app.inject({
      method: 'POST',
      url: `/api/v1/requerimientos/${REQ_HLB}/ofertas`,
      headers: conToken(viewer),
    });
    expect(mutacion.statusCode).toBe(403);

    const ajeno = await login('member.swi750@asotracmet.test');
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/trs', headers: conToken(ajeno) })).json(),
    ).toEqual([]);
    const detalle = await app.inject({
      method: 'GET',
      url: `/api/v1/trs/${tr.id}`,
      headers: conToken(ajeno),
    });
    // RLS no le deja ver la fila; la API responde 404 en vez de filtrarla a mano.
    expect([403, 404]).toContain(detalle.statusCode);

    const dueno = await login('member.fst189@asotracmet.test');
    const propios = (
      await app.inject({ method: 'GET', url: '/api/v1/me/trs', headers: conToken(dueno) })
    ).json() as Array<{ codigo: string }>;
    expect(propios.map((t) => t.codigo)).toEqual(['TR-41947']);
  });

  it('"Tu posición: 2 de 10": el total de la clase se cuenta pese a RLS', async () => {
    const dueno = await login('member.fst189@asotracmet.test');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/cola',
      headers: conToken(dueno),
    });
    expect(res.json()).toEqual([
      { placa: 'FST189', claseCola: 'TM-CBZ', posicion: 2, total: 10 },
      { placa: 'TKM221', claseCola: 'TM-CBZ', posicion: 3, total: 10 },
    ]);
  });

  it('con la cola bloqueada por otra transacción, ofrecer responde 409 COLA_LOCKED (§7.7)', async () => {
    const ops = await login('ops@asotracmet.test');
    const otra = await pool.connect();
    try {
      await otra.query('begin');
      await otra.query("select pg_advisory_xact_lock(hashtext('cola:TM-CBZ'))");
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/requerimientos/${REQ_HLB}/ofertas`,
        headers: conToken(ops),
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'COLA_LOCKED' });
      await otra.query('rollback');
    } finally {
      otra.release();
    }
    // Liberado el lock, la misma petición pasa.
    const ok = await app.inject({
      method: 'POST',
      url: `/api/v1/requerimientos/${REQ_HLB}/ofertas`,
      headers: conToken(ops),
    });
    expect(ok.statusCode).toBe(201);
  });

  it('20 coordinadores en paralelo sobre un requerimiento de un cupo → una sola oferta (§20.3)', async () => {
    const ops = await login('ops@asotracmet.test');
    const creado = await app.inject({
      method: 'POST',
      url: '/api/v1/requerimientos',
      headers: conToken(ops),
      payload: {
        clienteId: clienteHlbId,
        claseCola: 'TM-CBZ',
        fechaServicio: '2026-09-20',
        cantidadCupos: 1,
      },
    });
    expect(creado.statusCode, creado.body).toBe(201);
    const reqId = (creado.json() as { id: string }).id;

    const respuestas = await Promise.all(
      Array.from({ length: 20 }, () =>
        app.inject({
          method: 'POST',
          url: `/api/v1/requerimientos/${reqId}/ofertas`,
          headers: conToken(ops),
        }),
      ),
    );
    const creadas = respuestas.filter((r) => r.statusCode === 201);
    const rechazadas = respuestas.filter((r) => r.statusCode === 409);
    expect(creadas).toHaveLength(1);
    expect(rechazadas).toHaveLength(19);
    for (const r of rechazadas) {
      expect(['COLA_LOCKED', 'REQUERIMIENTO_SIN_CUPOS']).toContain(
        (r.json() as { code: string }).code,
      );
    }
    const { rows } = await pool.query<{ total: string }>(
      "select count(*) as total from ofertas where requerimiento_id = $1 and estado = 'abierta'",
      [reqId],
    );
    expect(Number(rows[0]?.total)).toBe(1);
  });

  it('cambiar el porcentaje de recaudo queda auditado con before y after (§20.7)', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/parametros',
      headers: conToken(superadmin),
      payload: { recaudo_porcentaje: 0.035 },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { recaudo_porcentaje: number }).recaudo_porcentaje).toBe(0.035);
    const audit = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/audit?entidad=parametros',
        headers: conToken(superadmin),
      })
    ).json() as Array<{ accion: string; before: unknown; after: unknown }>;
    expect(audit[0]).toMatchObject({
      accion: 'parametros.cambiar',
      before: { recaudo_porcentaje: 0.03 },
      after: { recaudo_porcentaje: 0.035 },
    });
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/parametros',
      headers: conToken(superadmin),
      payload: { recaudo_porcentaje: 0.03 },
    });
  });

  it('override y reset de cola persisten posiciones, auditoría y el factor de re-autenticación', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    // Anti-replay (TASK-0040): el código con el que entró ya no vale; el del paso siguiente sí.
    reloj.fijar(new Date(reloj.ahora().getTime() + 30_000).toISOString());
    const reauth = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauth',
      headers: conToken(superadmin),
      payload: {
        codigo: codigoTotp(secretoTotpSemilla('superadmin@asotracmet.test'), reloj.ahora()),
      },
    });
    expect(reauth.statusCode, reauth.body).toBe(200);

    const override = await app.inject({
      method: 'POST',
      url: '/api/v1/colas/TM-CBZ/override',
      headers: conToken(superadmin),
      payload: {
        vehiculoId: uuidSemilla('veh-SUL470'),
        posicion: 1,
        motivo: 'Acuerdo de asamblea',
      },
    });
    expect(override.statusCode, override.body).toBe(200);

    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/colas/TM-CBZ/reset',
      headers: conToken(superadmin),
      payload: { motivo: 'Nueva ronda', confirmacion: 'RESETEAR' },
    });
    expect(reset.statusCode, reset.body).toBe(200);

    const { rows } = await pool.query<{ placa: string; ciclo: number }>(
      `select v.placa, p.ciclo from cola_posiciones p join vehiculos v on v.id = p.vehiculo_id
        where p.clase_cola = 'TM-CBZ' order by p.posicion`,
    );
    expect(rows.map((r) => r.placa)).toEqual([
      'FST189',
      'QOR007',
      'SNB552',
      'SOF336',
      'SPS413',
      'SUL470',
      'SWI750',
      'TKM221',
      'UFR114',
      'WGT908',
    ]);
    expect(rows.every((r) => r.ciclo === 1)).toBe(true);

    const { rows: acciones } = await pool.query<{ accion: string }>(
      "select accion from audit_log where entidad = 'cola' and entidad_id = 'TM-CBZ' order by at",
    );
    expect(acciones.map((a) => a.accion)).toEqual(['cola.override', 'cola.reset']);

    const { rows: sesion } = await pool.query<{ reauth_factor: string }>(
      `select s.reauth_factor from sesiones s join usuarios u on u.id = s.usuario_id
        where u.email = 'superadmin@asotracmet.test' and s.revocada_en is null`,
    );
    expect(sesion.map((s) => s.reauth_factor)).toEqual(['totp']);
  });

  it('usuarios y placas de asociado se persisten: crear, entrar, cambiar rol', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    const creado = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios',
      headers: conToken(superadmin),
      payload: {
        email: 'member.qor007@asotracmet.test',
        nombre: 'Asociado 03',
        rol: 'member',
        asociadoId: uuidSemilla('a-03'),
        vehiculoIds: [uuidSemilla('veh-QOR007')],
      },
    });
    expect(creado.statusCode, creado.body).toBe(201);
    const id = (creado.json() as { id: string }).id;
    try {
      const { rows: placas } = await pool.query<{ placa: string }>(
        `select v.placa from usuario_vehiculos uv join vehiculos v on v.id = uv.vehiculo_id
          where uv.usuario_id = $1`,
        [id],
      );
      expect(placas.map((p) => p.placa)).toEqual(['QOR007']);

      const token = await login('member.qor007@asotracmet.test');
      const cola = await app.inject({
        method: 'GET',
        url: '/api/v1/me/cola',
        headers: conToken(token),
      });
      expect(cola.json()).toEqual([
        { placa: 'QOR007', claseCola: 'TM-CBZ', posicion: 5, total: 10 },
      ]);

      const cambio = await app.inject({
        method: 'POST',
        url: `/api/v1/usuarios/${id}/roles`,
        headers: conToken(superadmin),
        payload: { rol: 'viewer' },
      });
      expect(cambio.statusCode, cambio.body).toBe(200);
      const { rows: despues } = await pool.query<{ rol: string; placas: string }>(
        `select u.rol, (select count(*) from usuario_vehiculos where usuario_id = u.id) as placas
           from usuarios u where u.id = $1`,
        [id],
      );
      expect(despues[0]?.rol).toBe('viewer');
      expect(Number(despues[0]?.placas)).toBe(0);
      expect(
        (await app.inject({ method: 'GET', url: '/api/v1/me', headers: conToken(token) }))
          .statusCode,
      ).toBe(401);
    } finally {
      await pool.query('delete from usuarios where id = $1', [id]);
    }
  });

  it('maestros persisten: placa nueva en la cola, documento vencido, habilitación, cuenta cifrada y tarifa única', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const creado = await app.inject({
      method: 'POST',
      url: '/api/v1/vehiculos',
      headers: conToken(hseq),
      payload: { placa: 'ZZA111', clase: 'TM', asociadoId: uuidSemilla('a-01') },
    });
    expect(creado.statusCode, creado.body).toBe(201);
    const id = (creado.json() as { id: string }).id;
    try {
      const { rows: posicion } = await pool.query<{ posicion: number }>(
        'select posicion from cola_posiciones where vehiculo_id = $1',
        [id],
      );
      expect(posicion.map((p) => Number(p.posicion))).toEqual([11]);

      const tipos = (
        await app.inject({ method: 'GET', url: '/api/v1/tipos-documento', headers: conToken(hseq) })
      ).json() as Array<{ id: string; codigo: string }>;
      const soat = tipos.find((t) => t.codigo === 'SOAT')!;
      const doc = await app.inject({
        method: 'POST',
        url: '/api/v1/documentos',
        headers: conToken(hseq),
        payload: {
          sujetoTipo: 'vehiculo',
          sujetoId: id,
          tipoId: soat.id,
          numero: 'SOAT-111',
          venceEn: '2026-09-01',
        },
      });
      expect(doc.statusCode, doc.body).toBe(201);
      expect(doc.json()).toMatchObject({ estado: 'vencido' });

      const ops = await login('ops@asotracmet.test');
      const cola = (
        await app.inject({
          method: 'GET',
          url: `/api/v1/colas/TM-CBZ?clienteId=${clienteHlbId}`,
          headers: conToken(ops),
        })
      ).json() as { posiciones: Array<{ placa: string; elegibilidad: { motivo: string | null } }> };
      expect(cola.posiciones.at(-1)).toMatchObject({
        placa: 'ZZA111',
        elegibilidad: { motivo: 'DOCUMENTO_VENCIDO' },
      });

      const hab = await app.inject({
        method: 'PUT',
        url: `/api/v1/vehiculos/${id}/habilitaciones/${clienteHlbId}`,
        headers: conToken(hseq),
        payload: { apto: false, motivoBloqueo: 'Sin curso HLB' },
      });
      expect(hab.statusCode, hab.body).toBe(200);
      const { rows: habilitacion } = await pool.query(
        'select apto, motivo_bloqueo from habilitaciones where vehiculo_id = $1',
        [id],
      );
      expect(habilitacion).toEqual([{ apto: false, motivo_bloqueo: 'Sin curso HLB' }]);

      const baja = await app.inject({
        method: 'DELETE',
        url: `/api/v1/vehiculos/${id}`,
        headers: conToken(hseq),
      });
      expect(baja.statusCode, baja.body).toBe(200);
      const { rows: vehiculo } = await pool.query<{ estado: string; deleted_at: Date | null }>(
        'select estado, deleted_at from vehiculos where id = $1',
        [id],
      );
      expect(vehiculo[0]?.estado).toBe('inactivo');
      expect(vehiculo[0]?.deleted_at).not.toBeNull();
      const { rows: sinCola } = await pool.query<{ n: string }>(
        'select count(*) as n from cola_posiciones where vehiculo_id = $1',
        [id],
      );
      expect(Number(sinCola[0]?.n)).toBe(0);
    } finally {
      await pool.query('delete from documentos where sujeto_id = $1', [id]);
      await pool.query('delete from habilitaciones where vehiculo_id = $1', [id]);
      await pool.query('delete from cola_posiciones where vehiculo_id = $1', [id]);
      await pool.query('delete from vehiculos where id = $1', [id]);
    }

    const superadmin = await login('superadmin@asotracmet.test');
    const asociado = await app.inject({
      method: 'POST',
      url: '/api/v1/asociados',
      headers: conToken(superadmin),
      payload: {
        tipo: 'persona',
        nombres: 'NUEVO',
        documento: '10990001',
        cuentaBancaria: '123456789012',
      },
    });
    expect(asociado.statusCode, asociado.body).toBe(201);
    const asociadoId = (asociado.json() as { id: string }).id;
    try {
      const { rows } = await pool.query<{ cuenta_bancaria_enc: string }>(
        'select cuenta_bancaria_enc from asociados where id = $1',
        [asociadoId],
      );
      expect(rows[0]?.cuenta_bancaria_enc).toMatch(/^v1\./);
      expect(rows[0]?.cuenta_bancaria_enc).not.toContain('123456789012');
    } finally {
      await pool.query('delete from asociados where id = $1', [asociadoId]);
    }

    const finance = await login('finance@asotracmet.test');
    const destinos = (
      await app.inject({ method: 'GET', url: '/api/v1/destinos', headers: conToken(finance) })
    ).json() as Array<{ id: string; nombre: string }>;
    const castilla = destinos.find((d) => d.nombre === 'CASTILLA LA NUEVA')!;
    // La semilla ya tiene HLB · Castilla · TM · cama_alta desde 2026-01-01: responde la unicidad de la base.
    const duplicada = await app.inject({
      method: 'POST',
      url: '/api/v1/tarifas',
      headers: conToken(finance),
      payload: {
        clienteId: clienteHlbId,
        destinoId: castilla.id,
        clase: 'TM',
        modalidad: 'cama_alta',
        valor: 1,
        vigenciaDesde: '2026-01-01',
      },
    });
    expect(duplicada.statusCode).toBe(409);
    expect(duplicada.json()).toMatchObject({ code: 'TARIFA_DUPLICADA' });
  });

  it('viajes y recaudos persisten con RLS: finance liquida con el porcentaje vigente, el TR queda cumplido y member ve solo lo suyo (TASK-0027)', async () => {
    const ops = await login('ops@asotracmet.test');
    const oferta = await app.inject({
      method: 'POST',
      url: `/api/v1/requerimientos/${REQ_HLB}/ofertas`,
      headers: conToken(ops),
    });
    const dueno = await login('member.fst189@asotracmet.test');
    const aceptada = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${(oferta.json() as { id: string }).id}/aceptar`,
      headers: conToken(dueno),
    });
    const tr = (aceptada.json() as { tr: { id: string; codigo: string } }).tr;

    const finance = await login('finance@asotracmet.test');
    const creado = await app.inject({
      method: 'POST',
      url: '/api/v1/viajes',
      headers: conToken(finance),
      payload: { trId: tr.id, fechaCargue: '2026-09-17', flete: 1_500_000 },
    });
    expect(creado.statusCode, creado.body).toBe(201);
    const viajeId = (creado.json() as { id: string }).id;
    const liquidado = await app.inject({
      method: 'POST',
      url: `/api/v1/viajes/${viajeId}/liquidar`,
      headers: conToken(finance),
    });
    expect(liquidado.statusCode, liquidado.body).toBe(200);
    expect(liquidado.json()).toMatchObject({
      estado: 'liquidado',
      porcentajeAplicado: 0.03,
      valorRecaudo: 45_000,
      recaudo: { estado: 'pendiente', valor: 45_000 },
    });

    const { rows } = await pool.query<{ estado: string; valor_recaudo: string; tr_estado: string }>(
      `select v.estado, v.valor_recaudo::text as valor_recaudo, t.estado as tr_estado
         from viajes v join trs t on t.id = v.tr_id where v.id = $1`,
      [viajeId],
    );
    expect(rows[0]).toMatchObject({
      estado: 'liquidado',
      valor_recaudo: '45000.00',
      tr_estado: 'cumplido',
    });

    const recaudoId = (liquidado.json() as { recaudo: { id: string } }).recaudo.id;
    const pago = await app.inject({
      method: 'POST',
      url: `/api/v1/recaudos/${recaudoId}/pagos`,
      headers: conToken(finance),
      payload: { valor: 45_000, fechaPago: '2026-09-20', referencia: '1234' },
    });
    expect(pago.statusCode, pago.body).toBe(200);
    expect(pago.json()).toMatchObject({ estado: 'pagado', valorPagado: 45_000 });

    const ajeno = await login('member.swi750@asotracmet.test');
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/viajes', headers: conToken(ajeno) })).json(),
    ).toEqual([]);
    expect(
      (
        await app.inject({ method: 'GET', url: '/api/v1/recaudos', headers: conToken(ajeno) })
      ).json(),
    ).toEqual([]);
    const mios = (
      await app.inject({ method: 'GET', url: '/api/v1/viajes', headers: conToken(dueno) })
    ).json() as Array<{ asociadoDocumento: string }>;
    expect(mios).toHaveLength(1);
    expect(mios[0]?.asociadoDocumento).toMatch(/^\*+\d{4}$/);

    const resumen = await app.inject({
      method: 'GET',
      url: '/api/v1/viajes/resumen?mes=2026-09',
      headers: conToken(finance),
    });
    expect(resumen.json()).toMatchObject({ recaudo: 45_000, pagado: 45_000, pendiente: 0 });
  });

  it('el job nocturno actualiza documentos.estado en la base y las alertas salen de la misma fecha (TASK-0028)', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const alertas = await app.inject({
      method: 'GET',
      url: '/api/v1/documentos/alertas',
      headers: conToken(hseq),
    });
    expect(alertas.statusCode, alertas.body).toBe(200);
    expect(
      (alertas.json() as Array<{ placa: string; estado: string }>).map((a) => [a.placa, a.estado]),
    ).toEqual([
      ['UFR114', 'vencido'],
      ['QOR007', 'por_vencer'],
    ]);

    // La semilla deja el SOAT de UFR114 como "vencido"; lo ponemos en "vigente" a mano y el job lo corrige.
    await pool.query(`update documentos set estado = 'vigente' where id = $1`, [
      uuidSemilla('doc-ufr114-soat'),
    ]);
    const job = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/recalcular-documentos',
      headers: conToken(hseq),
    });
    expect(job.statusCode, job.body).toBe(200);
    expect(job.json()).toMatchObject({ hoy: '2026-09-16' });
    const { rows } = await pool.query<{ estado: string }>(
      'select estado from documentos where id = $1',
      [uuidSemilla('doc-ufr114-soat')],
    );
    expect(rows[0]?.estado).toBe('vencido');
    const { rows: audit } = await pool.query<{ accion: string }>(
      "select accion from audit_log where accion = 'documentos.recalcular'",
    );
    expect(audit).toHaveLength(1);
  });

  it('el snapshot mensual de equidad se persiste en metricas_mes y el tablero lo lee (TASK-0029)', async () => {
    const ops = await login('ops@asotracmet.test');
    const oferta = await app.inject({
      method: 'POST',
      url: `/api/v1/requerimientos/${REQ_HLB}/ofertas`,
      headers: conToken(ops),
    });
    const dueno = await login('member.fst189@asotracmet.test');
    await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${(oferta.json() as { id: string }).id}/aceptar`,
      headers: conToken(dueno),
    });
    const superadmin = await login('superadmin@asotracmet.test');
    const job = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/snapshot-metricas',
      headers: conToken(superadmin),
      payload: { mes: '2026-09' },
    });
    expect(job.statusCode, job.body).toBe(200);
    const { rows } = await pool.query<{ placa: string; ofrecidas: number; tomadas: number }>(
      `select v.placa, m.ofrecidas, m.tomadas from metricas_mes m join vehiculos v on v.id = m.vehiculo_id where m.mes = '2026-09'`,
    );
    expect(rows).toEqual([{ placa: 'FST189', ofrecidas: 1, tomadas: 1 }]);
    const viewer = await login('viewer@asotracmet.test');
    const snapshot = await app.inject({
      method: 'GET',
      url: '/api/v1/tablero/snapshots?mes=2026-09',
      headers: conToken(viewer),
    });
    expect(snapshot.statusCode, snapshot.body).toBe(200);
    expect(snapshot.json()).toMatchObject({
      mes: '2026-09',
      filas: [{ placa: 'FST189', tomadas: 1 }],
    });
    const vivo = await app.inject({
      method: 'GET',
      url: '/api/v1/tablero?mes=2026-09',
      headers: conToken(viewer),
    });
    expect(vivo.json()).toMatchObject({ ofertas: { ofrecidas: 1, aceptadas: 1 } });
  });
});
