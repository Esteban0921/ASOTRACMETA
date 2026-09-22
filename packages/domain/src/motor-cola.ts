import {
  CLASES_COLA,
  ESTADOS_TR_ACTIVOS,
  fechaLocal,
  sumarHoras,
  sumarMinutos,
  type ClaseCola,
  type Parametros,
} from '@asotracmet/shared';
import {
  evaluarCola,
  evaluarElegibilidad,
  firmaCola,
  type ContextoElegibilidad,
} from './elegibilidad.js';
import { ErrorDominio } from './errores.js';
import {
  actualizarPosicion,
  moverACabeza,
  moverAPosicion,
  renumerar,
  rotarAlFinal,
  verificarInvariantesCola,
} from './invariantes.js';
import type { GeneradorIds, Reloj, Transaccion, UnidadDeTrabajo } from './puertos.js';
import type {
  Actor,
  Cliente,
  ColaPosicion,
  Descarte,
  EsperadoOferta,
  Oferta,
  PosicionCola,
  Requerimiento,
  Tr,
  Vehiculo,
  VistaPrevia,
} from './tipos.js';

export interface DependenciasMotor {
  uow: UnidadDeTrabajo;
  reloj: Reloj;
  ids: GeneradorIds;
}

interface Candidato {
  posicion: ColaPosicion;
  vehiculo: Vehiculo;
}

/** La cola de una clase con todo lo que los filtros de §7.2 necesitan, cargada una sola vez. */
interface FilasCola {
  parametros: Parametros;
  cliente: Cliente | null;
  posiciones: ColaPosicion[];
  filas: ContextoElegibilidad[];
}

/** Lo que el acta de turno (brief §5) guarda de cada oferta además de la oferta misma. */
interface ActaOferta {
  /** Posición que tenía la elegida al ofrecer; `null` solo si la placa ya no está en la cola. */
  posicionElegida: number | null;
  descartes: Descarte[];
  firma: string;
  clienteCodigo: string | null;
}

/**
 * El corazón del sistema (spec §7). El frontend no calcula el siguiente de la cola:
 * llama a la API y la API llama aquí. Toda mutación emite audit en la misma transacción.
 */
export class MotorCola {
  private readonly uow: UnidadDeTrabajo;
  private readonly reloj: Reloj;
  private readonly ids: GeneradorIds;

  constructor(deps: DependenciasMotor) {
    this.uow = deps.uow;
    this.reloj = deps.reloj;
    this.ids = deps.ids;
  }

  /** Snapshot de una clase con elegibilidad calculada (para `GET /colas/:clase`). Solo lectura. */
  async snapshotCola(claseCola: ClaseCola, clienteId?: string): Promise<PosicionCola[]> {
    return this.uow.leer(async (tx) => {
      const { filas } = await this.filasDeCola(tx, claseCola, clienteId);
      const resultado: PosicionCola[] = [];
      for (const fila of filas) {
        const asociado = (await tx.asociado(fila.vehiculo.asociadoId)) ?? null;
        resultado.push({
          ...fila.posicion,
          vehiculo: fila.vehiculo,
          asociado,
          elegibilidad: evaluarElegibilidad(fila),
        });
      }
      return resultado;
    });
  }

  /**
   * Vista previa del acta de turno (brief §5): quién saldría para este requerimiento y a quién se
   * saltaría, sin lock ni efectos (ni saltos consumidos, ni audit, ni outbox). La sala la ve antes
   * de ofrecer y devuelve `firma` + `vehiculoId` como `esperado`; el motor lo verifica al ofrecer
   * (RULE-010: el frontend afirma lo que vio, el motor decide). `actor` viaja por simetría con
   * `ofrecer`; el alcance lo aplica la ruta (no es una vista para `member`: bajo RLS vería solo
   * sus placas y la cola quedaría incompleta).
   */
  async previsualizarOferta(input: {
    requerimientoId: string;
    actor: Actor;
  }): Promise<VistaPrevia> {
    return this.uow.leer(async (tx) => {
      const requerimiento = await this.requerimientoAbierto(tx, input.requerimientoId);
      const { disponibles } = await this.cuposDisponibles(tx, requerimiento);
      const { candidato, descartes, firma } = await this.evaluarSiguiente(
        tx,
        requerimiento.claseCola,
        requerimiento.clienteId,
      );
      return {
        candidato: candidato
          ? {
              vehiculoId: candidato.vehiculo.id,
              placa: candidato.vehiculo.placa,
              asociadoId: candidato.vehiculo.asociadoId,
              posicion: candidato.posicion.posicion,
            }
          : null,
        descartes,
        firma,
        cuposDisponibles: Math.max(disponibles, 0),
        claseCola: requerimiento.claseCola,
        clienteId: requerimiento.clienteId,
      };
    });
  }

  /**
   * `POST /requerimientos/:id/ofertas` (§7.3). No avanza la cola; se avanza al resolver.
   * Con `esperado` (acta de turno, brief §5) el coordinador afirma la placa y la firma que vio en
   * la vista previa: si la cola cambió, `CANDIDATO_CAMBIO` y el rollback garantiza cero efectos.
   */
  async ofrecer(input: {
    requerimientoId: string;
    actor: Actor;
    esperado?: EsperadoOferta;
  }): Promise<Oferta> {
    const claseCola = await this.claseColaDeRequerimiento(input.requerimientoId);
    return this.uow.ejecutar(claseCola, async (tx) => {
      const requerimiento = await this.requerimientoAbierto(tx, input.requerimientoId);
      return this.ofrecerEnTx(tx, requerimiento, input.actor, input.esperado);
    });
  }

