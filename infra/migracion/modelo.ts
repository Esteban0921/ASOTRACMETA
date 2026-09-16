import { claseColaDe, type ClaseCola, type ClaseVehiculo } from '@asotracmet/shared';
import {
  claseDe,
  esCorreo,
  fechaExcel,
  marca,
  nombreCanonico,
  normalizarPlaca,
  numero,
  texto,
  type Celda,
  type Fila,
  type Filas,
  type Libro,
  type Marca,
} from './excel.js';

// Plan de migración (spec §13): del Excel legado a un conjunto de filas listas para Postgres.
// Es puro (sin base de datos ni ficheros) para poder testearlo y para que `--sin-db` produzca el
// informe. Las decisiones de §13.2 están en `DECISIONES` y en docs/migracion-excel.md; nada se
// adivina en silencio: lo que no cuadra va a `excepciones`.

export const DECISIONES: readonly string[] = [
  'Un asociado / varias placas: una fila en `asociados`, N filas en `vehiculos` (§13.2).',
  '`TM` y `CBZ` comparten la cola `TM-CBZ` (§13.2, `claseColaDe`).',
  'Los TR de las hojas SERV son sintéticos `TR-1AAAAMMNNN` (año, mes, ítem): las planillas CONTROL TURNOS traen el código pero no la placa, así que no se puede atribuir un TR real sin la planilla física (§13.1.6).',
  'El flete del SERV gana como `viajes.flete`; la tarifa HLB/Baker/Weatherford queda referencial en `tarifas` con vigencia 2026-01-01 (§13.1.4, §13.2).',
  'La cola se reconstruye desde la hoja TURNERO (foto del día): disponibles en su orden, luego "en ruta o en mantenimiento", luego el resto de vehículos activos. N = vehículos activos de la clase (§13.3).',
  'Precedencia del asociado (poseedor gremial) de una placa: LISTA ASOCIADOS (columna ASOCIADO; si falta, PROPIETARIO sin parentesco) > bloque del propietario en LISTA TM > POSEEDOR de DATOS DE SERVICIOS > CC de las hojas SERV > nombre corto del TURNERO/SERV (solo si es inequívoco). LISTA ASOCIADOS es la lista de afiliación vigente; LISTA TM conserva dueños anteriores y sus diferencias se listan. Un mismo nombre con dos documentos se unifica bajo el primero.',
  'Precedencia de la clase de una placa: LISTA TM > LISTA ASOCIADOS > TURNERO > SERV; las diferencias se listan.',
  'Placas que solo aparecen en SERV y no pertenecen a ningún asociado se crean `inactivo` y fuera de la cola (terceros que hicieron viajes).',
  'La segunda columna de cada modalidad TM en TARIFAS HLB (= primera × 1,07) se importa como modalidad `*_2`; su significado queda por confirmar con la asociación.',
  'Nunca se leen las columnas de usuario/contraseña de GPS ni la contraseña de correo de LISTA TM (spec §12, §13.1.7). La cuenta bancaria se cifra en aplicación.',
  'No se migran COSTOS SALARIO, PRESUPUESTO, REG ASIST ni CORREOS: no son datos de operación del enturnamiento (no hay tabla destino).',
];

/** Erratas de placa detectadas al cruzar hojas (misma fila de asociado, misma clase). */
export const ALIAS_PLACAS: Readonly<Record<string, string>> = {
  PUO538: 'PVO538', // TURNERO vs LISTA ASOCIADOS (JORGE FONSECA, C100)
  QJL599: 'QJL566', // TURNERO vs LISTA ASOCIADOS (JORGE FONSECA, MM)
};

export type TipoExcepcion =
  | 'placa_invalida'
  | 'placa_alias'
  | 'placa_sin_asociado'
  | 'placa_no_asociada'
  | 'asociado_por_nombre'
  | 'asociado_conflicto'
  | 'asociado_documento_discrepante'
  | 'clase_conflicto'
  | 'tr_duplicado'
  | 'tr_vacio'
  | 'declino_vs_declina'
  | 'tr_sufijo'
  | 'destino_no_canonico'
  | 'recaudo_distinto'
  | 'fecha_invalida'
  | 'documento_sin_fecha'
  | 'correo_duplicado'
  | 'habilitacion_sin_dato'
  | 'sancion'
  | 'tarifa_sin_valor'
  | 'conductor_sin_documento'
  | 'fila_ignorada'
  | 'hoja_ausente';

export interface Excepcion {
  tipo: TipoExcepcion;
  hoja: string;
  fila: number | null;
  detalle: string;
}

export interface PlanAsociado {
  documento: string;
  documentoTipo: 'CC' | 'NIT';
  tipo: 'persona' | 'empresa';
  nombres: string;
  celular: string | null;
  correo: string | null;
  direccion: string | null;
  /** En claro dentro del plan; `cargar.ts` la cifra antes de escribirla (spec §12). */
  cuentaBancaria: string | null;
  fechaAfiliacion: string | null;
}

export interface PlanVehiculo {
  placa: string;
  clase: ClaseVehiculo;
  claseCola: ClaseCola;
  tipoCarroceria: string | null;
  modelo: number | null;
  repotenciacion: number | null;
  largoMts: number | null;
  kmRecorrido: number | null;
  asociadoDocumento: string | null;
  propietarioNombre: string | null;
  propietarioDocumento: string | null;
  parentesco: string | null;
  trailerPlaca: string | null;
  gpsProveedor: string | null;
  estado: 'activo' | 'inactivo';
  noElegibleHasta: string | null;
}

export interface PlanConductor {
  documento: string;
  nombres: string;
  celular: string | null;
  correo: string | null;
  asociadoDocumento: string | null;
}

export interface PlanVehiculoConductor {
  placa: string;
  conductorDocumento: string;
  esPrincipal: boolean;
}

export interface PlanDocumento {
  placa: string;
  tipo: string;
  venceEn: string;
}

export interface PlanHabilitacion {
  placa: string;
  cliente: string;
  apto: boolean;
  motivoBloqueo: string | null;
  requisitos: Record<string, string>;
}

export interface PlanDestino {
  nombre: string;
  km: number | null;
}

export interface PlanTarifa {
  cliente: string;
  destino: string;
  clase: ClaseVehiculo;
  modalidad: string;
  valor: number;
  vigenciaDesde: string;
}

export interface PlanPosicion {
  claseCola: ClaseCola;
  placa: string;
  posicion: number;
  turnosTomados: number;
}

