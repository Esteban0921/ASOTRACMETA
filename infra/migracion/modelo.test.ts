import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  claseDe,
  fechaExcel,
  leerLibro,
  marca,
  nombreCanonico,
  normalizarPlaca,
  numero,
  type Celda,
  type Libro,
} from './excel.js';
import { construirPlan, type Plan } from './modelo.js';

// Tests del plan de migración (TASK-0025). El libro sintético reproduce la forma de cada hoja
// (mismas columnas que el Excel real) con datos inventados; el test sobre el xlsx real se omite si
// el archivo no está (vive fuera de git por contener PII).

describe('normalizadores (spec §13.1.2)', () => {
  it('normaliza placas y rechaza las que no cumplen el formato', () => {
    expect(normalizarPlaca('SUL 470')).toBe('SUL470');
    expect(normalizarPlaca('TSV868 ')).toBe('TSV868');
    expect(normalizarPlaca('tfw-561')).toBe('TFW561');
    expect(normalizarPlaca('TR-41946')).toBeNull();
    expect(normalizarPlaca('')).toBeNull();
  });

  it('convierte seriales de Excel y fechas dd/mm/aa', () => {
    expect(fechaExcel(46281)).toBe('2026-09-16');
    expect(fechaExcel(46266)).toBe('2026-09-01');
    expect(fechaExcel('16/09/26')).toBe('2026-09-16');
    expect(fechaExcel('2026-09-16T00:00:00.000Z')).toBe('2026-09-16');
    expect(fechaExcel('VENCIDA')).toBeNull();
    expect(fechaExcel(800)).toBeNull();
  });

  it('lee marcas X/NA/NO del TURNERO y clases con sufijo', () => {
    expect(marca('X')).toBe('X');
    expect(marca('NA REP')).toBe('NA');
    expect(marca('no')).toBe('NO');
    expect(marca('')).toBeNull();
    expect(claseDe('TM - CA')).toBe('TM');
    expect(claseDe('MM -CA')).toBe('MM');
    expect(claseDe('C350')).toBe('C350');
    expect(claseDe('CAMION')).toBeNull();
    expect(numero('1,750,905.00')).toBe(1750905);
    expect(numero('88300 /82800')).toBeNull();
    expect(nombreCanonico('CHICHCIMENE - ')).toBe('CHICHCIMENE');
  });
});