  /** `POST /ofertas/:id/aceptar` (§7.4). Crea el TR y rota la placa si la política lo indica. */
  async aceptar(input: { ofertaId: string; actor: Actor }): Promise<{ oferta: Oferta; tr: Tr }> {
    const claseCola = await this.claseColaDeOferta(input.ofertaId);
    return this.uow.ejecutar(claseCola, async (tx) => {
      const ahora = this.reloj.ahora();
      const parametros = await tx.parametros();
      const oferta = await this.ofertaAbiertaVigente(tx, input.ofertaId, ahora);
      this.exigirScopePropio(input.actor, oferta.vehiculoId);

      const requerimiento = await tx.requerimiento(oferta.requerimientoId);
      if (!requerimiento) throw new ErrorDominio('NOT_FOUND', 'Requerimiento no existe');

      const aceptada: Oferta = {
        ...oferta,
        estado: 'aceptada',
        respondidaEn: ahora.toISOString(),
        respondidaPor: input.actor.id,
      };
      await tx.guardarOferta(aceptada);
      await tx.auditar(this.evento(input.actor, 'oferta.aceptar', 'ofertas', oferta, aceptada));

      const tr: Tr = {
        id: this.ids.nuevo(),
        codigo: await tx.siguienteCodigoTr(),
        ofertaId: oferta.id,
        requerimientoId: requerimiento.id,
        vehiculoId: oferta.vehiculoId,
        claseCola,
        clienteId: requerimiento.clienteId,
        destinoId: requerimiento.destinoId,
        fechaAsignacion: fechaLocal(ahora, parametros.timezone),
        estado: 'asignado',
        canceladoEn: null,
        canceladoPor: null,
        motivoCancelacion: null,
        version: 1,
      };
      await tx.guardarTr(tr);
      await tx.auditar(this.evento(input.actor, 'tr.crear', 'trs', null, tr));
      await tx.notificar({
        evento: 'tr.asignado',
        destinos: [
          { asociadoId: oferta.asociadoId, vehiculoId: oferta.vehiculoId },
          { rol: 'admin_ops' },
        ],
        datos: {
          trId: tr.id,
          codigo: tr.codigo,
          vehiculoId: tr.vehiculoId,
          clienteId: tr.clienteId,
          claseCola: tr.claseCola,
          fechaAsignacion: tr.fechaAsignacion,
        },
      });

      let posiciones = await tx.posiciones(claseCola);
      posiciones = actualizarPosicion(posiciones, oferta.vehiculoId, {
        turnosTomados:
          (posiciones.find((p) => p.vehiculoId === oferta.vehiculoId)?.turnosTomados ?? 0) + 1,
      });
      if (parametros.consume_posicion_al_aceptar) {
        const antes = posiciones;
        posiciones = rotarAlFinal(posiciones, oferta.vehiculoId);
        await tx.auditar(
          this.evento(
            input.actor,
            'cola.rotar',
            'cola',
            this.resumenCola(antes),
            this.resumenCola(posiciones),
          ),
        );
      }
      await this.guardarCola(tx, claseCola, posiciones);

      await this.cerrarSiCompleto(tx, requerimiento, input.actor);
      return { oferta: aceptada, tr };
    });
  }

  /** `POST /ofertas/:id/declinar` (§7.4). Aplica la política de declinación y reoferta al siguiente. */
  async declinar(input: {
    ofertaId: string;
    motivoId: string;
    nota?: string;
    actor: Actor;
  }): Promise<{ oferta: Oferta; siguiente: Oferta | null }> {
    const claseCola = await this.claseColaDeOferta(input.ofertaId);
    return this.uow.ejecutar(claseCola, async (tx) => {
      const ahora = this.reloj.ahora();
      const parametros = await tx.parametros();
      const oferta = await this.ofertaAbiertaVigente(tx, input.ofertaId, ahora);
      this.exigirScopePropio(input.actor, oferta.vehiculoId);

      const motivo = await tx.motivoDeclinacion(input.motivoId);
      if (!motivo || !motivo.activo) {
        throw new ErrorDominio('MOTIVO_REQUERIDO', 'Toda declinación pide motivo de catálogo', {
          motivoId: input.motivoId,
        });
      }

      const declinada: Oferta = {
        ...oferta,
        estado: 'declinada',
        motivoDeclinacionId: motivo.id,
        nota: input.nota ?? null,
        respondidaEn: ahora.toISOString(),
        respondidaPor: input.actor.id,
      };
      await tx.guardarOferta(declinada);
      await tx.auditar(this.evento(input.actor, 'oferta.declinar', 'ofertas', oferta, declinada));
      await tx.notificar({
        evento: 'oferta.declinada',
        destinos: [{ rol: 'admin_ops' }],
        datos: {
          ofertaId: oferta.id,
          vehiculoId: oferta.vehiculoId,
          motivo: motivo.nombre,
          nota: declinada.nota,
        },
      });

      await this.aplicarPoliticaDeclinacion(
        tx,
        claseCola,
        oferta.vehiculoId,
        parametros,
        ahora,
        input.actor,
      );

      const requerimiento = await tx.requerimiento(oferta.requerimientoId);
      const siguiente =
        requerimiento && requerimiento.estado === 'abierto'
          ? await this.intentarOfrecer(tx, requerimiento, input.actor)
          : null;
      return { oferta: declinada, siguiente };
    });
  }