export interface PlanViaje {
  codigoTr: string;
  hoja: string;
  fila: number;
  placa: string;
  claseCola: ClaseCola;
  cliente: string;
  modalidad: string | null;
  fechaServicio: string;
  fechaCargue: string | null;
  fechaDescargue: string | null;
  lugarDescargue: string | null;
  destino: string | null;
  transportadora: string | null;
  flete: number | null;
  porcentajeAplicado: number;
  valorRecaudo: number | null;
  valorPagado: number;
  fechaPago: string | null;
  referenciaPago: string | null;
  estadoViaje: 'cargado' | 'liquidado';
  estadoRecaudo: 'pendiente' | 'parcial' | 'pagado' | null;
  asociadoDocumento: string | null;
}

export interface PlanUsuarioMember {
  email: string;
  nombre: string;
  asociadoDocumento: string;
  placas: string[];
}

export interface PlanCliente {
  codigo: string;
  nombre: string;
  requiereHabilitacion: boolean;
}

export interface PlanTipoDocumento {
  codigo: string;
  nombre: string;
  bloqueante: boolean;
}

export interface ResumenControl {
  hoja: string;
  asignacionesConTr: number;
  declinas: number;
  pendientes: number;
  canceladas: number;
}

export interface Plan {
  fechaFoto: string;
  porcentajeRecaudo: number;
  decisiones: readonly string[];
  clientes: PlanCliente[];
  tiposDocumento: PlanTipoDocumento[];
  transportadoras: string[];
  destinos: PlanDestino[];
  tarifas: PlanTarifa[];
  asociados: PlanAsociado[];
  vehiculos: PlanVehiculo[];
  conductores: PlanConductor[];
  vehiculoConductores: PlanVehiculoConductor[];
  documentos: PlanDocumento[];
  habilitaciones: PlanHabilitacion[];
  posiciones: PlanPosicion[];
  viajes: PlanViaje[];
  usuariosMember: PlanUsuarioMember[];
  resumenControl: ResumenControl[];
  excepciones: Excepcion[];
}

export interface OpcionesPlan {
  /** `parametros.recaudo_porcentaje` (RULE-012): viene de la base o del default de shared. */
  porcentajeRecaudo: number;
  /** Fecha de la foto del TURNERO si la hoja no la trae. */
  fechaFoto?: string;
}

// ---- Catálogos que el Excel usa implícitamente ----

const CLIENTES: PlanCliente[] = [
  { codigo: 'HLB', nombre: 'Halliburton', requiereHabilitacion: true },
  { codigo: 'BAKER', nombre: 'Baker Hughes', requiereHabilitacion: true },
  { codigo: 'WTF', nombre: 'Weatherford', requiereHabilitacion: true },
  { codigo: 'QMAX', nombre: 'Qmax', requiereHabilitacion: true },
  { codigo: 'TENARIS', nombre: 'Tenaris', requiereHabilitacion: true },
  { codigo: 'SLB', nombre: 'SLB', requiereHabilitacion: true },
  { codigo: 'NABORS', nombre: 'Nabors', requiereHabilitacion: true },
  { codigo: 'GEOPARK', nombre: 'Geopark', requiereHabilitacion: true },
  { codigo: 'FRONTERA', nombre: 'Frontera', requiereHabilitacion: true },
  { codigo: 'TECPETROL', nombre: 'Tecpetrol', requiereHabilitacion: true },
  { codigo: 'WIS', nombre: 'Wellbore Integrity Solutions', requiereHabilitacion: true },
  {
    codigo: 'GRUPO_BAKER',
    nombre: 'Baker / Estrella / Nabors / NOV / Superior (sin detalle en el legado)',
    requiereHabilitacion: true,
  },
  {
    codigo: 'SIN_CLIENTE',
    nombre: 'Sin cliente registrado (legado)',
    requiereHabilitacion: false,
  },
];

const TIPOS_DOCUMENTO: PlanTipoDocumento[] = [
  { codigo: 'SOAT', nombre: 'SOAT', bloqueante: true },
  { codigo: 'TECNOMEC', nombre: 'Revisión técnico-mecánica', bloqueante: true },
  { codigo: 'POLIZA', nombre: 'Póliza de responsabilidad civil', bloqueante: true },
  { codigo: 'QUINTA_RUEDA', nombre: 'Certificación quinta rueda', bloqueante: false },
  { codigo: 'KING_PIN', nombre: 'Certificación king pin', bloqueante: false },
  { codigo: 'CADENAS', nombre: 'Certificación cadenas', bloqueante: false },
  { codigo: 'RACHETS', nombre: 'Certificación rachets', bloqueante: false },
  { codigo: 'SLINGAS', nombre: 'Certificación slingas', bloqueante: false },
];

/**
 * Columna de LISTA TM → tipo de documento. Las columnas 24-25 (usuario/contraseña GPS) y 30-31
 * (segundo correo y su contraseña) no existen para este módulo (spec §12, §13.1.7).
 */
const DOCUMENTOS_LISTA_TM: ReadonlyArray<readonly [number, string]> = [
  [14, 'SOAT'],
  [15, 'TECNOMEC'],
  [16, 'POLIZA'],
  [17, 'QUINTA_RUEDA'],
  [19, 'KING_PIN'],
  [20, 'CADENAS'],
  [21, 'RACHETS'],
  [22, 'SLINGAS'],
];

/** Columnas de habilitación del TURNERO (0-based) por cliente. Varias columnas = todas deben estar en `X`. */
const HABILITACIONES_TURNERO: ReadonlyArray<readonly [string, readonly number[]]> = [
  ['HLB', [9]],
  ['GEOPARK', [10, 14, 17]],
  ['TENARIS', [11]],
  ['TECPETROL', [12]],
  ['FRONTERA', [13, 16]],
  ['QMAX', [15]],
  ['WTF', [18, 19]],
  ['BAKER', [20]],
  ['NABORS', [20]],
  ['SLB', [21]],
];

const CABECERAS_TURNERO: readonly string[] = [
  'HLB_OTROS',
  'HLB_GEOPARK_15',
  'TENARIS_OTROS',
  'TENARIS_TECPETROL_10',
  'TENARIS_FRONTERA_15',
  'TENARIS_GEOPARK_15',
  'QMAX_OTROS',
  'QMAX_FRONTERA_15',
  'QMAX_GEOPARK_15',
  'WTF_CURSO_SEG_VIAL',
  'WTF_LIC_5_ANIOS',
  'BAKER_ESTRELLA_NABORS_NOV_SUPERIOR',
  'SLB',
  'CARNET_ECOPETROL_F3_FOMENTO',
];