function libroSintetico(): Libro {
  const f = (...celdas: Celda[]): Celda[] => celdas;
  const vacio = (n: number): Celda[] => Array.from({ length: n }, () => null);
  const listaTm: Celda[][] = [
    f('ITEM', 'PROPIETARIO', 'CC'),
    // cols: 10 placa, 11 modelo, 12 repot, 13 km, 14 soat, 18 trailer, 23 gps, 24-25 credenciales GPS (nunca),
    // 26-29 conductor, 30-31 correo secundario y contraseña (nunca)
    [
      ...f(
        1,
        'ELKIN GIOVANNI MOYA DUARTE',
        '86048175',
        null,
        '3167131053',
        null,
        'emoya@ejemplo.test',
        null,
        null,
        null,
      ),
      ...f(
        'SOF336',
        2006,
        2018,
        838288,
        46300,
        null,
        null,
        null,
        'R35371',
        null,
        null,
        null,
        null,
        'rastreoflotas',
        'usuario-gps',
        'clave-gps',
      ),
      ...f('JHON CASTRO', '1121961389', '3028680243', null, 'otro@ejemplo.test', 'clave-correo'),
    ],
    [
      ...vacio(10),
      ...f(
        'FST189',
        2021,
        'NA',
        51403,
        'VENCIDA',
        null,
        null,
        null,
        'R34425',
        null,
        null,
        null,
        null,
        'rastreoflotas',
        null,
        null,
      ),
      ...f('ELKIN MOYA', '86048175', '3167131053'),
    ],
    f('ITEM', 'NOMBRES Y APELLIDOS', 'CC'),
    f(
      1,
      'ELKIN GIOVANNI MOYA DUARTE',
      '86048175',
      27719,
      '3167131053',
      'CARRERA 3B',
      'emoya@ejemplo.test',
      '84923709656',
      500000,
      46155,
      '1300',
    ),
    f(
      2,
      'MILLER ALEXANDER FALLA PARDO',
      '1121893990',
      null,
      '3143025222',
      null,
      'miller@ejemplo.test',
      null,
      500000,
      46155,
    ),
    f(null, null, null, null, null, null, null, null, 16000000),
  ];
  const listaAsociados: Celda[][] = [
    f(
      'ITEM',
      'CC',
      'ASOCIADO',
      'TIPO DE VEHICULO',
      'PLACA',
      'PROPIETARIO',
      'CC O NIT',
      'PARENTESCO',
    ),
    f(1, null, null, 'TM', 'SWI750', 'LUCIANO ROMERO GALLEGO', '86002771'),
    f(2, '1121893990', 'MILLER ALEXANDER FALLA PARDO', 'TM', 'QJM003'),
    f(3, null, null, 'C100', 'PVO538', 'JORGE LUIS FONSECA GUZMAN', '1119889272'),
    f(4, '86048175', 'ELKIN GIOVANNI MOYA DUARTE', 'TM', 'SOF336'),
    f(5, null, null, 'MM', 'SUL 470', 'SANDRA VARGAS', '53891350', 'ESPOSA'),
  ];
  const turnero: Celda[][] = [
    [...vacio(22), 'FECHA: 16/09/26'],
    f('HORA', 'TURNOS', 'TIPO DE VEHICULO'),
    f(
      null,
      1,
      'TM',
      'NO',
      13,
      2006,
      2018,
      'SWI750',
      'LUCIANO R',
      'X',
      'NA',
      'X',
      'X',
      'X',
      'NA',
      'X',
      'X',
      'NA',
      'X',
      'X',
      'X',
      null,
      null,
      'DISPONIBLE',
    ),
    f(
      null,
      2,
      'TM',
      'SI',
      12.3,
      2021,
      'NA',
      'FST189',
      'ELKIN M',
      'X',
      'X',
      'X',
      'X',
      'X',
      'X',
      'X',
      'X',
      'X',
      'X',
      'X',
    ),
    f(null, 3, 'C100', null, null, 2024, 'NA', 'PUO538', 'FONSECA'),
    f(null, 'EN RUTA O EN MANTENIMIENTO'),
    f(null, 1, 'TM', 'SI', 13, 2011, 2022, 'QJM003', 'MILLER F', 'X', 'NA REP', 'NO'),
    f(null, 'CONTROL DE SANCIONES MES DE SEPTIEMBRE'),
    f(null, 'ITEM', 'TIPO DE VEHICULO', 'PLACA'),
    f(
      null,
      1,
      'TM',
      'QJM003',
      'MILLER F',
      'DECLINA VIAJE SIN JUSTA CAUSA',
      null,
      null,
      null,
      null,
      null,
      '19 num 1',
      null,
      46276,
      46277,
    ),
  ];
  const control: Celda[][] = [
    f(
      'ITEM',
      'FECHA ASIGNACION',
      null,
      'C100',
      null,
      'C350',
      null,
      'C600',
      null,
      'MM',
      null,
      'TM - CBZ',
    ),
    f(1, 46267, null, null, 1, 'TR-41175', 3, 'DECLINA', 2, 'DECLINO', 2, 'TR-41160'),
    f(2, 46267, null, null, 2, 'TR-41175', null, null, null, null, 3, 'TR-'),
    f(3, 46268, null, null, null, null, null, null, null, null, 1, 'TR-39591-1'),
    f(4, null, 2, null, 2, null, 2, null, 1, null, 3),
  ];
  const serv: Celda[][] = [
    f(null, null, null, 'correo: x'),
    f('CONTROL RUTAS SEPTIEMBRE 2026'),
    f(
      'ITEM',
      'TIPO DE VEHICULO',
      'PLACA',
      'PROPIETARIO',
      'CC',
      'HLB',
      'TENARIS',
      'QMAX',
      'WTF',
      'BAKER',
      'SLB',
      'FECHA CARGUE',
    ),
    f(
      1,
      'TM',
      'SWI750',
      'LUCIANO R',
      null,
      null,
      null,
      null,
      null,
      'BAKER',
      null,
      46266,
      46267,
      'CAÑO SUR CON RETORNO',
      'MASA',
      8873490,
      266204.7,
      266205,
      0.3,
      46269,
      '49500',
    ),
    f(
      2,
      'TM',
      'FST189',
      'ELKIN M',
      null,
      'CBZ',
      null,
      null,
      null,
      null,
      null,
      46276,
      null,
      'CASTILLA',
      'MASA',
      2028720,
      60861.6,
      60896,
      34.4,
      46280,
      '36200',
      46281,
      '36300',
    ),
    f(
      3,
      'MM',
      'SUL 470',
      'ANDRES V',
      null,
      null,
      'CA',
      null,
      null,
      null,
      null,
      46276,
      null,
      'ACACIAS',
      'SERVILLANOS',
      1450000,
      43500,
      null,
      -43500,
    ),
    f(
      4,
      'C600',
      null,
      'SANTIAGO B',
      null,
      null,
      null,
      null,
      null,
      'NABORS',
      null,
      46270,
      null,
      'TIGANA',
      'TIERRACOL',
      1800000,
      54000,
      54000,
      0,
    ),
    f(
      5,
      'TM',
      'QJM003',
      'MILLER F',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      46270,
      46269,
      'RUBIALES',
      'MASA',
      1000000,
      20000,
      20000,
      0,
      46271,
      '1',
    ),
    f(
      6,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      0,
      null,
      0,
    ),
  ];
  const tarifas: Celda[][] = [
    f(null, null, null, null, null, 'HALLIBURTON'),
    f('ITEM', 'RUTA', null, 'KM', 'HLB TM'),
    f(null, 'ORIGEN', 'DESTINO'),
    [
      ...f(1, 'VILLAVICENCIO', 'CASTILLA LA NUEVA (EST. CAST. 3)', 66),
      ...f(
        1540500,
        1648335,
        2133000,
        2282310,
        1896000,
        2028720,
        1352480,
        1447153.6,
        1548454.35,
        929830,
        718505,
        600000,
        null,
      ),
      ...f(1168844.95, 1043828.3, 756265.97, 418745.08, 315575.99, null),
      ...f(1291071.6, 1331287.27, 1260850.16, 552790.62, 433415.58, 406879.94, 344963.42),
    ],
    f(2, 'VILLAVICENCIO', 'CHICHCIMENE - ', 67),
    f(3, 'VILLAVICENCIO', 'ACACIAS', 28, 1000000),
  ];
  const datosServicios: Celda[][] = [
    f('PLACA', 'FST189', null, 'PLACA', null),
    f('TRAILER', 'R34425', null, 'TRAILER', null),
    f('CONDUCTOR', 'JHON FREDDY CASTRO BARBOSA', null, 'CONDUCTOR', 'ANDERSON ROMERO'),
    f('CEDULA', '1121961389', null, 'CEDULA', '1120371177'),
    f('CELULAR', '3028680243', null, 'CELULAR', '3133135737'),
    f('POSEEDOR', 'ELKIN GIOVANNI MOYA', null, 'POSEEDOR', 'ANDERSON FABIAN ROMERO CARDONA'),
    f('NIT O CC', '86048175', null, 'NIT O CC', '1120371177'),
    f('CELULAR', '3167131053', null, 'CELULAR', '3133135737'),
  ];
  return new Map<string, Celda[][]>([
    ['LISTA TM', listaTm],
    ['LISTA ASOCIADOS', listaAsociados],
    ['TURNERO', turnero],
    ['CONTROL TURNOS HLB SEPT', control],
    ['SERV SEPT26', serv],
    ['TARIFAS HLB', tarifas],
    ['DATOS DE SERVICIOS', datosServicios],
  ]);
}