  /** `POST /ofertas/:id/anular` (§7.4). No rota. Queda rastro con motivo. */
  async anular(input: { ofertaId: string; motivo: string; actor: Actor }): Promise<Oferta> {
    const claseCola = await this.claseColaDeOferta(input.ofertaId);
    return this.uow.ejecutar(claseCola, async (tx) => {
      const oferta = await tx.oferta(input.ofertaId);
      if (!oferta) throw new ErrorDominio('NOT_FOUND', 'Oferta no existe');
      if (oferta.estado !== 'abierta') {
        throw new ErrorDominio('OFERTA_NO_ABIERTA', `Oferta en estado ${oferta.estado}`);
      }
      if (!input.motivo.trim()) throw new ErrorDominio('MOTIVO_REQUERIDO');
      const anulada: Oferta = {
        ...oferta,
        estado: 'anulada',
        nota: input.motivo,
        respondidaEn: this.reloj.ahora().toISOString(),
        respondidaPor: input.actor.id,
      };
      await tx.guardarOferta(anulada);
      await tx.auditar(this.evento(input.actor, 'oferta.anular', 'ofertas', oferta, anulada));
      return anulada;
    });
  }

  /** Job cada minuto (§7.4 Expira, §14). Devuelve las ofertas expiradas en esta corrida. */
  async expirarOfertas(actor: Actor = { id: 'sistema', rol: 'superadmin' }): Promise<Oferta[]> {
    const ahora = this.reloj.ahora();
    const vencidas = await this.uow.leer((tx) => tx.ofertasAbiertasVencidas(ahora.toISOString()));
    const porClase = new Map<ClaseCola, Oferta[]>();
    await this.uow.leer(async (tx) => {
      for (const oferta of vencidas) {
        const vehiculo = await tx.vehiculo(oferta.vehiculoId);
        if (!vehiculo) continue;
        const lista = porClase.get(vehiculo.claseCola) ?? [];
        lista.push(oferta);
        porClase.set(vehiculo.claseCola, lista);
      }
    });

    const expiradas: Oferta[] = [];
    for (const [claseCola, ofertas] of porClase) {
      try {
        const resultado = await this.uow.ejecutar(claseCola, async (tx) => {
          const parametros = await tx.parametros();
          const procesadas: Oferta[] = [];
          for (const pendiente of ofertas) {
            const oferta = await tx.oferta(pendiente.id);
            if (!oferta || oferta.estado !== 'abierta') continue;
            const expirada: Oferta = {
              ...oferta,
              estado: 'expirada',
              respondidaEn: ahora.toISOString(),
            };
            await tx.guardarOferta(expirada);
            await tx.auditar(this.evento(actor, 'oferta.expirar', 'ofertas', oferta, expirada));
            procesadas.push(expirada);

            const requerimiento = await tx.requerimiento(oferta.requerimientoId);
            if (parametros.oferta_expirada_politica === 'declina') {
              await this.aplicarPoliticaDeclinacion(
                tx,
                claseCola,
                oferta.vehiculoId,
                parametros,
                ahora,
                actor,
              );
              if (requerimiento?.estado === 'abierto')
                await this.intentarOfrecer(tx, requerimiento, actor);
            } else if (requerimiento?.estado === 'abierto') {
              // Política `reofertar`: nueva oferta a la misma placa sin evaluar la cola, así que
              // el acta no lleva saltadas (nadie quedó por delante de ella).
              await this.crearOferta(
                tx,
                requerimiento,
                oferta.vehiculoId,
                oferta.asociadoId,
                actor,
                parametros,
                await this.actaReoferta(tx, requerimiento, oferta.vehiculoId),
              );
            }
          }
          return procesadas;
        });
        expiradas.push(...resultado);
      } catch (error) {
        // Si la clase está bloqueada por un coordinador, el job reintenta en la próxima corrida.
        if (!(error instanceof ErrorDominio && error.code === 'COLA_LOCKED')) throw error;
      }
    }
    return expiradas;
  }

  /** `POST /trs/:id/cancelar` (§7.5). Nunca borra historia. */
  async cancelarTr(input: {
    trId: string;
    motivo: string;
    actor: Actor;
  }): Promise<{ tr: Tr; siguiente: Oferta | null }> {
    const claseCola = await this.claseColaDeTr(input.trId);
    return this.uow.ejecutar(claseCola, async (tx) => {
      const ahora = this.reloj.ahora();
      const parametros = await tx.parametros();
      const tr = await tx.tr(input.trId);
      if (!tr) throw new ErrorDominio('NOT_FOUND', 'TR no existe');
      if (!ESTADOS_TR_ACTIVOS.includes(tr.estado)) {
        throw new ErrorDominio('TR_NO_CANCELABLE', `TR ${tr.codigo} está ${tr.estado}`);
      }
      if (!input.motivo.trim()) throw new ErrorDominio('MOTIVO_REQUERIDO');

      const cancelado: Tr = {
        ...tr,
        estado: 'cancelado',
        canceladoEn: ahora.toISOString(),
        canceladoPor: input.actor.id,
        motivoCancelacion: input.motivo,
        version: tr.version + 1,
      };
      await tx.guardarTr(cancelado);
      await tx.auditar(this.evento(input.actor, 'tr.cancelar', 'trs', tr, cancelado));
      const duenoTr = await tx.vehiculo(tr.vehiculoId);
      await tx.notificar({
        evento: 'tr.cancelado',
        destinos: [{ asociadoId: duenoTr?.asociadoId, vehiculoId: tr.vehiculoId }],
        datos: {
          trId: tr.id,
          codigo: tr.codigo,
          vehiculoId: tr.vehiculoId,
          motivo: input.motivo,
        },
      });

      let siguiente: Oferta | null = null;
      if (parametros.tr_cancelado_regresa_al_mismo) {
        const antes = await tx.posiciones(claseCola);
        const despues = moverACabeza(antes, tr.vehiculoId);
        await this.guardarCola(tx, claseCola, despues);
        await tx.auditar(
          this.evento(
            input.actor,
            'cola.regresar_cabeza',
            'cola',
            this.resumenCola(antes),
            this.resumenCola(despues),
          ),
        );
      } else {
        const requerimiento = await tx.requerimiento(tr.requerimientoId);
        if (requerimiento && requerimiento.estado !== 'cancelado') {
          if (requerimiento.estado === 'cerrado') {
            const reabierto: Requerimiento = { ...requerimiento, estado: 'abierto' };
            await tx.guardarRequerimiento(reabierto);
            await tx.auditar(
              this.evento(
                input.actor,
                'requerimiento.reabrir',
                'requerimientos',
                requerimiento,
                reabierto,
              ),
            );
          }
          siguiente = await this.intentarOfrecer(
            tx,
            { ...requerimiento, estado: 'abierto' },
            input.actor,
          );
        }
      }
      return { tr: cancelado, siguiente };
    });
  }