interface ColumnaTarifa {
  col: number;
  cliente: string;
  clase: ClaseVehiculo;
  modalidad: string;
}

const COLUMNAS_TARIFAS: readonly ColumnaTarifa[] = [
  { col: 4, cliente: 'HLB', clase: 'TM', modalidad: 'cama_alta' },
  { col: 5, cliente: 'HLB', clase: 'TM', modalidad: 'cama_alta_2' },
  { col: 6, cliente: 'HLB', clase: 'TM', modalidad: 'carroceria' },
  { col: 7, cliente: 'HLB', clase: 'TM', modalidad: 'carroceria_2' },
  { col: 8, cliente: 'HLB', clase: 'TM', modalidad: 'cabezote' },
  { col: 9, cliente: 'HLB', clase: 'TM', modalidad: 'cabezote_2' },
  { col: 10, cliente: 'HLB', clase: 'MM', modalidad: 'cama_alta' },
  { col: 11, cliente: 'HLB', clase: 'MM', modalidad: 'carroceria' },
  { col: 12, cliente: 'HLB', clase: 'MM', modalidad: 'cabezote' },
  { col: 13, cliente: 'HLB', clase: 'C600', modalidad: 'rigido' },
  { col: 14, cliente: 'HLB', clase: 'C350', modalidad: 'rigido' },
  { col: 15, cliente: 'HLB', clase: 'C100', modalidad: 'rigido' },
  { col: 17, cliente: 'BAKER', clase: 'TM', modalidad: 'cama_alta' },
  { col: 18, cliente: 'BAKER', clase: 'MM', modalidad: 'cama_alta' },
  { col: 19, cliente: 'BAKER', clase: 'C600', modalidad: 'rigido' },
  { col: 20, cliente: 'BAKER', clase: 'C350', modalidad: 'rigido' },
  { col: 21, cliente: 'BAKER', clase: 'C100', modalidad: 'rigido' },
  { col: 23, cliente: 'WTF', clase: 'TM', modalidad: 'tractomula' },
  { col: 24, cliente: 'WTF', clase: 'TM', modalidad: 'cabezote' },
  { col: 25, cliente: 'WTF', clase: 'MM', modalidad: 'minimula' },
  { col: 26, cliente: 'WTF', clase: 'C600', modalidad: 'rigido' },
  { col: 27, cliente: 'WTF', clase: 'C350', modalidad: 'turbo' },
  { col: 28, cliente: 'WTF', clase: 'C100', modalidad: 'miniturbo' },
  { col: 29, cliente: 'WTF', clase: 'C100', modalidad: 'estaca' },
];

const VIGENCIA_TARIFAS = '2026-01-01';

/** Columnas de cliente en las hojas SERV. La 9 agrupa varios y el valor de la celda dice cuál. */
const COLUMNAS_CLIENTE_SERV: ReadonlyArray<readonly [number, string]> = [
  [5, 'HLB'],
  [6, 'TENARIS'],
  [7, 'QMAX'],
  [8, 'WTF'],
  [9, 'GRUPO_BAKER'],
  [10, 'SLB'],
];

const MESES_SERV: Readonly<Record<string, string>> = {
  ENE: '01',
  FEB: '02',
  MAR: '03',
  ABR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AGO: '08',
  AGOS: '08',
  SEP: '09',
  SEPT: '09',
  OCT: '10',
  NOV: '11',
  DIC: '12',
};

// ---- Utilidades ----

const c = (fila: Fila | undefined, i: number): Celda | undefined => fila?.[i];

function filaCabecera(filas: Filas, columna: number, valor: string, desde = 0): number {
  for (let i = desde; i < filas.length; i += 1) {
    if (texto(c(filas[i], columna)).toUpperCase() === valor) return i;
  }
  return -1;
}

function filaQueContiene(filas: Filas, fragmento: string): number {
  for (let i = 0; i < filas.length; i += 1) {
    if (filas[i]!.some((v) => texto(v).toUpperCase().includes(fragmento))) return i;
  }
  return -1;
}

