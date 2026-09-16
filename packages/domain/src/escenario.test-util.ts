import {
  PARAMETROS_DEFAULT,
  claseColaDe,
  type ClaseVehiculo,
  type Parametros,
} from '@asotracmet/shared';
import {
  AlmacenMemoria,
  IdsSecuenciales,
  RelojFijo,
  estadoVacio,
  type EstadoMemoria,
} from './memoria.js';
import { MotorCola } from './motor-cola.js';
import type { Actor, ColaPosicion, Requerimiento, Vehiculo } from './tipos.js';

// Escenario compartido por los tests del motor: cola TM-CBZ inspirada en el TURNERO de septiembre 2026.
// Placas reales del legado, asociados anonimizados.

export const OPS: Actor = { id: 'u-ops', rol: 'admin_ops' };
export const SUPER: Actor = { id: 'u-super', rol: 'superadmin' };

export interface Escenario {
  almacen: AlmacenMemoria;
  reloj: RelojFijo;
  motor: MotorCola;
  estado: EstadoMemoria;
  requerimiento: Requerimiento;
  vehiculoPorPlaca(placa: string): Vehiculo;
  memberDe(...placas: string[]): Actor;
  posiciones(): ColaPosicion[];
  placasEnOrden(): string[];
}

interface OpcionesEscenario {
  parametros?: Partial<Parametros>;
  cupos?: number;
}

const FLOTA: Array<{ placa: string; clase: ClaseVehiculo; asociado: string; aptoHlb: boolean }> = [
  { placa: 'SPS413', clase: 'TM', asociado: 'a-01', aptoHlb: false },
  { placa: 'FST189', clase: 'TM', asociado: 'a-02', aptoHlb: true },
  { placa: 'SWI750', clase: 'CBZ', asociado: 'a-02', aptoHlb: true },
  { placa: 'QOR007', clase: 'TM', asociado: 'a-03', aptoHlb: true },
  { placa: 'SOF336', clase: 'TM', asociado: 'a-04', aptoHlb: true },
  { placa: 'SUL470', clase: 'CBZ', asociado: 'a-05', aptoHlb: true },
];

export function crearEscenario(opciones: OpcionesEscenario = {}): Escenario {
  const reloj = new RelojFijo('2026-09-16T13:00:00Z');
  const ids = new IdsSecuenciales();
  const estado = estadoVacio({ ...PARAMETROS_DEFAULT, ...opciones.parametros });

  estado.clientes.push(
    { id: 'c-hlb', codigo: 'HLB', nombre: 'Halliburton', requiereHabilitacion: true },
    { id: 'c-baker', codigo: 'BAKER', nombre: 'Baker Hughes', requiereHabilitacion: true },
  );
  estado.destinos.push({ id: 'd-castilla', nombre: 'CASTILLA LA NUEVA', km: 60, activo: true });
  estado.motivosDeclinacion.push(
    {
      id: 'm-mantenimiento',
      codigo: 'MANTENIMIENTO',
      nombre: 'Vehículo en mantenimiento',
      activo: true,
    },
    { id: 'm-personal', codigo: 'PERSONAL', nombre: 'Motivo personal', activo: true },
    { id: 'm-inactivo', codigo: 'VIEJO', nombre: 'Motivo retirado', activo: false },
  );
  for (const codigo of ['a-01', 'a-02', 'a-03', 'a-04', 'a-05']) {
    estado.asociados.push({
      id: codigo,
      tipo: 'persona',
      documento: `10000000${codigo.slice(-1)}`,
      nombres: `ASOCIADO ${codigo.slice(-2)}`,
      apellidos: 'ANONIMIZADO',
      razonSocial: null,
      celular: null,
      correo: null,
    });
  }

  FLOTA.forEach((f, indice) => {
    const id = `v-${f.placa}`;
    estado.vehiculos.push({
      id,
      placa: f.placa,
      clase: f.clase,
      claseCola: claseColaDe(f.clase),
      asociadoId: f.asociado,
      estado: 'activo',
      noElegibleHasta: null,
    });
    estado.habilitaciones.push({
      vehiculoId: id,
      clienteId: 'c-hlb',
      apto: f.aptoHlb,
      motivoBloqueo: f.aptoHlb ? null : 'Curso HLB vencido',
    });
    estado.posiciones.push({
      id: `p-${f.placa}`,
      claseCola: 'TM-CBZ',
      vehiculoId: id,
      posicion: indice + 1,
      ciclo: 1,
      turnosOfrecidos: 0,
      turnosTomados: 0,
      saltosPendientes: 0,
      version: 1,
    });
  });

  const requerimiento: Requerimiento = {
    id: 'req-1',
    clienteId: 'c-hlb',
    destinoId: 'd-castilla',
    claseCola: 'TM-CBZ',
    fechaServicio: '2026-09-17',
    cantidadCupos: opciones.cupos ?? 2,
    observaciones: null,
    estado: 'abierto',
    creadoPor: OPS.id,
    creadoEn: reloj.ahora().toISOString(),
  };
  estado.requerimientos.push(requerimiento);

  const almacen = new AlmacenMemoria(estado, { reloj, ids });
  const motor = new MotorCola({ uow: almacen, reloj, ids });

  return {
    almacen,
    reloj,
    motor,
    get estado() {
      return almacen.estado;
    },
    requerimiento,
    vehiculoPorPlaca: (placa) => {
      const vehiculo = almacen.estado.vehiculos.find((v) => v.placa === placa);
      if (!vehiculo) throw new Error(`Placa ${placa} no está en el escenario`);
      return vehiculo;
    },
    memberDe: (...placas) => ({
      id: `u-member-${placas.join('-')}`,
      rol: 'member',
      vehiculoIds: placas.map((p) => `v-${p}`),
    }),
    posiciones: () =>
      almacen.estado.posiciones
        .filter((p) => p.claseCola === 'TM-CBZ')
        .sort((a, b) => a.posicion - b.posicion),
    placasEnOrden: () =>
      almacen.estado.posiciones
        .filter((p) => p.claseCola === 'TM-CBZ')
        .sort((a, b) => a.posicion - b.posicion)
        .map((p) => almacen.estado.vehiculos.find((v) => v.id === p.vehiculoId)?.placa ?? '?'),
  };
}