  /** `POST /trs/:id/no-tramitar`. Reemplaza el texto `NO TRAMITAR` del Excel. */
  async noTramitar(input: { trId: string; motivo: string; actor: Actor }): Promise<Tr> {
    const claseCola = await this.claseColaDeTr(input.trId);
    return this.uow.ejecutar(claseCola, async (tx) => {
      const tr = await tx.tr(input.trId);
      if (!tr) throw new ErrorDominio('NOT_FOUND', 'TR no existe');
      if (!ESTADOS_TR_ACTIVOS.includes(tr.estado)) {
        throw new ErrorDominio('TR_NO_CANCELABLE', `TR ${tr.codigo} está ${tr.estado}`);
      }
      if (!input.motivo.trim()) throw new ErrorDominio('MOTIVO_REQUERIDO');
      const actualizado: Tr = {
        ...tr,
        estado: 'no_tramitar',
        motivoCancelacion: input.motivo,
        canceladoEn: this.reloj.ahora().toISOString(),
        canceladoPor: input.actor.id,
        version: tr.version + 1,
      };
      await tx.guardarTr(actualizado);
      await tx.auditar(this.evento(input.actor, 'tr.no_tramitar', 'trs', tr, actualizado));
      return actualizado;
    });
  }

  /**
   * `cola.override` (§7.1.5): "nadie pone a fulano de primero" sin acción de dominio, motivo y
   * re-autenticación. Lleva la placa a la posición indicada y deja el antes y el después en audit,
   * que el veedor puede ver (§21).
   */
  async override(input: {
    claseCola: ClaseCola;
    vehiculoId: string;
    posicion: number;
    motivo: string;
    actor: Actor;
  }): Promise<ColaPosicion[]> {
    if (!input.motivo.trim()) throw new ErrorDominio('MOTIVO_REQUERIDO');
    return this.uow.ejecutar(input.claseCola, async (tx) => {
      const antes = await tx.posiciones(input.claseCola);
      if (!antes.some((p) => p.vehiculoId === input.vehiculoId)) {
        throw new ErrorDominio('NOT_FOUND', 'La placa no está en esa cola');
      }
      const despues = moverAPosicion(antes, input.vehiculoId, input.posicion);
      await this.guardarCola(tx, input.claseCola, despues);
      await tx.auditar({
        actorId: input.actor.id,
        actorRol: input.actor.rol,
        accion: 'cola.override',
        entidad: 'cola',
        entidadId: input.claseCola,
        before: { cola: this.resumenCola(antes) },
        after: {
          cola: this.resumenCola(despues),
          vehiculoId: input.vehiculoId,
          posicion: input.posicion,
          motivo: input.motivo,
        },
      });
      return despues;
    });
  }

  /**
   * Reset de cola por clase (§9.2): la cola vuelve a ser exactamente los vehículos activos de la
   * clase (§13.3), en el orden dado y después por placa, con los contadores de ronda a cero.
   * El estado anterior, contadores incluidos, queda en audit: el reset no borra historia.
   */
  async resetCola(input: {
    claseCola: ClaseCola;
    orden?: readonly string[];
    motivo: string;
    actor: Actor;
  }): Promise<ColaPosicion[]> {
    if (!input.motivo.trim()) throw new ErrorDominio('MOTIVO_REQUERIDO');
    return this.uow.ejecutar(input.claseCola, async (tx) => {
      const antes = await tx.posiciones(input.claseCola);
      const activos = (await tx.vehiculosDeClase(input.claseCola)).filter(
        (v) => v.estado === 'activo',
      );
      const porVehiculo = new Map(activos.map((v) => [v.id, v]));
      const orden = input.orden ?? [];
      const desconocidos = orden.filter((id) => !porVehiculo.has(id));
      if (desconocidos.length > 0 || new Set(orden).size !== orden.length) {
        throw new ErrorDominio(
          'VALIDATION_ERROR',
          'El orden incluye placas repetidas, inactivas o que no son de la clase',
          { desconocidos },
        );
      }
      const primero = orden.map((id) => porVehiculo.get(id)!);
      const resto = activos
        .filter((v) => !orden.includes(v.id))
        .sort((a, b) => a.placa.localeCompare(b.placa));
      const previas = new Map(antes.map((p) => [p.vehiculoId, p]));
      const despues: ColaPosicion[] = [...primero, ...resto].map((v, indice) => ({
        id: previas.get(v.id)?.id ?? this.ids.nuevo(),
        claseCola: input.claseCola,
        vehiculoId: v.id,
        posicion: indice + 1,
        ciclo: 1,
        turnosOfrecidos: 0,
        turnosTomados: 0,
        saltosPendientes: 0,
        version: (previas.get(v.id)?.version ?? 0) + 1,
      }));
      await this.guardarCola(tx, input.claseCola, despues);
      await tx.auditar({
        actorId: input.actor.id,
        actorRol: input.actor.rol,
        accion: 'cola.reset',
        entidad: 'cola',
        entidadId: input.claseCola,
        before: {
          cola: this.resumenCola(antes),
          contadores: antes.map((p) => ({
            vehiculoId: p.vehiculoId,
            ciclo: p.ciclo,
            turnosOfrecidos: p.turnosOfrecidos,
            turnosTomados: p.turnosTomados,
            saltosPendientes: p.saltosPendientes,
          })),
        },
        after: { cola: this.resumenCola(despues), motivo: input.motivo, orden: [...orden] },
      });
      return despues;
    });
  }