function nombreNormalizado(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function documentoNormalizado(cel: Celda | undefined): string {
  return texto(cel).replace(/[^0-9-]/g, '');
}

function nulo(s: string): string | null {
  return s ? s : null;
}

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Datos de cruce que no van a la base: se guardan aparte para no ensuciar `PlanVehiculo`. */
interface CruceVehiculo {
  /** Candidatos a asociado por fuente; gana la menor prioridad (ver DECISIONES) y el resto se lista. */
  candidatos: { documento: string; prioridad: number; fuente: string; fila: number | null }[];
  nombreCorto: string | null;
}

/** Prioridad de cada fuente al decidir el asociado (poseedor gremial) de una placa. */
const PRIORIDAD = {
  listaAsociadosColumnaAsociado: 1,
  listaAsociadosPropietarioSinParentesco: 2,
  listaTmPropietario: 3,
  datosServiciosPoseedor: 4,
  servDocumento: 5,
} as const;

// ---- Construcción del plan ----

class Constructor {
  readonly excepciones: Excepcion[] = [];
  readonly asociados = new Map<string, PlanAsociado>();
  readonly nombresAsociado = new Map<string, string>(); // nombre normalizado → documento
  /** Documento errado → documento canónico (misma persona con dos documentos entre hojas). */
  readonly aliasDocumento = new Map<string, string>();
  readonly vehiculos = new Map<string, PlanVehiculo>();
  readonly cruce = new Map<string, CruceVehiculo>();
  readonly fuenteClase = new Map<string, string>();
  readonly conductores = new Map<string, PlanConductor>();
  readonly vehiculoConductores: PlanVehiculoConductor[] = [];
  readonly documentos: PlanDocumento[] = [];
  readonly habilitaciones: PlanHabilitacion[] = [];
  readonly destinos = new Map<string, PlanDestino>();
  readonly tarifas: PlanTarifa[] = [];
  readonly transportadoras = new Set<string>();
  readonly viajes: PlanViaje[] = [];
  readonly resumenControl: ResumenControl[] = [];
  readonly ordenTurnero = new Map<ClaseCola, string[]>();
  fechaFoto: string;

  constructor(
    private readonly libro: Libro,
    private readonly opciones: OpcionesPlan,
  ) {
    this.fechaFoto = opciones.fechaFoto ?? '2026-09-16';
  }

  excepcion(tipo: TipoExcepcion, hoja: string, fila: number | null, detalle: string): void {
    this.excepciones.push({ tipo, hoja, fila, detalle });
  }

  hoja(nombre: string): Filas {
    const filas = this.libro.get(nombre);
    if (!filas) {
      this.excepcion('hoja_ausente', nombre, null, 'La hoja no existe en el libro');
      return [];
    }
    return filas;
  }

  /** Placa normalizada con alias aplicado; null (y excepción) si no es válida. */
  placa(cel: Celda | undefined, hoja: string, fila: number): string | null {
    const crudo = texto(cel);
    if (!crudo) return null;
    const normalizada = normalizarPlaca(crudo);
    if (!normalizada) {
      this.excepcion('placa_invalida', hoja, fila, `"${crudo}" no cumple [A-Z]{3}[0-9]{3}`);
      return null;
    }
    const alias = ALIAS_PLACAS[normalizada];
    if (alias) {
      this.excepcion('placa_alias', hoja, fila, `${normalizada} → ${alias}`);
      return alias;
    }
    return normalizada;
  }

  documentoCanonico(documento: string): string {
    return this.aliasDocumento.get(documento) ?? documento;
  }

  asociado(documento: string, nombres: string, extra: Partial<PlanAsociado> = {}): PlanAsociado {
    const esNit = documento.includes('-') || /\b(SAS|LTDA|S\.A\.?)\b/.test(nombres.toUpperCase());
    const existente = this.asociados.get(this.documentoCanonico(documento));
    if (existente) {
      if (!existente.nombres && nombres) existente.nombres = nombres;
      existente.celular ??= extra.celular ?? null;
      existente.correo ??= extra.correo ?? null;
      existente.direccion ??= extra.direccion ?? null;
      existente.cuentaBancaria ??= extra.cuentaBancaria ?? null;
      existente.fechaAfiliacion ??= extra.fechaAfiliacion ?? null;
      return existente;
    }
    const nuevo: PlanAsociado = {
      documento,
      documentoTipo: esNit ? 'NIT' : 'CC',
      tipo: esNit ? 'empresa' : 'persona',
      nombres,
      celular: extra.celular ?? null,
      correo: extra.correo ?? null,
      direccion: extra.direccion ?? null,
      cuentaBancaria: extra.cuentaBancaria ?? null,
      fechaAfiliacion: extra.fechaAfiliacion ?? null,
    };
    const nn = nombreNormalizado(nombres);
    const otro = nn ? this.nombresAsociado.get(nn) : undefined;
    if (otro && otro !== documento) {
      // Misma persona con un dígito distinto entre hojas: se unifica bajo el documento visto primero.
      this.excepcion(
        'asociado_documento_discrepante',
        'LISTA TM / LISTA ASOCIADOS',
        null,
        `"${nombres}" aparece con documentos ${otro} y ${documento}; se unifica bajo ${otro}`,
      );
      this.aliasDocumento.set(documento, otro);
      return this.asociado(otro, nombres, extra);
    }
    this.asociados.set(documento, nuevo);
    if (nn) this.nombresAsociado.set(nn, documento);
    return nuevo;
  }

  vehiculo(placa: string, clase: ClaseVehiculo | null, fuente: string, fila: number): PlanVehiculo {
    let v = this.vehiculos.get(placa);
    if (!v) {
      v = {
        placa,
        clase: clase ?? 'TM',
        claseCola: claseColaDe(clase ?? 'TM'),
        tipoCarroceria: null,
        modelo: null,
        repotenciacion: null,
        largoMts: null,
        kmRecorrido: null,
        asociadoDocumento: null,
        propietarioNombre: null,
        propietarioDocumento: null,
        parentesco: null,
        trailerPlaca: null,
        gpsProveedor: null,
        estado: 'activo',
        noElegibleHasta: null,
      };
      this.vehiculos.set(placa, v);
      this.cruce.set(placa, { candidatos: [], nombreCorto: null });
      if (clase) this.fuenteClase.set(placa, fuente);
    } else if (clase && !this.fuenteClase.has(placa)) {
      // La primera hoja que trae clase la fija (LISTA TM casi nunca la trae).
      v.clase = clase;
      v.claseCola = claseColaDe(clase);
      this.fuenteClase.set(placa, fuente);
    } else if (clase && clase !== v.clase) {
      this.excepcion(
        'clase_conflicto',
        fuente,
        fila,
        `${placa}: ${fuente} dice ${clase}, se conserva ${v.clase} (${this.fuenteClase.get(placa) ?? 'sin fuente'})`,
      );
    }
    return v;
  }

  proponerAsociado(
    v: PlanVehiculo,
    documento: string,
    prioridad: number,
    fuente: string,
    fila: number | null,
  ): void {
    this.cruce.get(v.placa)!.candidatos.push({
      documento: this.documentoCanonico(documento),
      prioridad,
      fuente,
      fila,
    });
  }

  conductor(
    documento: string,
    nombres: string,
    celular: string | null,
    correo: string | null,
    asociadoDocumento: string | null,
    placa: string | null,
  ): void {
    const existente = this.conductores.get(documento);
    if (!existente) {
      this.conductores.set(documento, { documento, nombres, celular, correo, asociadoDocumento });
    } else {
      existente.celular ??= celular;
      existente.correo ??= correo;
      existente.asociadoDocumento ??= asociadoDocumento;
    }
    if (
      placa &&
      !this.vehiculoConductores.some((x) => x.placa === placa && x.conductorDocumento === documento)
    ) {
      const esPrincipal = !this.vehiculoConductores.some((x) => x.placa === placa);
      this.vehiculoConductores.push({ placa, conductorDocumento: documento, esPrincipal });
    }
  }

  /** `ELKIN M`, `L. OSUNA`, `CARLOS J V` → documento del asociado si el nombre corto es inequívoco. */
  asociadoPorNombreCorto(corto: string): string | null {
    const tokens = nombreNormalizado(corto).split(' ').filter(Boolean);
    if (tokens.length === 0) return null;
    const candidatos: string[] = [];
    for (const [nombre, documento] of this.nombresAsociado) {
      const partes = nombre.split(' ');
      const cumple = tokens.every((t) =>
        t.length === 1 ? partes.some((p) => p.startsWith(t)) : partes.includes(t),
      );
      if (cumple) candidatos.push(documento);
    }
    return candidatos.length === 1 ? candidatos[0]! : null;
  }

  // ---- Hojas ----

  leerListaTm(): void {
    const hoja = 'LISTA TM';
    const filas = this.hoja(hoja);
    const h1 = filaCabecera(filas, 0, 'ITEM');
    const h2 = h1 >= 0 ? filaCabecera(filas, 0, 'ITEM', h1 + 1) : -1;
    if (h1 < 0) return;

    // Bloque 2 primero: es el registro de afiliación (documento, contacto, cuenta, fecha de aporte).
    if (h2 >= 0) {
      for (let i = h2 + 1; i < filas.length; i += 1) {
        const f = filas[i]!;
        if (typeof c(f, 0) !== 'number' || !texto(c(f, 1))) continue;
        const documento = documentoNormalizado(c(f, 2));
        if (!documento) {
          this.excepcion(
            'fila_ignorada',
            hoja,
            i + 1,
            `Afiliado "${texto(c(f, 1))}" sin documento`,
          );
          continue;
        }
        this.asociado(documento, texto(c(f, 1)), {
          celular: nulo(texto(c(f, 4))),
          direccion: nulo(texto(c(f, 5))),
          correo: esCorreo(c(f, 6)) ? texto(c(f, 6)).toLowerCase() : null,
          cuentaBancaria: nulo(texto(c(f, 7))),
          fechaAfiliacion: fechaExcel(c(f, 9)),
        });
      }
    }

    // Bloque 1: propietario y, debajo, sus vehículos y conductores.
    const fin = h2 >= 0 ? h2 : filas.length;
    let propietario: string | null = null;
    for (let i = h1 + 1; i < fin; i += 1) {
      const f = filas[i]!;
      const nombre = texto(c(f, 1));
      if (nombre) {
        const documento = documentoNormalizado(c(f, 2));
        if (documento) {
          this.asociado(documento, nombre, {
            celular: nulo(texto(c(f, 4))),
            direccion: nulo(texto(c(f, 5))),
            correo: esCorreo(c(f, 6)) ? texto(c(f, 6)).toLowerCase() : null,
            cuentaBancaria: nulo(texto(c(f, 7))),
          });
          propietario = this.documentoCanonico(documento);
        } else {
          this.excepcion('fila_ignorada', hoja, i + 1, `Propietario "${nombre}" sin documento`);
          propietario = null;
        }
      }
      const placa = this.placa(c(f, 10), hoja, i + 1);
      if (placa) {
        const v = this.vehiculo(placa, claseDe(c(f, 9)), hoja, i + 1);
        v.modelo ??= numero(c(f, 11));
        v.repotenciacion ??= numero(c(f, 12));
        v.kmRecorrido ??= numero(c(f, 13));
        v.trailerPlaca ??= nulo(texto(c(f, 18)).toUpperCase());
        v.gpsProveedor ??= nulo(texto(c(f, 23)));
        if (propietario) {
          this.proponerAsociado(v, propietario, PRIORIDAD.listaTmPropietario, hoja, i + 1);
        }
        for (const [col, tipo] of DOCUMENTOS_LISTA_TM) {
          const crudo = texto(c(f, col));
          if (!crudo) continue;
          const vence = fechaExcel(c(f, col));
          if (vence) this.documentos.push({ placa, tipo, venceEn: vence });
          else if (crudo.toUpperCase() !== 'NA') {
            this.excepcion('documento_sin_fecha', hoja, i + 1, `${placa} ${tipo}: "${crudo}"`);
          }
        }
      }
      const conductorNombre = texto(c(f, 26));
      if (conductorNombre || texto(c(f, 27))) {
        const documento = documentoNormalizado(c(f, 27));
        if (!documento) {
          this.excepcion('conductor_sin_documento', hoja, i + 1, `"${conductorNombre}"`);
        } else {
          this.conductor(
            documento,
            conductorNombre || `CONDUCTOR ${documento}`,
            nulo(texto(c(f, 28))),
            esCorreo(c(f, 29)) ? texto(c(f, 29)).toLowerCase() : null,
            propietario,
            placa,
          );
        }
      }
    }
  }

  leerListaAsociados(): void {
    const hoja = 'LISTA ASOCIADOS';
    const filas = this.hoja(hoja);
    const h = filaCabecera(filas, 0, 'ITEM');
    if (h < 0) return;
    for (let i = h + 1; i < filas.length; i += 1) {
      const f = filas[i]!;
      if (typeof c(f, 0) !== 'number') continue;
      const ccAsociado = documentoNormalizado(c(f, 1));
      const nombreAsociado = texto(c(f, 2));
      const propietario = texto(c(f, 5));
      const docPropietario = documentoNormalizado(c(f, 6));
      const parentesco = nulo(texto(c(f, 7)).toLowerCase().replace(/\s+/g, '_'));
      const docAsociado =
        ccAsociado && nombreAsociado
          ? this.asociado(ccAsociado, nombreAsociado).documento
          : this.documentoCanonico(ccAsociado);
      const placa = this.placa(c(f, 4), hoja, i + 1);
      if (!placa) {
        if (!ccAsociado) this.excepcion('fila_ignorada', hoja, i + 1, 'Fila sin placa ni asociado');
        continue;
      }
      const v = this.vehiculo(placa, claseDe(c(f, 3)), hoja, i + 1);
      v.propietarioNombre ??= nulo(propietario);
      v.propietarioDocumento ??= nulo(docPropietario);
      v.parentesco ??= parentesco;
      if (docAsociado) {
        this.proponerAsociado(v, docAsociado, PRIORIDAD.listaAsociadosColumnaAsociado, hoja, i + 1);
      } else if (docPropietario && !parentesco) {
        const doc = this.asociado(docPropietario, propietario).documento;
        this.proponerAsociado(
          v,
          doc,
          PRIORIDAD.listaAsociadosPropietarioSinParentesco,
          hoja,
          i + 1,
        );
      }
    }
  }

  leerTurnero(): void {
    const hoja = 'TURNERO';
    const filas = this.hoja(hoja);
    const iFecha = filaQueContiene(filas, 'FECHA:');
    if (iFecha >= 0) {
      const celda = filas[iFecha]!.map(texto).find((t) => t.toUpperCase().includes('FECHA:'));
      const fecha = fechaExcel(celda?.replace(/.*FECHA:\s*/i, '') ?? null);
      if (fecha) this.fechaFoto = fecha;
    }
    const iSanciones = filaQueContiene(filas, 'CONTROL DE SANCIONES');
    const finTurnos = iSanciones >= 0 ? iSanciones : filas.length;

    // Disponibles primero y "en ruta" después: el orden de lectura ya es el orden de la cola.
    for (let i = 0; i < finTurnos; i += 1) {
      const f = filas[i]!;
      if (typeof c(f, 1) !== 'number' || !texto(c(f, 7))) continue;
      const placa = this.placa(c(f, 7), hoja, i + 1);
      if (!placa) continue;
      const v = this.vehiculo(placa, claseDe(c(f, 2)), hoja, i + 1);
      const carroceria = marca(c(f, 3));
      v.tipoCarroceria ??=
        carroceria === 'SI' || carroceria === 'X'
          ? 'cama_alta'
          : carroceria === 'NO'
            ? 'carroceria'
            : null;
      v.largoMts ??= numero(c(f, 4));
      v.modelo ??= numero(c(f, 5));
      v.repotenciacion ??= numero(c(f, 6));
      const cruce = this.cruce.get(placa)!;
      cruce.nombreCorto ??= nulo(texto(c(f, 8)));
      const lista = this.ordenTurnero.get(v.claseCola) ?? [];
      if (!lista.includes(placa)) lista.push(placa);
      this.ordenTurnero.set(v.claseCola, lista);

      const requisitos: Record<string, string> = {};
      CABECERAS_TURNERO.forEach((cab, k) => {
        const t = texto(c(f, 9 + k));
        if (t) requisitos[cab] = t;
      });
      const obs = texto(c(f, 23));
      if (obs) requisitos.OBSERVACIONES = obs;
      let sinDato = 0;
      for (const [cliente, cols] of HABILITACIONES_TURNERO) {
        const marcas = cols.map((col) => marca(c(f, col)));
        if (marcas.every((m) => m === null)) {
          sinDato += 1;
          continue;
        }
        const presentes = marcas.filter((m): m is Marca => m !== null);
        const apto = presentes.every((m) => m === 'X' || m === 'SI');
        const motivoBloqueo = apto
          ? null
          : presentes.includes('NO')
            ? 'Marcado NO en el TURNERO legado'
            : 'NA en el TURNERO legado (no cumple antigüedad/modelo exigido)';
        this.habilitaciones.push({ placa, cliente, apto, motivoBloqueo, requisitos });
      }
      if (sinDato > 0) {
        this.excepcion(
          'habilitacion_sin_dato',
          hoja,
          i + 1,
          `${placa}: ${sinDato} clientes sin marca`,
        );
      }
    }

    if (iSanciones >= 0) {
      for (let i = iSanciones + 1; i < filas.length; i += 1) {
        const f = filas[i]!;
        if (typeof c(f, 1) !== 'number' || !texto(c(f, 3))) continue;
        const placa = this.placa(c(f, 3), hoja, i + 1);
        if (!placa) continue;
        const fines = [14, 16, 18, 20]
          .map((col) => fechaExcel(c(f, col)))
          .filter((x): x is string => x !== null)
          .sort();
        const fin = fines.at(-1) ?? null;
        const detalle = `${placa}: ${texto(c(f, 5))} (art. ${texto(c(f, 11))}) hasta ${fin ?? 'sin fecha'}`;
        this.excepcion('sancion', hoja, i + 1, detalle);
        if (fin) {
          const v = this.vehiculos.get(placa);
          if (v) v.noElegibleHasta = `${fin}T23:59:59-05:00`;
        }
      }
    }
  }

  leerDatosServicios(): void {
    const hoja = 'DATOS DE SERVICIOS';
    const filas = this.hoja(hoja);
    for (let i = 0; i < filas.length; i += 1) {
      const f = filas[i]!;
      for (let col = 0; col < f.length; col += 1) {
        if (texto(c(f, col)).toUpperCase() !== 'PLACA') continue;
        if (texto(c(filas[i + 2], col)).toUpperCase() !== 'CONDUCTOR') continue;
        const placa = this.placa(c(f, col + 1), hoja, i + 1);
        const trailer = nulo(texto(c(filas[i + 1], col + 1)).toUpperCase());
        const conductor = texto(c(filas[i + 2], col + 1));
        const cedula = documentoNormalizado(c(filas[i + 3], col + 1));
        const celular = nulo(texto(c(filas[i + 4], col + 1)));
        const poseedor = texto(c(filas[i + 5], col + 1));
        const docPoseedor = documentoNormalizado(c(filas[i + 6], col + 1));
        if (!placa && !conductor) continue;
        const docAsociado =
          docPoseedor && poseedor
            ? this.asociado(docPoseedor, poseedor).documento
            : this.documentoCanonico(docPoseedor);
        if (placa) {
          const v = this.vehiculo(placa, null, hoja, i + 1);
          v.trailerPlaca ??= trailer;
          if (docAsociado) {
            this.proponerAsociado(v, docAsociado, PRIORIDAD.datosServiciosPoseedor, hoja, i + 1);
          }
        }
        if (conductor) {
          if (!cedula) this.excepcion('conductor_sin_documento', hoja, i + 3, `"${conductor}"`);
          else this.conductor(cedula, conductor, celular, null, nulo(docAsociado), placa);
        }
      }
    }
  }

  leerTarifas(): void {
    const hoja = 'TARIFAS HLB';
    const filas = this.hoja(hoja);
    for (let i = 0; i < filas.length; i += 1) {
      const f = filas[i]!;
      if (typeof c(f, 0) !== 'number') continue;
      const destino = nombreCanonico(c(f, 2));
      if (!destino) continue;
      if (!this.destinos.has(destino)) {
        this.destinos.set(destino, { nombre: destino, km: numero(c(f, 3)) });
      }
      let alguna = false;
      for (const col of COLUMNAS_TARIFAS) {
        const valor = numero(c(f, col.col));
        if (valor === null || valor <= 0) continue;
        alguna = true;
        this.tarifas.push({
          cliente: col.cliente,
          destino,
          clase: col.clase,
          modalidad: col.modalidad,
          valor: redondear2(valor),
          vigenciaDesde: VIGENCIA_TARIFAS,
        });
      }
      if (!alguna)
        this.excepcion('tarifa_sin_valor', hoja, i + 1, `${destino}: destino sin tarifas`);
    }
  }

  leerControl(nombre: string): void {
    const filas = this.hoja(nombre);
    const h = filaCabecera(filas, 0, 'ITEM');
    if (h < 0) return;
    const vistos = new Map<string, number[]>();
    const resumen: ResumenControl = {
      hoja: nombre,
      asignacionesConTr: 0,
      declinas: 0,
      pendientes: 0,
      canceladas: 0,
    };
    const registrar = (valor: string, fila: number, contexto: string): void => {
      const v = valor.toUpperCase();
      if (v === 'DECLINA') {
        resumen.declinas += 1;
        return;
      }
      if (v === 'DECLINO') {
        resumen.declinas += 1;
        this.excepcion(
          'declino_vs_declina',
          nombre,
          fila,
          `${contexto}: "DECLINO" (texto libre como estado, RULE-009)`,
        );
        return;
      }
      if (/^TR-?$/.test(v)) {
        this.excepcion('tr_vacio', nombre, fila, `${contexto}: código "TR-" sin número`);
        return;
      }
      const sufijo = /^(TR-\d+)-(\d+)$/.exec(v);
      if (sufijo) {
        this.excepcion('tr_sufijo', nombre, fila, `${contexto}: ${v} (sufijo -${sufijo[2]})`);
        return;
      }
      if (/^TR-\d+$/.test(v)) {
        resumen.asignacionesConTr += 1;
        const lista = vistos.get(v) ?? [];
        lista.push(fila);
        vistos.set(v, lista);
        return;
      }
      this.excepcion('fila_ignorada', nombre, fila, `${contexto}: "${valor}" no es TR ni DECLINA`);
    };
    const pares: ReadonlyArray<readonly [number, number, ClaseCola]> = [
      [2, 3, 'C100'],
      [4, 5, 'C350'],
      [6, 7, 'C600'],
      [8, 9, 'MM'],
      [10, 11, 'TM-CBZ'],
    ];
    for (let i = h + 1; i < filas.length; i += 1) {
      const f = filas[i]!;
      if (typeof c(f, 0) !== 'number') continue;
      for (const [colPos, colTr, clase] of pares) {
        const valor = texto(c(f, colTr));
        if (!valor) continue; // rotación prearmada sin TR: se ignora (§13.1.5)
        registrar(valor, i + 1, `${clase} pos ${texto(c(f, colPos))}`);
      }
      for (const offset of [13, 16, 19]) {
        if (!texto(c(f, offset + 1))) continue;
        if (offset === 13) resumen.pendientes += 1;
        else resumen.canceladas += 1;
      }
    }
    for (const [codigo, filasTr] of vistos) {
      if (filasTr.length > 1) {
        this.excepcion(
          'tr_duplicado',
          nombre,
          filasTr[0] ?? null,
          `${codigo} en filas ${filasTr.join(', ')}`,
        );
      }
    }
    this.resumenControl.push(resumen);
  }

  leerServ(nombre: string): void {
    const filas = this.hoja(nombre);
    const h = filaCabecera(filas, 0, 'ITEM');
    if (h < 0) return;
    const m = /SERV\s+([A-Z]+)(\d{2})/.exec(nombre);
    const mes = m ? (MESES_SERV[m[1]!] ?? null) : null;
    const anio = m ? 2000 + Number(m[2]) : null;
    if (!mes || !anio) {
      this.excepcion(
        'fila_ignorada',
        nombre,
        null,
        'No se reconoce el mes en el nombre de la hoja',
      );
      return;
    }
    for (let i = h + 1; i < filas.length; i += 1) {
      const f = filas[i]!;
      const item = c(f, 0);
      if (typeof item !== 'number') continue;
      if (!texto(c(f, 2)) && !texto(c(f, 3))) continue;
      const placa = this.placa(c(f, 2), nombre, i + 1);
      if (!placa) {
        this.excepcion(
          'placa_invalida',
          nombre,
          i + 1,
          `Viaje de "${texto(c(f, 3))}" sin placa válida: no se importa`,
        );
        continue;
      }
      const v = this.vehiculo(placa, claseDe(c(f, 1)), nombre, i + 1);
      const cruce = this.cruce.get(placa)!;
      cruce.nombreCorto ??= nulo(texto(c(f, 3)));
      const docProp = this.documentoCanonico(documentoNormalizado(c(f, 4)));
      if (docProp && this.asociados.has(docProp)) {
        this.proponerAsociado(v, docProp, PRIORIDAD.servDocumento, nombre, i + 1);
      }

      let cliente = 'SIN_CLIENTE';
      let modalidad: string | null = null;
      for (const [col, codigo] of COLUMNAS_CLIENTE_SERV) {
        const valor = texto(c(f, col)).toUpperCase();
        if (!valor) continue;
        if (codigo === 'GRUPO_BAKER') {
          cliente = ['NABORS', 'BAKER', 'WIS'].includes(valor) ? valor : 'GRUPO_BAKER';
        } else cliente = codigo;
        modalidad =
          valor === 'CA'
            ? 'cama_alta'
            : valor === 'CBZ'
              ? 'cabezote'
              : valor === 'CARR'
                ? 'carroceria'
                : null;
        break;
      }

      const fechaCargue = fechaExcel(c(f, 11));
      let fechaDescargue = fechaExcel(c(f, 12));
      if (!fechaCargue)
        this.excepcion('fecha_invalida', nombre, i + 1, `${placa}: sin fecha de cargue`);
      if (fechaCargue && fechaDescargue && fechaDescargue < fechaCargue) {
        this.excepcion(
          'fecha_invalida',
          nombre,
          i + 1,
          `${placa}: descargue ${fechaDescargue} anterior a cargue ${fechaCargue}`,
        );
        fechaDescargue = null;
      }
      const lugar = nulo(nombreCanonico(c(f, 13)));
      const destino = lugar && this.destinos.has(lugar) ? lugar : null;
      if (lugar && !destino) this.excepcion('destino_no_canonico', nombre, i + 1, lugar);
      const transportadora = nulo(texto(c(f, 14)).toUpperCase());
      if (transportadora) this.transportadoras.add(transportadora);

      const fleteCrudo = numero(c(f, 15));
      const flete = fleteCrudo && fleteCrudo > 0 ? redondear2(fleteCrudo) : null;
      const pct = this.opciones.porcentajeRecaudo;
      const valorRecaudo = flete === null ? null : Math.round(flete * pct);
      const legado = numero(c(f, 16));
      if (
        valorRecaudo !== null &&
        legado !== null &&
        Math.abs(Math.round(legado) - valorRecaudo) > 1
      ) {
        this.excepcion(
          'recaudo_distinto',
          nombre,
          i + 1,
          `${placa}: legado ${legado} vs recalculado ${valorRecaudo} (${pct * 100} %)`,
        );
      }
      const valorPagado = numero(c(f, 17)) ?? 0;
      const referencias = [texto(c(f, 20)), texto(c(f, 22))].filter(Boolean);
      const estadoRecaudo =
        valorRecaudo === null
          ? null
          : valorPagado >= valorRecaudo - 1
            ? 'pagado'
            : valorPagado > 0
              ? 'parcial'
              : 'pendiente';

      this.viajes.push({
        codigoTr: `TR-1${anio}${mes}${String(item).padStart(3, '0')}`,
        hoja: nombre,
        fila: i + 1,
        placa,
        claseCola: v.claseCola,
        cliente,
        modalidad,
        fechaServicio: fechaCargue ?? `${anio}-${mes}-01`,
        fechaCargue,
        fechaDescargue,
        lugarDescargue: lugar,
        destino,
        transportadora,
        flete,
        porcentajeAplicado: pct,
        valorRecaudo,
        valorPagado: redondear2(valorPagado),
        fechaPago: fechaExcel(c(f, 19)),
        referenciaPago: nulo(referencias.join(' / ')),
        estadoViaje: flete === null ? 'cargado' : 'liquidado',
        estadoRecaudo,
        asociadoDocumento: null, // se resuelve al cerrar el plan
      });
    }
  }

  // ---- Cierre ----

  resolverAsociados(): void {
    for (const v of this.vehiculos.values()) {
      const cruce = this.cruce.get(v.placa)!;
      if (!this.fuenteClase.has(v.placa)) {
        this.excepcion(
          'clase_conflicto',
          'LISTA TM / LISTA ASOCIADOS / TURNERO / SERV',
          null,
          `${v.placa}: sin clase en ninguna hoja; se asume TM`,
        );
      }
      const candidatos = [...cruce.candidatos].sort((a, b) => a.prioridad - b.prioridad);
      const elegido = candidatos[0];
      if (elegido) {
        v.asociadoDocumento = elegido.documento;
        for (const otro of candidatos.slice(1)) {
          if (otro.documento === elegido.documento) continue;
          this.excepcion(
            'asociado_conflicto',
            otro.fuente,
            otro.fila,
            `${v.placa}: ${otro.fuente} la atribuye a ${otro.documento}; se conserva ${elegido.documento} (${elegido.fuente})`,
          );
        }
      }
      if (!v.asociadoDocumento && cruce.nombreCorto) {
        const doc = this.asociadoPorNombreCorto(cruce.nombreCorto);
        if (doc) {
          v.asociadoDocumento = doc;
          this.excepcion(
            'asociado_por_nombre',
            'TURNERO / SERV',
            null,
            `${v.placa}: "${cruce.nombreCorto}" → ${this.asociados.get(doc)?.nombres ?? doc}`,
          );
        }
      }
      if (!v.asociadoDocumento) {
        v.estado = 'inactivo';
        const quien = cruce.nombreCorto ? ` ("${cruce.nombreCorto}")` : '';
        this.excepcion(
          'placa_no_asociada',
          'TURNERO / SERV',
          null,
          `${v.placa}${quien}: sin asociado; se crea inactiva y fuera de la cola`,
        );
      }
    }
    for (const viaje of this.viajes) {
      viaje.asociadoDocumento = this.vehiculos.get(viaje.placa)?.asociadoDocumento ?? null;
      if (!viaje.asociadoDocumento && viaje.valorRecaudo !== null) {
        this.excepcion(
          'placa_sin_asociado',
          viaje.hoja,
          viaje.fila,
          `${viaje.placa}: viaje ${viaje.codigoTr} sin asociado; no se crea recaudo`,
        );
      }
    }
  }

  posiciones(): PlanPosicion[] {
    const tomados = new Map<string, number>();
    for (const viaje of this.viajes) tomados.set(viaje.placa, (tomados.get(viaje.placa) ?? 0) + 1);
    const activos = [...this.vehiculos.values()].filter((v) => v.estado === 'activo');
    const resultado: PlanPosicion[] = [];
    const clases = new Set<ClaseCola>(activos.map((v) => v.claseCola));
    for (const claseCola of clases) {
      const orden: string[] = [];
      for (const placa of this.ordenTurnero.get(claseCola) ?? []) {
        const v = this.vehiculos.get(placa);
        if (v && v.estado === 'activo' && v.claseCola === claseCola && !orden.includes(placa)) {
          orden.push(placa);
        }
      }
      const restantes = activos
        .filter((x) => x.claseCola === claseCola)
        .sort((a, b) => a.placa.localeCompare(b.placa));
      for (const v of restantes) if (!orden.includes(v.placa)) orden.push(v.placa);
      orden.forEach((placa, k) => {
        resultado.push({
          claseCola,
          placa,
          posicion: k + 1,
          turnosTomados: tomados.get(placa) ?? 0,
        });
      });
    }
    return resultado;
  }

  usuariosMember(): PlanUsuarioMember[] {
    const porCorreo = new Map<string, PlanUsuarioMember>();
    for (const a of this.asociados.values()) {
      if (!a.correo) continue;
      const placas = [...this.vehiculos.values()]
        .filter((v) => v.asociadoDocumento === a.documento)
        .map((v) => v.placa)
        .sort();
      const existente = porCorreo.get(a.correo);
      if (existente) {
        this.excepcion(
          'correo_duplicado',
          'LISTA TM',
          null,
          `${a.correo}: ${existente.nombre} y ${a.nombres}; solo el primero tendrá usuario`,
        );
        continue;
      }
      porCorreo.set(a.correo, {
        email: a.correo,
        nombre: a.nombres,
        asociadoDocumento: a.documento,
        placas,
      });
    }
    return [...porCorreo.values()];
  }

  construir(): Plan {
    this.leerListaTm();
    this.leerListaAsociados();
    this.leerTurnero();
    this.leerDatosServicios();
    this.leerTarifas();
    const hojas = [...this.libro.keys()].sort();
    for (const nombre of hojas.filter((n) => n.startsWith('CONTROL TURNOS')))
      this.leerControl(nombre);
    for (const nombre of hojas.filter((n) => n.startsWith('SERV '))) this.leerServ(nombre);
    this.resolverAsociados();
    return {
      fechaFoto: this.fechaFoto,
      porcentajeRecaudo: this.opciones.porcentajeRecaudo,
      decisiones: DECISIONES,
      clientes: CLIENTES,
      tiposDocumento: TIPOS_DOCUMENTO,
      transportadoras: [...this.transportadoras].sort(),
      destinos: [...this.destinos.values()],
      tarifas: this.tarifas,
      asociados: [...this.asociados.values()],
      vehiculos: [...this.vehiculos.values()],
      conductores: [...this.conductores.values()],
      vehiculoConductores: this.vehiculoConductores,
      documentos: this.documentos,
      habilitaciones: this.habilitaciones,
      posiciones: this.posiciones(),
      viajes: this.viajes,
      usuariosMember: this.usuariosMember(),
      resumenControl: this.resumenControl,
      excepciones: this.excepciones,
    };
  }
}

export function construirPlan(libro: Libro, opciones: OpcionesPlan): Plan {
  return new Constructor(libro, opciones).construir();
}
