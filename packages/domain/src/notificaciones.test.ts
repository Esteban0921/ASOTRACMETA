import { describe, expect, it } from 'vitest';
import { OPS, crearEscenario } from './escenario.test-util.js';

// Outbox de avisos (spec §11, ADR-0006): el motor deja el aviso en la misma transacción que la
// mutación. Sin transacción confirmada no hay aviso; con ella, siempre lo hay.

describe('outbox de avisos (spec §11)', () => {
  it('ofrecer → oferta.abierta al asociado de la placa; aceptar → tr.asignado a asociado y ops', async () => {
    const e = crearEscenario();
    const oferta = await e.motor.ofrecer({ requerimientoId: e.requerimiento.id, actor: OPS });
    const outbox = e.almacen.estado.outbox;
    expect(outbox.map((a) => a.evento)).toEqual(['oferta.abierta']);
    expect(outbox[0]).toMatchObject({
      destinos: [{ asociadoId: oferta.asociadoId, vehiculoId: oferta.vehiculoId }],
      datos: {
        ofertaId: oferta.id,
        clienteId: e.requerimiento.clienteId,
        claseCola: e.requerimiento.claseCola,
        expiraEn: oferta.expiraEn,
      },
      clave: null,
      intentos: 0,
      procesadaEn: null,
    });

    const placa = e.almacen.estado.vehiculos.find((v) => v.id === oferta.vehiculoId)!.placa;
    const { tr } = await e.motor.aceptar({ ofertaId: oferta.id, actor: e.memberDe(placa) });
    const asignado = e.almacen.estado.outbox.find((a) => a.evento === 'tr.asignado')!;
    expect(asignado.destinos).toEqual([
      { asociadoId: oferta.asociadoId, vehiculoId: oferta.vehiculoId },
      { rol: 'admin_ops' },
    ]);
    expect(asignado.datos).toMatchObject({
      codigo: tr.codigo,
      vehiculoId: tr.vehiculoId,
      clienteId: tr.clienteId,
    });
  });

  it('declinar avisa a ops con el motivo y reoferta (otro oferta.abierta); cancelar el TR avisa al asociado', async () => {
    const e = crearEscenario();
    const primera = await e.motor.ofrecer({ requerimientoId: e.requerimiento.id, actor: OPS });
    const placa1 = e.almacen.estado.vehiculos.find((v) => v.id === primera.vehiculoId)!.placa;
    const motivo = e.almacen.estado.motivosDeclinacion[0]!;
    await e.motor.declinar({
      ofertaId: primera.id,
      motivoId: motivo.id,
      nota: 'en taller',
      actor: e.memberDe(placa1),
    });
    const declinada = e.almacen.estado.outbox.find((a) => a.evento === 'oferta.declinada')!;
    expect(declinada.destinos).toEqual([{ rol: 'admin_ops' }]);
    expect(declinada.datos).toMatchObject({
      ofertaId: primera.id,
      vehiculoId: primera.vehiculoId,
      motivo: motivo.nombre,
      nota: 'en taller',
    });
    expect(e.almacen.estado.outbox.filter((a) => a.evento === 'oferta.abierta')).toHaveLength(2);

    const segunda = e.almacen.estado.ofertas.find((o) => o.estado === 'abierta')!;
    const placa2 = e.almacen.estado.vehiculos.find((v) => v.id === segunda.vehiculoId)!.placa;
    const { tr } = await e.motor.aceptar({ ofertaId: segunda.id, actor: e.memberDe(placa2) });
    await e.motor.cancelarTr({ trId: tr.id, motivo: 'El cliente canceló', actor: OPS });
    const cancelado = e.almacen.estado.outbox.find((a) => a.evento === 'tr.cancelado')!;
    expect(cancelado.destinos).toEqual([
      { asociadoId: segunda.asociadoId, vehiculoId: segunda.vehiculoId },
    ]);
    expect(cancelado.datos).toMatchObject({ codigo: tr.codigo, motivo: 'El cliente canceló' });
  });

  it('si la transacción se revierte el aviso se va con ella; la clave deduplica', async () => {
    const e = crearEscenario();
    await expect(
      e.almacen.ejecutar('TM-CBZ', async (tx) => {
        await tx.notificar({
          evento: 'recaudo.pendiente',
          destinos: [{ rol: 'admin_finance' }],
          datos: {},
        });
        throw new Error('se cae');
      }),
    ).rejects.toThrow('se cae');
    expect(e.almacen.estado.outbox).toHaveLength(0);

    await e.almacen.ejecutar(null, async (tx) => {
      const aviso = {
        evento: 'recaudo.pendiente' as const,
        destinos: [{ rol: 'admin_finance' as const }],
        datos: { hoy: '2026-09-16' },
        clave: 'recaudo.pendiente:2026-09-16',
      };
      await tx.notificar(aviso);
      await tx.notificar(aviso);
    });
    expect(e.almacen.estado.outbox).toHaveLength(1);
  });
});
