import { createHash } from 'node:crypto';
import { PARAMETROS_DEFAULT, claseColaDe, type ClaseVehiculo, type Rol } from '@asotracmet/shared';
import { estadoVacio, type EstadoMemoria } from '@asotracmet/domain';
import { cifrar } from './auth/cifrado.js';
import { hashPassword } from './auth/passwords.js';
import { base32Codificar } from './auth/totp.js';
import type { SemillaMaestros } from './maestros/tipos.js';
import type { Usuario } from './usuarios.js';

// Seed determinista (spec §22.4): placas del legado de septiembre 2026 con asociados anonimizados.
// Sirve para dev, tests de API y e2e. Nunca contiene claves de GPS ni datos reales de personas.

export const PASSWORD_DEV = 'Asotracmet2026!';

/** Identificador legible del actor de los jobs. Cada almacén lo traduce con `idSemilla`. */
export const ID_USUARIO_SISTEMA = 'usr-sistema';

/**
 * Secreto TOTP determinista de un usuario de la semilla, para que los tests puedan calcular el
 * código sin leer la base. Solo existe en datos de desarrollo.
 */
export function secretoTotpSemilla(email: string): string {
  return base32Codificar(
    createHash('sha256').update(`totp-semilla:${email.toLowerCase()}`).digest().subarray(0, 20),
  );
}

interface FilaFlota {
  placa: string;
  clase: ClaseVehiculo;
  asociado: string;
  hlb: boolean;
  baker?: boolean;
}

const FLOTA: FilaFlota[] = [
  // TM-CBZ (la cola de la pantalla ops de la fase 1)
  { placa: 'SPS413', clase: 'TM', asociado: 'a-01', hlb: false, baker: true },
  { placa: 'FST189', clase: 'TM', asociado: 'a-02', hlb: true, baker: true },
  { placa: 'TKM221', clase: 'TM', asociado: 'a-02', hlb: true },
  { placa: 'SWI750', clase: 'CBZ', asociado: 'a-06', hlb: true, baker: true },
  { placa: 'QOR007', clase: 'TM', asociado: 'a-03', hlb: true },
  { placa: 'SOF336', clase: 'TM', asociado: 'a-04', hlb: true, baker: true },
  { placa: 'SUL470', clase: 'CBZ', asociado: 'a-05', hlb: true },
  { placa: 'WGT908', clase: 'TM', asociado: 'a-07', hlb: true },
  { placa: 'SNB552', clase: 'CBZ', asociado: 'a-08', hlb: true, baker: true },
  { placa: 'UFR114', clase: 'TM', asociado: 'a-09', hlb: true },
  // C100
  { placa: 'GXT301', clase: 'C100', asociado: 'a-10', hlb: true, baker: true },
  { placa: 'LMR742', clase: 'C100', asociado: 'a-03', hlb: true },
  { placa: 'KJP160', clase: 'C100', asociado: 'a-07', hlb: false },
  // C350
  { placa: 'NBV523', clase: 'C350', asociado: 'a-05', hlb: true },
  { placa: 'RTY871', clase: 'C350', asociado: 'a-08', hlb: true },
  // C600
  { placa: 'HJK640', clase: 'C600', asociado: 'a-01', hlb: true },
  // MM
  { placa: 'MMX210', clase: 'MM', asociado: 'a-09', hlb: true },
];