  /**
   * Mantiene "la cola de cada clase = vehículos activos de esa clase" (§7.1.2, §13.3) cuando una
   * placa nace, cambia de clase, se retira o vuelve. Entra siempre al final; al salir, sus ofertas
   * abiertas se anulan. Es idempotente y cada movimiento queda en audit.
   */
  async sincronizarVehiculoEnCola(input: {
    vehiculoId: string;
    motivo: string;
    actor: Actor;
  }): Promise<Array<{ claseCola: ClaseCola; accion: 'incorporado' | 'retirado' }>> {
    const vehiculo = await this.uow.leer((tx) => tx.vehiculo(input.vehiculoId));
    if (!vehiculo) throw new ErrorDominio('NOT_FOUND', 'Vehículo no existe');
    // `bloqueado_hseq` es temporal: conserva su posición y el filtro de elegibilidad lo salta.
    const debeEstar = vehiculo.estado === 'activo' || vehiculo.estado === 'bloqueado_hseq';
    const cambios: Array<{ claseCola: ClaseCola; accion: 'incorporado' | 'retirado' }> = [];
    for (const claseCola of CLASES_COLA) {
      const enClase = (await this.uow.leer((tx) => tx.posiciones(claseCola))).some(
        (p) => p.vehiculoId === vehiculo.id,
      );
      const deberia = debeEstar && claseCola === vehiculo.claseCola;
      if (enClase && !deberia) {
        await this.retirarDeCola(claseCola, vehiculo.id, input.motivo, input.actor);
        cambios.push({ claseCola, accion: 'retirado' });
      } else if (!enClase && deberia) {
        await this.incorporarACola(claseCola, vehiculo.id, input.motivo, input.actor);
        cambios.push({ claseCola, accion: 'incorporado' });
      }
    }
    return cambios;
  }

  private async incorporarACola(
    claseCola: ClaseCola,
    vehiculoId: string,
    motivo: string,
    actor: Actor,
  ): Promise<void> {
    await this.uow.ejecutar(claseCola, async (tx) => {
      const antes = await tx.posiciones(claseCola);
      if (antes.some((p) => p.vehiculoId === vehiculoId)) return;
      const despues: ColaPosicion[] = [
        ...antes,
        {
          id: this.ids.nuevo(),
          claseCola,
          vehiculoId,
          posicion: antes.length + 1,
          ciclo: 1,
          turnosOfrecidos: 0,
          turnosTomados: 0,
          saltosPendientes: 0,
          version: 1,
        },
      ];
      await this.guardarCola(tx, claseCola, despues);
      await tx.auditar({
        actorId: actor.id,
        actorRol: actor.rol,
        accion: 'cola.incorporar',
        entidad: 'cola',
        entidadId: claseCola,
        before: { cola: this.resumenCola(antes) },
        after: { cola: this.resumenCola(despues), vehiculoId, motivo },
      });
    });
  }

