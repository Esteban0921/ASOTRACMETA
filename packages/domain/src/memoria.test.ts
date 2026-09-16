import { PARAMETROS_DEFAULT } from '@asotracmet/shared';
import { describe, expect, it } from 'vitest';
import { ErrorDominio } from './errores.js';
import { AlmacenMemoria, IdsSecuenciales, RelojFijo, estadoVacio } from './memoria.js';

function almacen() {
  const reloj = new RelojFijo();
  return new AlmacenMemoria(estadoVacio(PARAMETROS_DEFAULT), { reloj, ids: new IdsSecuenciales() });
}

describe('AlmacenMemoria · semántica transaccional', () => {
  it('si la función lanza, el estado vuelve al snapshot previo', async () => {
    const a = almacen();
    await expect(
      a.ejecutar('TM-CBZ', async (tx) => {
        await tx.guardarRequerimiento({
          id: 'r',
          clienteId: 'c',
          destinoId: null,
          claseCola: 'TM-CBZ',
          fechaServicio: '2026-09-17',
          cantidadCupos: 1,
          observaciones: null,
          estado: 'abierto',
          creadoPor: 'x',
          creadoEn: 'now',
        });
        await tx.auditar({
          actorId: 'x',
          actorRol: 'admin_ops',
          accion: 'prueba',
          entidad: 'requerimientos',
          entidadId: 'r',
          before: null,
          after: null,
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(a.estado.requerimientos).toHaveLength(0);
    expect(a.estado.auditoria).toHaveLength(0);
    expect(a.lockTomado('TM-CBZ')).toBe(false);
  });

  it('el lock se libera al terminar y se rechaza mientras está tomado', async () => {
    const a = almacen();
    let liberar!: () => void;
    const larga = a.ejecutar('C100', () => new Promise<void>((resolve) => (liberar = resolve)));
    expect(a.lockTomado('C100')).toBe(true);
    await expect(a.ejecutar('C100', async () => 1)).rejects.toMatchObject({ code: 'COLA_LOCKED' });
    await expect(a.ejecutar('C350', async () => 2)).resolves.toBe(2);
    liberar();
    await larga;
    expect(a.lockTomado('C100')).toBe(false);
  });

  it('siguienteCodigoTr consume la secuencia y detecta desfase', async () => {
    const a = almacen();
    const c1 = await a.ejecutar(null, (tx) => tx.siguienteCodigoTr());
    const c2 = await a.ejecutar(null, (tx) => tx.siguienteCodigoTr());
    expect([c1, c2]).toEqual(['TR-41947', 'TR-41948']);
    a.estado.parametros.secuencia_tr.next = 41947;
    a.estado.trs.push({
      id: 't',
      codigo: 'TR-41947',
      ofertaId: null,
      requerimientoId: 'r',
      vehiculoId: 'v',
      claseCola: 'TM-CBZ',
      clienteId: 'c',
      destinoId: null,
      fechaAsignacion: '2026-09-16',
      estado: 'asignado',
      canceladoEn: null,
      canceladoPor: null,
      motivoCancelacion: null,
      version: 1,
    });
    await expect(a.ejecutar(null, (tx) => tx.siguienteCodigoTr())).rejects.toBeInstanceOf(
      ErrorDominio,
    );
  });

  it('la auditoría es append-only con actor y timestamp', async () => {
    const a = almacen();
    await a.ejecutar(null, (tx) =>
      tx.auditar({
        actorId: 'u',
        actorRol: 'superadmin',
        accion: 'parametros.cambiar',
        entidad: 'parametros',
        entidadId: 'recaudo_porcentaje',
        before: 0.03,
        after: 0.035,
      }),
    );
    expect(a.estado.auditoria).toEqual([
      expect.objectContaining({
        id: 'id-1',
        at: '2026-09-16T13:00:00.000Z',
        accion: 'parametros.cambiar',
      }),
    ]);
  });
});
