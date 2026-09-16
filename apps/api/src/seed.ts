import { PARAMETROS_DEFAULT, claseColaDe, type ClaseVehiculo } from '@asotracmet/shared';
import { estadoVacio, type EstadoMemoria } from '@asotracmet/domain';
import { hashPassword } from './auth/passwords.js';
import type { Usuario } from './usuarios.js';

// Seed determinista (spec §22.4): placas del legado de septiembre 2026 con asociados anonimizados.
// Sirve para dev, tests de API y e2e. Nunca contiene claves de GPS ni datos reales de personas.

export const PASSWORD_DEV = 'Asotracmet2026!';

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

export function crearSeed(ahora: Date): { estado: EstadoMemoria; usuarios: Usuario[] } {
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
  const usuario = (
    id: string,
    email: string,
    nombre: string,
    rol: Usuario['rol'],
    extra: Partial<Pick<Usuario, 'asociadoId' | 'vehiculoIds'>> = {},
  ): Usuario => ({
    id,
    email,
    nombre,
    rol,
    passwordHash,
    activo: true,
    asociadoId: extra.asociadoId ?? null,
    vehiculoIds: extra.vehiculoIds ?? [],
  });

  const usuarios: Usuario[] = [
    usuario('usr-super', 'superadmin@asotracmet.test', 'Superadmin', 'superadmin'),
    usuario('usr-ops', 'ops@asotracmet.test', 'Coordinación de turnos', 'admin_ops'),
    usuario('usr-hseq', 'hseq@asotracmet.test', 'Flota y HSEQ', 'admin_hseq'),
    usuario('usr-finance', 'finance@asotracmet.test', 'Tesorería', 'admin_finance'),
    usuario('usr-viewer', 'viewer@asotracmet.test', 'Veeduría', 'viewer'),
    usuario('usr-member-fst189', 'member.fst189@asotracmet.test', 'Asociado 02', 'member', {
      asociadoId: 'a-02',
      vehiculoIds: ['veh-FST189', 'veh-TKM221'],
    }),
    usuario('usr-member-swi750', 'member.swi750@asotracmet.test', 'Asociado 06', 'member', {
      asociadoId: 'a-06',
      vehiculoIds: ['veh-SWI750'],
    }),
  ];

  return { estado, usuarios };
}