  private async retirarDeCola(
    claseCola: ClaseCola,
    vehiculoId: string,
    motivo: string,
    actor: Actor,
  ): Promise<void> {
    await this.uow.ejecutar(claseCola, async (tx) => {
      const antes = await tx.posiciones(claseCola);
      if (!antes.some((p) => p.vehiculoId === vehiculoId)) return;
      const despues = renumerar(antes.filter((p) => p.vehiculoId !== vehiculoId));
      await this.guardarCola(tx, claseCola, despues);
      const ahora = this.reloj.ahora().toISOString();
      for (const oferta of await tx.ofertasAbiertasDeVehiculo(vehiculoId)) {
        const anulada: Oferta = {
          ...oferta,
          estado: 'anulada',
          nota: `Placa retirada de la cola: ${motivo}`,
          respondidaEn: ahora,
          respondidaPor: actor.id,
        };
        await tx.guardarOferta(anulada);
        await tx.auditar(this.evento(actor, 'oferta.anular', 'ofertas', oferta, anulada));
      }
      await tx.auditar({
        actorId: actor.id,
        actorRol: actor.rol,
        accion: 'cola.retirar',
        entidad: 'cola',
        entidadId: claseCola,
        before: { cola: this.resumenCola(antes) },
        after: { cola: this.resumenCola(despues), vehiculoId, motivo },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  /**
   * Carga la cola de una clase con el contexto de los filtros de §7.2 para todas sus posiciones.
   * Es la única lectura que hacen el snapshot, la vista previa y la oferta: no hay dos lógicas.
   */
  private async filasDeCola(
    tx: Transaccion,
    claseCola: ClaseCola,
    clienteId: string | undefined,
  ): Promise<FilasCola> {
    const parametros = await tx.parametros();
    const ahora = this.reloj.ahora();
    const hoy = fechaLocal(ahora, parametros.timezone);
    const cliente = clienteId ? ((await tx.cliente(clienteId)) ?? null) : null;
    const posiciones = await tx.posiciones(claseCola);
    const filas: ContextoElegibilidad[] = [];
    for (const posicion of posiciones) {
      const vehiculo = await tx.vehiculo(posicion.vehiculoId);
      if (!vehiculo) continue;
      filas.push({
        posicion,
        vehiculo,
        cliente,
        habilitacion: cliente ? await tx.habilitacion(vehiculo.id, cliente.id) : undefined,
        documentosVencidos: await tx.documentosBloqueantesVencidos(vehiculo.id, hoy),
        ofertasAbiertas: await tx.ofertasAbiertasDeVehiculo(vehiculo.id),
        trsActivos: await tx.trsActivosDeVehiculo(vehiculo.id),
        parametros,
        ahora,
      });
    }
    return { parametros, cliente, posiciones, filas };
  }

  /** `evaluarCola` + `firmaCola` sobre la clase, sin efectos. Lo comparten vista previa y oferta. */
  private async evaluarSiguiente(
    tx: Transaccion,
    claseCola: ClaseCola,
    clienteId: string,
  ): Promise<FilasCola & ReturnType<typeof evaluarCola> & { firma: string }> {
    const cola = await this.filasDeCola(tx, claseCola, clienteId);
    return { ...cola, ...evaluarCola(cola.filas), firma: firmaCola(cola.filas) };
  }

  /**
   * Algoritmo `siguienteElegible(clase, cliente)` (§7.2) como acta de turno (brief §5): devuelve
   * la elegida, las saltadas con su motivo y la firma de la cola. Si el coordinador afirma lo que
   * vio (`esperado`) y ya no coincide, lanza `CANDIDATO_CAMBIO` ANTES de consumir saltos o auditar:
   * el rollback de la transacción deja cero efectos. Una placa penalizada (`penaliza_n`) consume
   * un salto solo cuando el turno se lo lleva otra; si nadie más puede tomarlo, la penalizada lo
   * recibe y consume el salto (`cola.penalizacion_agotada`): la cola nunca se traba sola.
   */
  private async siguienteElegible(
    tx: Transaccion,
    claseCola: ClaseCola,
    clienteId: string,
    actor: Actor,
    esperado?: EsperadoOferta,
  ): Promise<{
    candidato: ContextoElegibilidad;
    descartes: Descarte[];
    firma: string;
    cliente: Cliente | null;
    parametros: Parametros;
  }> {
    const { candidato, descartes, penalizadas, firma, posiciones, cliente, parametros } =
      await this.evaluarSiguiente(tx, claseCola, clienteId);
    if (!candidato) {
      throw new ErrorDominio('COLA_VACIA', `Sin placa elegible en ${claseCola}`, { descartes });
    }
    if (esperado && (esperado.vehiculoId !== candidato.vehiculo.id || esperado.firma !== firma)) {
      throw new ErrorDominio('CANDIDATO_CAMBIO', 'La cola cambió desde la vista previa', {
        esperado: { vehiculoId: esperado.vehiculoId, firma: esperado.firma },
        actual: {
          vehiculoId: candidato.vehiculo.id,
          placa: candidato.vehiculo.placa,
          posicion: candidato.posicion.posicion,
        },
        firma,
      });
    }
    // Una elegible de verdad tiene saltosPendientes = 0 (filtro 7); si el candidato los tiene,
    // es la penalizada que recibe el turno porque nadie más podía.
    const agotada = candidato.posicion.saltosPendientes > 0;
    await this.consumirSaltos(
      tx,
      claseCola,
      posiciones,
      penalizadas,
      actor,
      agotada ? 'cola.penalizacion_agotada' : 'cola.penalizacion_consumida',
    );
    return { candidato, descartes, firma, cliente, parametros };
  }

  private async consumirSaltos(
    tx: Transaccion,
    claseCola: ClaseCola,
    posiciones: ColaPosicion[],
    penalizadas: Candidato[],
    actor: Actor,
    accion: string,
  ): Promise<void> {
    if (penalizadas.length === 0) return;
    let actualizadas = posiciones;
    for (const { posicion } of penalizadas) {
      actualizadas = actualizarPosicion(actualizadas, posicion.vehiculoId, {
        saltosPendientes: Math.max(posicion.saltosPendientes - 1, 0),
      });
    }
    await this.guardarCola(tx, claseCola, actualizadas);
    await tx.auditar({
      actorId: actor.id,
      actorRol: actor.rol,
      accion,
      entidad: 'cola',
      entidadId: claseCola,
      before: penalizadas.map((c) => ({
        vehiculoId: c.vehiculo.id,
        saltos: c.posicion.saltosPendientes,
      })),
      after: penalizadas.map((c) => ({
        vehiculoId: c.vehiculo.id,
        saltos: Math.max(c.posicion.saltosPendientes - 1, 0),
      })),
    });
  }

  /** Cupos libres = cantidad − TR vigentes − ofertas abiertas (§7.3). */
  private async cuposDisponibles(
    tx: Transaccion,
    requerimiento: Requerimiento,
  ): Promise<{ disponibles: number; asignados: number; ofertasAbiertas: number }> {
    const vigentes = await tx.trsVigentesDeRequerimiento(requerimiento.id);
    const abiertas = await tx.ofertasAbiertasDeRequerimiento(requerimiento.id);
    return {
      disponibles: requerimiento.cantidadCupos - vigentes.length - abiertas.length,
      asignados: vigentes.length,
      ofertasAbiertas: abiertas.length,
    };
  }

  private async ofrecerEnTx(
    tx: Transaccion,
    requerimiento: Requerimiento,
    actor: Actor,
    esperado?: EsperadoOferta,
  ): Promise<Oferta> {
    const cupos = await this.cuposDisponibles(tx, requerimiento);
    if (cupos.disponibles <= 0) {
      throw new ErrorDominio('REQUERIMIENTO_SIN_CUPOS', 'El requerimiento no tiene cupos libres', {
        cantidadCupos: requerimiento.cantidadCupos,
        asignados: cupos.asignados,
        ofertasAbiertas: cupos.ofertasAbiertas,
      });
    }
    const { candidato, descartes, firma, cliente, parametros } = await this.siguienteElegible(
      tx,
      requerimiento.claseCola,
      requerimiento.clienteId,
      actor,
      esperado,
    );
    return this.crearOferta(
      tx,
      requerimiento,
      candidato.vehiculo.id,
      candidato.vehiculo.asociadoId,
      actor,
      parametros,
      {
        posicionElegida: candidato.posicion.posicion,
        descartes,
        firma,
        clienteCodigo: cliente?.codigo ?? null,
      },
    );
  }

  /** Acta de una reoferta a la misma placa (política `reofertar`): sin evaluación, sin saltadas. */
  private async actaReoferta(
    tx: Transaccion,
    requerimiento: Requerimiento,
    vehiculoId: string,
  ): Promise<ActaOferta> {
    const { cliente, posiciones, filas } = await this.filasDeCola(
      tx,
      requerimiento.claseCola,
      requerimiento.clienteId,
    );
    return {
      posicionElegida: posiciones.find((p) => p.vehiculoId === vehiculoId)?.posicion ?? null,
      descartes: [],
      firma: firmaCola(filas),
      clienteCodigo: cliente?.codigo ?? null,
    };
  }

  /**
   * Crea la oferta y su acta en la misma transacción (brief §5, spec §7.3): los saltos van a
   * `oferta_saltos`, el audit `oferta.crear` lleva la decisión completa (posición elegida,
   * saltadas, firma y los parámetros que la produjeron) y el aviso al asociado sale por la outbox.
   */
  private async crearOferta(
    tx: Transaccion,
    requerimiento: Requerimiento,
    vehiculoId: string,
    asociadoId: string,
    actor: Actor,
    parametros: Parametros,
    acta: ActaOferta,
  ): Promise<Oferta> {
    const ahora = this.reloj.ahora();
    const oferta: Oferta = {
      id: this.ids.nuevo(),
      requerimientoId: requerimiento.id,
      vehiculoId,
      asociadoId,
      ofrecidaPor: actor.id,
      ofrecidaEn: ahora.toISOString(),
      expiraEn: sumarMinutos(ahora, parametros.oferta_ttl_minutos).toISOString(),
      estado: 'abierta',
      motivoDeclinacionId: null,
      nota: null,
      respondidaEn: null,
      respondidaPor: null,
    };
    await tx.guardarOferta(oferta);
    const posiciones = await tx.posiciones(requerimiento.claseCola);
    const actual = posiciones.find((p) => p.vehiculoId === vehiculoId);
    if (actual) {
      await this.guardarCola(
        tx,
        requerimiento.claseCola,
        actualizarPosicion(posiciones, vehiculoId, { turnosOfrecidos: actual.turnosOfrecidos + 1 }),
      );
    }
    await tx.guardarSaltos(oferta.id, acta.descartes);
    await tx.auditar(
      this.evento(actor, 'oferta.crear', 'ofertas', null, {
        ...oferta,
        claseCola: requerimiento.claseCola,
        clienteId: requerimiento.clienteId,
        posicionElegida: acta.posicionElegida,
        descartes: acta.descartes,
        firma: acta.firma,
        // Reglas como datos (RULE-012): el acta dice con qué parámetros se decidió.
        parametrosAplicados: {
          declinacion_politica: parametros.declinacion_politica,
          bloquear_por_documento_vencido: parametros.bloquear_por_documento_vencido,
          un_tr_activo_por_placa: parametros.un_tr_activo_por_placa,
          oferta_ttl_minutos: parametros.oferta_ttl_minutos,
        },
      }),
    );
    // Aviso al asociado en la misma transacción (outbox, spec §11): sin oferta no hay aviso.
    // `posicionElegida`, `saltadas` y `clienteCodigo` alimentan el "Te tocó porque" de la plantilla.
    await tx.notificar({
      evento: 'oferta.abierta',
      destinos: [{ asociadoId: oferta.asociadoId, vehiculoId: oferta.vehiculoId }],
      datos: {
        ofertaId: oferta.id,
        vehiculoId: oferta.vehiculoId,
        requerimientoId: requerimiento.id,
        clienteId: requerimiento.clienteId,
        clienteCodigo: acta.clienteCodigo,
        claseCola: requerimiento.claseCola,
        expiraEn: oferta.expiraEn,
        posicionElegida: acta.posicionElegida,
        saltadas: acta.descartes.length,
      },
    });
    return oferta;
  }

  /** Reoferta al siguiente sin abortar la transacción si la cola queda vacía. */
  private async intentarOfrecer(
    tx: Transaccion,
    requerimiento: Requerimiento,
    actor: Actor,
  ): Promise<Oferta | null> {
    try {
      return await this.ofrecerEnTx(tx, requerimiento, actor);
    } catch (error) {
      if (
        error instanceof ErrorDominio &&
        (error.code === 'COLA_VACIA' || error.code === 'REQUERIMIENTO_SIN_CUPOS')
      ) {
        await tx.auditar({
          actorId: actor.id,
          actorRol: actor.rol,
          accion: `cola.${error.code.toLowerCase()}`,
          entidad: 'requerimientos',
          entidadId: requerimiento.id,
          before: null,
          after: error.details,
        });
        return null;
      }
      throw error;
    }
  }

  private async aplicarPoliticaDeclinacion(
    tx: Transaccion,
    claseCola: ClaseCola,
    vehiculoId: string,
    parametros: Parametros,
    ahora: Date,
    actor: Actor,
  ): Promise<void> {
    const antes = await tx.posiciones(claseCola);
    let despues = rotarAlFinal(antes, vehiculoId);
    if (parametros.declinacion_politica === 'penaliza_n') {
      despues = actualizarPosicion(despues, vehiculoId, {
        saltosPendientes: parametros.declinacion_n,
      });
    }
    if (parametros.declinacion_politica === 'bloqueo_horas') {
      const vehiculo = await tx.vehiculo(vehiculoId);
      if (vehiculo) {
        await tx.guardarVehiculo({
          ...vehiculo,
          noElegibleHasta: sumarHoras(ahora, parametros.declinacion_bloqueo_horas).toISOString(),
        });
      }
    }
    await this.guardarCola(tx, claseCola, despues);
    await tx.auditar(
      this.evento(
        actor,
        `cola.rotar.${parametros.declinacion_politica}`,
        'cola',
        this.resumenCola(antes),
        this.resumenCola(despues),
      ),
    );
  }

  private async cerrarSiCompleto(
    tx: Transaccion,
    requerimiento: Requerimiento,
    actor: Actor,
  ): Promise<void> {
    const vigentes = await tx.trsVigentesDeRequerimiento(requerimiento.id);
    if (vigentes.length >= requerimiento.cantidadCupos && requerimiento.estado === 'abierto') {
      const cerrado: Requerimiento = { ...requerimiento, estado: 'cerrado' };
      await tx.guardarRequerimiento(cerrado);
      await tx.auditar(
        this.evento(actor, 'requerimiento.cerrar', 'requerimientos', requerimiento, cerrado),
      );
    }
  }

  private async guardarCola(
    tx: Transaccion,
    claseCola: ClaseCola,
    posiciones: ColaPosicion[],
  ): Promise<void> {
    verificarInvariantesCola(posiciones, claseCola);
    await tx.guardarPosiciones(claseCola, posiciones);
  }

  private async requerimientoAbierto(tx: Transaccion, id: string): Promise<Requerimiento> {
    const requerimiento = await tx.requerimiento(id);
    if (!requerimiento) throw new ErrorDominio('NOT_FOUND', 'Requerimiento no existe');
    if (requerimiento.estado !== 'abierto') {
      throw new ErrorDominio('REQUERIMIENTO_CERRADO', `Requerimiento ${requerimiento.estado}`);
    }
    return requerimiento;
  }

  private async ofertaAbiertaVigente(tx: Transaccion, id: string, ahora: Date): Promise<Oferta> {
    const oferta = await tx.oferta(id);
    if (!oferta) throw new ErrorDominio('NOT_FOUND', 'Oferta no existe');
    if (oferta.estado !== 'abierta') {
      throw new ErrorDominio('OFERTA_NO_ABIERTA', `Oferta en estado ${oferta.estado}`);
    }
    if (new Date(oferta.expiraEn) <= ahora) {
      await tx.guardarOferta({ ...oferta, estado: 'expirada', respondidaEn: ahora.toISOString() });
      throw new ErrorDominio('OFERTA_EXPIRADA', 'La oferta expiró', { expiraEn: oferta.expiraEn });
    }
    return oferta;
  }

  private exigirScopePropio(actor: Actor, vehiculoId: string): void {
    if (actor.rol === 'member' && !(actor.vehiculoIds ?? []).includes(vehiculoId)) {
      throw new ErrorDominio('FORBIDDEN_OWN_SCOPE', 'La oferta no pertenece a tus placas');
    }
  }

  private async claseColaDeRequerimiento(id: string): Promise<ClaseCola> {
    const requerimiento = await this.uow.leer((tx) => tx.requerimiento(id));
    if (!requerimiento) throw new ErrorDominio('NOT_FOUND', 'Requerimiento no existe');
    return requerimiento.claseCola;
  }

  private async claseColaDeOferta(id: string): Promise<ClaseCola> {
    return this.uow.leer(async (tx) => {
      const oferta = await tx.oferta(id);
      if (!oferta) throw new ErrorDominio('NOT_FOUND', 'Oferta no existe');
      const requerimiento = await tx.requerimiento(oferta.requerimientoId);
      if (!requerimiento) throw new ErrorDominio('NOT_FOUND', 'Requerimiento no existe');
      return requerimiento.claseCola;
    });
  }

  private async claseColaDeTr(id: string): Promise<ClaseCola> {
    const tr = await this.uow.leer((tx) => tx.tr(id));
    if (!tr) throw new ErrorDominio('NOT_FOUND', 'TR no existe');
    return tr.claseCola;
  }

  private resumenCola(posiciones: ColaPosicion[]): Array<{ posicion: number; vehiculoId: string }> {
    return [...posiciones]
      .sort((a, b) => a.posicion - b.posicion)
      .map((p) => ({ posicion: p.posicion, vehiculoId: p.vehiculoId }));
  }

  private evento(actor: Actor, accion: string, entidad: string, before: unknown, after: unknown) {
    const conId = (after ?? before) as { id?: string } | null;
    return {
      actorId: actor.id,
      actorRol: actor.rol,
      accion,
      entidad,
      entidadId: conId?.id ?? entidad,
      before,
      after,
    };
  }
}