export function crearSeed(
  ahora: Date,
  claveCifrado: Buffer,
): { estado: EstadoMemoria; usuarios: Usuario[]; maestros: SemillaMaestros } {
  const estado = estadoVacio({ ...PARAMETROS_DEFAULT });
  const creadoEn = ahora.toISOString();

  estado.clientes.push(
    { id: 'cli-hlb', codigo: 'HLB', nombre: 'Halliburton', requiereHabilitacion: true },
    { id: 'cli-baker', codigo: 'BAKER', nombre: 'Baker Hughes', requiereHabilitacion: true },
    { id: 'cli-wtf', codigo: 'WTF', nombre: 'Weatherford', requiereHabilitacion: true },
    { id: 'cli-qmax', codigo: 'QMAX', nombre: 'Qmax', requiereHabilitacion: true },
    { id: 'cli-tenaris', codigo: 'TENARIS', nombre: 'Tenaris', requiereHabilitacion: true },
    { id: 'cli-slb', codigo: 'SLB', nombre: 'SLB', requiereHabilitacion: true },
  );

  estado.destinos.push(
    { id: 'des-castilla', nombre: 'CASTILLA LA NUEVA', km: 55, activo: true },
    { id: 'des-rubiales', nombre: 'RUBIALES - CAJUA', km: 250, activo: true },
    { id: 'des-acacias', nombre: 'ACACIAS', km: 28, activo: true },
    { id: 'des-pto-gaitan', nombre: 'PUERTO GAITAN', km: 190, activo: true },
  );

  estado.motivosDeclinacion.push(
    {
      id: 'mot-mantenimiento',
      codigo: 'MANTENIMIENTO',
      nombre: 'Vehículo en mantenimiento',
      activo: true,
    },
    {
      id: 'mot-sin-conductor',
      codigo: 'SIN_CONDUCTOR',
      nombre: 'Sin conductor disponible',
      activo: true,
    },
    { id: 'mot-documento', codigo: 'DOCUMENTO', nombre: 'Documento en trámite', activo: true },
    { id: 'mot-personal', codigo: 'PERSONAL', nombre: 'Motivo personal', activo: true },
    { id: 'mot-otro', codigo: 'OTRO', nombre: 'Otro (detallar en nota)', activo: true },
  );

  for (let i = 1; i <= 10; i += 1) {
    const n = String(i).padStart(2, '0');
    estado.asociados.push({
      id: `a-${n}`,
      tipo: 'persona',
      documento: `10${n}000${n}${n}`,
      nombres: `ASOCIADO ${n}`,
      apellidos: 'ANONIMIZADO',
      razonSocial: null,
      celular: `31000000${n}`,
      correo: `asociado${n}@ejemplo.test`,
    });
  }

  const contadorPorCola = new Map<string, number>();
  for (const fila of FLOTA) {
    const id = `veh-${fila.placa}`;
    const claseCola = claseColaDe(fila.clase);
    estado.vehiculos.push({
      id,
      placa: fila.placa,
      clase: fila.clase,
      claseCola,
      asociadoId: fila.asociado,
      estado: 'activo',
      noElegibleHasta: null,
    });
    estado.habilitaciones.push({
      vehiculoId: id,
      clienteId: 'cli-hlb',
      apto: fila.hlb,
      motivoBloqueo: fila.hlb ? null : 'Curso HLB vencido',
    });
    estado.habilitaciones.push({
      vehiculoId: id,
      clienteId: 'cli-baker',
      apto: fila.baker === true,
      motivoBloqueo: fila.baker ? null : 'No habilitada',
    });
    const posicion = (contadorPorCola.get(claseCola) ?? 0) + 1;
    contadorPorCola.set(claseCola, posicion);
    estado.posiciones.push({
      id: `pos-${fila.placa}`,
      claseCola,
      vehiculoId: id,
      posicion,
      ciclo: 1,
      turnosOfrecidos: 0,
      turnosTomados: 0,
      saltosPendientes: 0,
      version: 1,
    });
  }

  // HSEQ: una placa con SOAT vencido (bloqueante) y otra por vencer.
  estado.documentos.push(
    {
      id: 'doc-ufr114-soat',
      sujetoTipo: 'vehiculo',
      sujetoId: 'veh-UFR114',
      tipoCodigo: 'SOAT',
      venceEn: '2026-09-01',
      bloqueante: true,
    },
    {
      id: 'doc-qor007-tecno',
      sujetoTipo: 'vehiculo',
      sujetoId: 'veh-QOR007',
      tipoCodigo: 'TECNOMEC',
      venceEn: '2026-09-28',
      bloqueante: true,
    },
  );

  estado.requerimientos.push(
    {
      id: 'req-hlb-castilla',
      clienteId: 'cli-hlb',
      destinoId: 'des-castilla',
      claseCola: 'TM-CBZ',
      fechaServicio: '2026-09-17',
      cantidadCupos: 2,
      observaciones: 'Cama alta, cargue 06:00',
      estado: 'abierto',
      creadoPor: 'usr-ops',
      creadoEn,
    },
    {
      id: 'req-baker-rubiales',
      clienteId: 'cli-baker',
      destinoId: 'des-rubiales',
      claseCola: 'C100',
      fechaServicio: '2026-09-18',
      cantidadCupos: 1,
      observaciones: null,
      estado: 'abierto',
      creadoPor: 'usr-ops',
      creadoEn,
    },
  );

  const passwordHash = hashPassword(PASSWORD_DEV);

  /** Rol interno: contraseña + TOTP (spec §3.3). `enrolado=false` deja el segundo factor por configurar. */
  const interno = (
    id: string,
    email: string,
    nombre: string,
    rol: Rol,
    enrolado = true,
  ): Usuario => ({
    id,
    email,
    nombre,
    rol,
    passwordHash,
    totpSecretEnc: enrolado ? cifrar(secretoTotpSemilla(email), claveCifrado) : null,
    totpUltimoPaso: null,
    activo: true,
    asociadoId: null,
    vehiculoIds: [],
  });

  /** Asociado: sin contraseña, entra con enlace mágico. */
  const asociado = (
    id: string,
    email: string,
    nombre: string,
    asociadoId: string,
    vehiculoIds: string[],
  ): Usuario => ({
    id,
    email,
    nombre,
    rol: 'member',
    passwordHash: null,
    totpSecretEnc: null,
    totpUltimoPaso: null,
    activo: true,
    asociadoId,
    vehiculoIds,
  });

  const usuarios: Usuario[] = [
    interno('usr-super', 'superadmin@asotracmet.test', 'Superadmin', 'superadmin'),
    interno('usr-ops', 'ops@asotracmet.test', 'Coordinación de turnos', 'admin_ops'),
    // Sin segundo factor todavía: muestra el flujo de configuración en el primer acceso.
    interno('usr-hseq', 'hseq@asotracmet.test', 'Flota y HSEQ', 'admin_hseq', false),
    interno('usr-finance', 'finance@asotracmet.test', 'Tesorería', 'admin_finance'),
    interno('usr-viewer', 'viewer@asotracmet.test', 'Veeduría', 'viewer'),
    asociado('usr-member-fst189', 'member.fst189@asotracmet.test', 'Asociado 02', 'a-02', [
      'veh-FST189',
      'veh-TKM221',
    ]),
    asociado('usr-member-swi750', 'member.swi750@asotracmet.test', 'Asociado 06', 'a-06', [
      'veh-SWI750',
    ]),
    // Actor de los jobs (§14). Sin contraseña y sin login: existe para que las acciones
    // automáticas tengan un autor real en `audit_log` y en las claves foráneas.
    {
      id: ID_USUARIO_SISTEMA,
      email: 'sistema@asotracmet.test',
      nombre: 'Sistema',
      rol: 'superadmin',
      passwordHash: null,
      totpSecretEnc: null,
      totpUltimoPaso: null,
      activo: false,
      asociadoId: null,
      vehiculoIds: [],
    },
  ];

  // Maestros que el dominio no necesita pero la operación sí (spec §6.3-6.4, §23).
  const tiposDocumento: SemillaMaestros['tiposDocumento'] = [
    {
      id: 'tipo-SOAT',
      codigo: 'SOAT',
      nombre: 'SOAT',
      aplicaA: 'vehiculo',
      bloqueante: true,
      diasAlerta: 30,
    },
    {
      id: 'tipo-TECNOMEC',
      codigo: 'TECNOMEC',
      nombre: 'Revisión técnico-mecánica',
      aplicaA: 'vehiculo',
      bloqueante: true,
      diasAlerta: 30,
    },
    {
      id: 'tipo-POLIZA',
      codigo: 'POLIZA',
      nombre: 'Póliza de responsabilidad civil',
      aplicaA: 'vehiculo',
      bloqueante: true,
      diasAlerta: 30,
    },
    {
      id: 'tipo-CURSO_HLB',
      codigo: 'CURSO_HLB',
      nombre: 'Curso de manejo defensivo HLB',
      aplicaA: 'conductor',
      bloqueante: true,
      diasAlerta: 30,
    },
    {
      id: 'tipo-LICENCIA',
      codigo: 'LICENCIA',
      nombre: 'Licencia de conducción',
      aplicaA: 'conductor',
      bloqueante: true,
      diasAlerta: 30,
    },
    {
      id: 'tipo-VACUNA_FIEBRE',
      codigo: 'VACUNA_FIEBRE',
      nombre: 'Vacuna fiebre amarilla',
      aplicaA: 'conductor',
      bloqueante: false,
      diasAlerta: 60,
    },
  ];
  const maestros: SemillaMaestros = {
    tiposDocumento,
    transportadoras: [
      { id: 'tra-masa', nombre: 'MASA', activo: true },
      { id: 'tra-gayco', nombre: 'GAYCO', activo: true },
      { id: 'tra-corocoras', nombre: 'COROCORAS', activo: true },
      { id: 'tra-solcarga', nombre: 'SOLCARGA', activo: true },
    ],
    conductores: [
      {
        id: 'con-01',
        nombres: 'CONDUCTOR 01 ANONIMIZADO',
        documento: '2001000101',
        celular: '3200000001',
        correo: null,
        asociadoId: 'a-02',
        licenciaCategoria: 'C3',
        licenciaVence: '2028-03-31',
        creadoEn,
        actualizadoEn: creadoEn,
        eliminadoEn: null,
      },
      {
        id: 'con-02',
        nombres: 'CONDUCTOR 02 ANONIMIZADO',
        documento: '2001000202',
        celular: '3200000002',
        correo: null,
        asociadoId: 'a-06',
        licenciaCategoria: 'C3',
        licenciaVence: '2027-01-15',
        creadoEn,
        actualizadoEn: creadoEn,
        eliminadoEn: null,
      },
    ],
    vehiculoConductores: [
      { vehiculoId: 'veh-FST189', conductorId: 'con-01', esPrincipal: true },
      { vehiculoId: 'veh-SWI750', conductorId: 'con-02', esPrincipal: true },
    ],
    tarifas: [
      {
        id: 'tar-hlb-castilla-tm',
        clienteId: 'cli-hlb',
        origen: 'VILLAVICENCIO',
        destinoId: 'des-castilla',
        clase: 'TM',
        modalidad: 'cama_alta',
        valor: 850_000,
        vigenciaDesde: '2026-01-01',
        vigenciaHasta: null,
      },
      {
        id: 'tar-hlb-castilla-c100',
        clienteId: 'cli-hlb',
        origen: 'VILLAVICENCIO',
        destinoId: 'des-castilla',
        clase: 'C100',
        modalidad: 'carroceria',
        valor: 420_000,
        vigenciaDesde: '2026-01-01',
        vigenciaHasta: null,
      },
      {
        id: 'tar-hlb-rubiales-tm',
        clienteId: 'cli-hlb',
        origen: 'VILLAVICENCIO',
        destinoId: 'des-rubiales',
        clase: 'TM',
        modalidad: 'cama_alta',
        valor: 2_400_000,
        vigenciaDesde: '2026-01-01',
        vigenciaHasta: null,
      },
    ],
    documentos: [
      {
        id: 'doc-ufr114-soat',
        sujetoTipo: 'vehiculo',
        sujetoId: 'veh-UFR114',
        tipoId: 'tipo-SOAT',
        numero: 'SOAT-114-2025',
        emitidoEn: '2025-09-01',
        venceEn: '2026-09-01',
        archivoUrl: null,
        creadoEn,
        actualizadoEn: creadoEn,
        eliminadoEn: null,
      },
      {
        id: 'doc-qor007-tecno',
        sujetoTipo: 'vehiculo',
        sujetoId: 'veh-QOR007',
        tipoId: 'tipo-TECNOMEC',
        numero: 'RTM-007-2025',
        emitidoEn: '2025-09-28',
        venceEn: '2026-09-28',
        archivoUrl: null,
        creadoEn,
        actualizadoEn: creadoEn,
        eliminadoEn: null,
      },
    ],
  };

  return { estado, usuarios, maestros };
}