function tipos(plan: Plan): Set<string> {
  return new Set(plan.excepciones.map((e) => e.tipo));
}

describe('construirPlan sobre un libro sintético con la forma del Excel real', () => {
  const plan = construirPlan(libroSintetico(), { porcentajeRecaudo: 0.03 });

  it('deduplica asociados y placas entre hojas y aplica alias de erratas (§13.1.1-2)', () => {
    const placas = plan.vehiculos.map((v) => v.placa).sort();
    expect(placas).toEqual(['FST189', 'PVO538', 'QJM003', 'SOF336', 'SUL470', 'SWI750']);
    expect(plan.asociados.map((a) => a.documento).sort()).toEqual(
      ['1119889272', '1120371177', '1121893990', '86002771', '86048175'].sort(),
    );
    expect(tipos(plan)).toContain('placa_alias');
    expect(plan.fechaFoto).toBe('2026-09-16');
  });

  it('resuelve el asociado por precedencia y deja inactivas las placas sin dueño gremial', () => {
    const por = Object.fromEntries(plan.vehiculos.map((v) => [v.placa, v]));
    expect(por.SOF336?.asociadoDocumento).toBe('86048175');
    expect(por.FST189?.asociadoDocumento).toBe('86048175'); // bloque del propietario en LISTA TM
    expect(por.SWI750?.asociadoDocumento).toBe('86002771'); // propietario sin parentesco
    expect(por.PVO538?.asociadoDocumento).toBe('1119889272');
    expect(por.QJM003?.asociadoDocumento).toBe('1121893990');
    expect(por.SUL470?.asociadoDocumento).toBeNull(); // esposa como propietaria, dueño desconocido
    expect(por.SUL470?.estado).toBe('inactivo');
    expect(por.FST189?.trailerPlaca).toBe('R34425');
    expect(por.FST189?.gpsProveedor).toBe('rastreoflotas');
    expect(por.QJM003?.noElegibleHasta).toBe('2026-09-12T23:59:59-05:00');
    expect(tipos(plan)).toContain('placa_no_asociada');
    expect(tipos(plan)).toContain('sancion');
  });

  it('nunca copia credenciales: ni GPS ni correo secundario (§12, §13.1.7)', () => {
    const json = JSON.stringify(plan);
    expect(json).not.toContain('clave-gps');
    expect(json).not.toContain('usuario-gps');
    expect(json).not.toContain('clave-correo');
    expect(json).not.toContain('otro@ejemplo.test');
    // La cuenta bancaria sí viaja en el plan (se cifra al cargar), nunca una contraseña.
    expect(plan.asociados.find((a) => a.documento === '86048175')?.cuentaBancaria).toBe(
      '84923709656',
    );
  });

  it('mapea X/NA/NO a habilitaciones y documentos con fecha (§13.1.3)', () => {
    const hab = (placa: string, cliente: string) =>
      plan.habilitaciones.find((h) => h.placa === placa && h.cliente === cliente);
    expect(hab('SWI750', 'HLB')?.apto).toBe(true);
    expect(hab('SWI750', 'GEOPARK')?.apto).toBe(false);
    // Catálogo cerrado (TASK-0059): la marca del TURNERO queda como nota bajo OTRO.
    expect(hab('SWI750', 'GEOPARK')?.motivoBloqueoCodigo).toBe('OTRO');
    expect(hab('SWI750', 'GEOPARK')?.nota).toMatch(/NA/);
    expect(hab('QJM003', 'TENARIS')?.apto).toBe(false);
    expect(hab('QJM003', 'TENARIS')?.motivoBloqueoCodigo).toBe('OTRO');
    expect(hab('QJM003', 'TENARIS')?.nota).toMatch(/NO/);
    expect(hab('SWI750', 'HLB')?.motivoBloqueoCodigo).toBeNull();
    expect(hab('SWI750', 'HLB')?.nota).toBeNull();
    expect(hab('QJM003', 'SLB')).toBeUndefined(); // sin marca: sin fila
    expect(hab('SWI750', 'HLB')?.requisitos.OBSERVACIONES).toBe('DISPONIBLE');
    expect(plan.documentos).toContainEqual({
      placa: 'SOF336',
      tipo: 'SOAT',
      venceEn: '2026-10-05',
    });
    expect(tipos(plan)).toContain('documento_sin_fecha');
    expect(tipos(plan)).toContain('habilitacion_sin_dato');
  });

  it('importa tarifas con vigencia 2026-01-01 y lista destinos sin tarifa (§13.1.4)', () => {
    expect(plan.destinos.map((d) => d.nombre)).toEqual([
      'CASTILLA LA NUEVA (EST. CAST. 3)',
      'CHICHCIMENE',
      'ACACIAS',
    ]);
    expect(plan.tarifas).toHaveLength(25);
    expect(plan.tarifas[0]).toEqual({
      cliente: 'HLB',
      destino: 'CASTILLA LA NUEVA (EST. CAST. 3)',
      clase: 'TM',
      modalidad: 'cama_alta',
      valor: 1540500,
      vigenciaDesde: '2026-01-01',
    });
    expect(
      plan.tarifas.some(
        (t) => t.cliente === 'WTF' && t.modalidad === 'estaca' && t.valor === 344963.42,
      ),
    ).toBe(true);
    expect(tipos(plan)).toContain('tarifa_sin_valor');
  });

  it('reconstruye la cola desde el TURNERO con N = activos por clase (§13.3)', () => {
    const tm = plan.posiciones
      .filter((p) => p.claseCola === 'TM-CBZ')
      .sort((a, b) => a.posicion - b.posicion);
    expect(tm.map((p) => p.placa)).toEqual(['SWI750', 'FST189', 'QJM003', 'SOF336']);
    expect(tm.map((p) => p.posicion)).toEqual([1, 2, 3, 4]);
    expect(plan.posiciones.filter((p) => p.claseCola === 'C100').map((p) => p.placa)).toEqual([
      'PVO538',
    ]);
    expect(plan.posiciones.filter((p) => p.claseCola === 'MM')).toHaveLength(0);
    expect(tm.find((p) => p.placa === 'SWI750')?.turnosTomados).toBe(1);
  });

  it('crea viajes con TR sintético, recaudo recalculado y diferencias listadas (§13.1.6, §13.3)', () => {
    expect(plan.viajes.map((v) => v.codigoTr)).toEqual([
      'TR-1202609001',
      'TR-1202609002',
      'TR-1202609003',
      'TR-1202609005',
    ]);
    const v2 = plan.viajes[1]!;
    expect(v2.cliente).toBe('HLB');
    expect(v2.modalidad).toBe('cabezote');
    expect(v2.valorRecaudo).toBe(60862);
    expect(v2.estadoRecaudo).toBe('pagado');
    expect(v2.referenciaPago).toBe('36200 / 36300');
    expect(v2.destino).toBeNull();
    const v1 = plan.viajes[0]!;
    expect(v1.cliente).toBe('BAKER');
    expect(v1.fechaDescargue).toBe('2026-09-02');
    const v3 = plan.viajes[2]!;
    expect(v3.destino).toBe('ACACIAS');
    expect(v3.asociadoDocumento).toBeNull();
    const v5 = plan.viajes[3]!;
    expect(v5.cliente).toBe('SIN_CLIENTE');
    expect(v5.fechaDescargue).toBeNull();
    expect(plan.transportadoras).toEqual(['MASA', 'SERVILLANOS']);
    for (const t of [
      'placa_invalida',
      'placa_sin_asociado',
      'recaudo_distinto',
      'destino_no_canonico',
      'fecha_invalida',
    ]) {
      expect(tipos(plan)).toContain(t);
    }
  });

  it('reporta TR duplicados, `TR-` vacío, DECLINO y sufijos de CONTROL TURNOS (§13.1.8)', () => {
    for (const t of ['tr_duplicado', 'tr_vacio', 'declino_vs_declina', 'tr_sufijo']) {
      expect(tipos(plan)).toContain(t);
    }
    expect(plan.resumenControl).toEqual([
      {
        hoja: 'CONTROL TURNOS HLB SEPT',
        asignacionesConTr: 3,
        declinas: 2,
        pendientes: 0,
        canceladas: 0,
      },
    ]);
  });

  it('crea un usuario member por asociado con correo y lo liga a sus placas', () => {
    expect(plan.usuariosMember).toEqual([
      {
        email: 'emoya@ejemplo.test',
        nombre: 'ELKIN GIOVANNI MOYA DUARTE',
        asociadoDocumento: '86048175',
        placas: ['FST189', 'SOF336'],
      },
      {
        email: 'miller@ejemplo.test',
        nombre: 'MILLER ALEXANDER FALLA PARDO',
        asociadoDocumento: '1121893990',
        placas: ['QJM003'],
      },
    ]);
    expect(plan.conductores.map((c) => c.documento).sort()).toEqual([
      '1120371177',
      '1121961389',
      '86048175',
    ]);
    expect(plan.vehiculoConductores).toContainEqual({
      placa: 'SOF336',
      conductorDocumento: '1121961389',
      esPrincipal: true,
    });
    expect(plan.vehiculoConductores).toContainEqual({
      placa: 'FST189',
      conductorDocumento: '1121961389',
      esPrincipal: false,
    });
  });
});

const RUTA_REAL =
  process.env.XLSX_LEGADO ??
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../RECURSOS/control de enturnamiento.xlsx',
  );

describe.skipIf(!existsSync(RUTA_REAL))(
  'xlsx real (se omite si no está; nunca se commitea)',
  () => {
    it('cumple los criterios de done de §13.3 y lista las excepciones de §13.1.8', async () => {
      const plan = construirPlan(await leerLibro(RUTA_REAL), { porcentajeRecaudo: 0.03 });
      const placas = new Set(plan.vehiculos.map((v) => v.placa));
      for (const viaje of plan.viajes) expect(placas.has(viaje.placa)).toBe(true);
      for (const claseCola of new Set(plan.posiciones.map((p) => p.claseCola))) {
        const posiciones = plan.posiciones
          .filter((p) => p.claseCola === claseCola)
          .map((p) => p.posicion)
          .sort((a, b) => a - b);
        const activos = plan.vehiculos.filter(
          (v) => v.estado === 'activo' && v.claseCola === claseCola,
        ).length;
        expect(posiciones).toEqual(Array.from({ length: activos }, (_, i) => i + 1));
      }
      for (const viaje of plan.viajes) {
        if (viaje.flete !== null) expect(viaje.valorRecaudo).toBe(Math.round(viaje.flete * 0.03));
      }
      for (const t of [
        'tr_duplicado',
        'tr_vacio',
        'declino_vs_declina',
        'tr_sufijo',
        'destino_no_canonico',
        'placa_no_asociada',
      ]) {
        expect(tipos(plan)).toContain(t);
      }
      expect(JSON.stringify(plan)).not.toMatch(/Colombia2023|VIAGPS2024/);
      expect(plan.viajes.length).toBeGreaterThan(200);
    });
  },
);
