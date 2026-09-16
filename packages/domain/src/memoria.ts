import {
  ESTADOS_TR_ACTIVOS,
  ESTADOS_TR_VIGENTES,
  type ClaseCola,
  type Parametros,
} from '@asotracmet/shared';
import { ErrorDominio } from './errores.js';
import type { GeneradorIds, Reloj, Transaccion, UnidadDeTrabajo } from './puertos.js';
import type {
  Asociado,
  Cliente,
  ColaPosicion,
  Destino,
  Documento,
  EventoAuditoria,
  Habilitacion,
  MotivoDeclinacion,
  NuevoEventoAuditoria,
  Oferta,
  Requerimiento,
  Tr,
  Vehiculo,
} from './tipos.js';

// Adaptador en memoria del puerto UnidadDeTrabajo. Sirve para tests, e2e y la fase puente.
// Semántica transaccional: lock por clase de cola (sin espera) + rollback por snapshot.

export interface EstadoMemoria {
  parametros: Parametros;
  clientes: Cliente[];
  destinos: Destino[];
  asociados: Asociado[];
  vehiculos: Vehiculo[];
  habilitaciones: Habilitacion[];
  documentos: Documento[];
  motivosDeclinacion: MotivoDeclinacion[];
  posiciones: ColaPosicion[];
  requerimientos: Requerimiento[];
  ofertas: Oferta[];
  trs: Tr[];
  auditoria: EventoAuditoria[];
}

export function estadoVacio(parametros: Parametros): EstadoMemoria {
  return {
    parametros,
    clientes: [],
    destinos: [],
    asociados: [],
    vehiculos: [],
    habilitaciones: [],
    documentos: [],
    motivosDeclinacion: [],
    posiciones: [],
    requerimientos: [],
    ofertas: [],
    trs: [],
    auditoria: [],
  };
}

export class AlmacenMemoria implements UnidadDeTrabajo {
  private _estado: EstadoMemoria;
  private readonly locks = new Set<ClaseCola>();
  private readonly reloj: Reloj;
  private readonly ids: GeneradorIds;

  constructor(estado: EstadoMemoria, deps: { reloj: Reloj; ids: GeneradorIds }) {
    this._estado = estado;
    this.reloj = deps.reloj;
    this.ids = deps.ids;
  }

  get estado(): EstadoMemoria {
    return this._estado;
  }

  /** Reemplaza todo el estado (reset de e2e / seed). */
  reemplazar(estado: EstadoMemoria): void {
    this._estado = estado;
  }

  lockTomado(claseCola: ClaseCola): boolean {
    return this.locks.has(claseCola);
  }

  async ejecutar<T>(claseCola: ClaseCola | null, fn: (tx: Transaccion) => Promise<T>): Promise<T> {
    // La comprobación del lock es síncrona: dos llamadas concurrentes no pueden entrar a la vez.
    if (claseCola && this.locks.has(claseCola)) {
      throw new ErrorDominio('COLA_LOCKED', `Cola ${claseCola} bloqueada por otra operación`, {
        claseCola,
      });
    }
    if (claseCola) this.locks.add(claseCola);
    const snapshot = structuredClone(this._estado);
    try {
      return await fn(new TransaccionMemoria(this, this.reloj, this.ids));
    } catch (error) {
      this._estado = snapshot;
      throw error;
    } finally {
      if (claseCola) this.locks.delete(claseCola);
    }
  }

  async leer<T>(fn: (tx: Transaccion) => Promise<T>): Promise<T> {
    return fn(new TransaccionMemoria(this, this.reloj, this.ids));
  }
}

class TransaccionMemoria implements Transaccion {
  constructor(
    private readonly almacen: AlmacenMemoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorIds,
  ) {}

  private get s(): EstadoMemoria {
    return this.almacen.estado;
  }

  async parametros(): Promise<Parametros> {
    return this.s.parametros;
  }

  async guardarParametros(parametros: Parametros): Promise<void> {
    this.s.parametros = parametros;
  }

  async cliente(id: string): Promise<Cliente | undefined> {
    return this.s.clientes.find((c) => c.id === id);
  }

  async asociado(id: string): Promise<Asociado | undefined> {
    return this.s.asociados.find((a) => a.id === id);
  }

  async motivoDeclinacion(id: string): Promise<MotivoDeclinacion | undefined> {
    return this.s.motivosDeclinacion.find((m) => m.id === id);
  }

  async vehiculo(id: string): Promise<Vehiculo | undefined> {
    return this.s.vehiculos.find((v) => v.id === id);
  }

  async guardarVehiculo(vehiculo: Vehiculo): Promise<void> {
    reemplazarPorId(this.s.vehiculos, vehiculo);
  }

  async habilitacion(vehiculoId: string, clienteId: string): Promise<Habilitacion | undefined> {
    return this.s.habilitaciones.find(
      (h) => h.vehiculoId === vehiculoId && h.clienteId === clienteId,
    );
  }

  async documentosBloqueantesVencidos(vehiculoId: string, hoy: string): Promise<Documento[]> {
    return this.s.documentos.filter(
      (d) =>
        d.sujetoTipo === 'vehiculo' && d.sujetoId === vehiculoId && d.bloqueante && d.venceEn < hoy,
    );
  }

  async posiciones(claseCola: ClaseCola): Promise<ColaPosicion[]> {
    return this.s.posiciones
      .filter((p) => p.claseCola === claseCola)
      .sort((a, b) => a.posicion - b.posicion)
      .map((p) => ({ ...p }));
  }

  async guardarPosiciones(claseCola: ClaseCola, posiciones: ColaPosicion[]): Promise<void> {
    this.s.posiciones = [
      ...this.s.posiciones.filter((p) => p.claseCola !== claseCola),
      ...posiciones.map((p) => ({ ...p })),
    ];
  }

  async requerimiento(id: string): Promise<Requerimiento | undefined> {
    return this.s.requerimientos.find((r) => r.id === id);
  }

  async guardarRequerimiento(requerimiento: Requerimiento): Promise<void> {
    reemplazarPorId(this.s.requerimientos, requerimiento);
  }

  async oferta(id: string): Promise<Oferta | undefined> {
    return this.s.ofertas.find((o) => o.id === id);
  }

  async guardarOferta(oferta: Oferta): Promise<void> {
    reemplazarPorId(this.s.ofertas, oferta);
  }

  async ofertasAbiertasDeVehiculo(vehiculoId: string): Promise<Oferta[]> {
    return this.s.ofertas.filter((o) => o.vehiculoId === vehiculoId && o.estado === 'abierta');
  }

  async ofertasAbiertasDeRequerimiento(requerimientoId: string): Promise<Oferta[]> {
    return this.s.ofertas.filter(
      (o) => o.requerimientoId === requerimientoId && o.estado === 'abierta',
    );
  }

  async ofertasAbiertasVencidas(ahora: string): Promise<Oferta[]> {
    return this.s.ofertas.filter((o) => o.estado === 'abierta' && o.expiraEn <= ahora);
  }

  async tr(id: string): Promise<Tr | undefined> {
    return this.s.trs.find((t) => t.id === id);
  }

  async guardarTr(tr: Tr): Promise<void> {
    const duplicado = this.s.trs.find((t) => t.codigo === tr.codigo && t.id !== tr.id);
    if (duplicado) {
      throw new ErrorDominio('TR_DUPLICADO', `El código ${tr.codigo} ya existe`, {
        codigo: tr.codigo,
      });
    }
    reemplazarPorId(this.s.trs, tr);
  }

  async trsActivosDeVehiculo(vehiculoId: string): Promise<Tr[]> {
    return this.s.trs.filter(
      (t) => t.vehiculoId === vehiculoId && ESTADOS_TR_ACTIVOS.includes(t.estado),
    );
  }

  async trsVigentesDeRequerimiento(requerimientoId: string): Promise<Tr[]> {
    return this.s.trs.filter(
      (t) => t.requerimientoId === requerimientoId && ESTADOS_TR_VIGENTES.includes(t.estado),
    );
  }

  async siguienteCodigoTr(): Promise<string> {
    const { prefix, next } = this.s.parametros.secuencia_tr;
    const codigo = `${prefix}${next}`;
    if (this.s.trs.some((t) => t.codigo === codigo)) {
      throw new ErrorDominio('TR_DUPLICADO', `Secuencia TR desfasada: ${codigo} ya existe`, {
        codigo,
      });
    }
    this.s.parametros = { ...this.s.parametros, secuencia_tr: { prefix, next: next + 1 } };
    return codigo;
  }

  async auditar(evento: NuevoEventoAuditoria): Promise<void> {
    this.s.auditoria.push({
      id: this.ids.nuevo(),
      at: this.reloj.ahora().toISOString(),
      ...evento,
    });
  }
}

function reemplazarPorId<T extends { id: string }>(lista: T[], item: T): void {
  const indice = lista.findIndex((x) => x.id === item.id);
  if (indice === -1) lista.push({ ...item });
  else lista[indice] = { ...item };
}

/** Reloj controlable para tests y e2e. */
export class RelojFijo implements Reloj {
  private instante: Date;

  constructor(inicio: Date | string = '2026-09-16T13:00:00Z') {
    this.instante = new Date(inicio);
  }

  ahora(): Date {
    return new Date(this.instante);
  }

  avanzarMinutos(minutos: number): void {
    this.instante = new Date(this.instante.getTime() + minutos * 60_000);
  }

  fijar(instante: Date | string): void {
    this.instante = new Date(instante);
  }
}

export class RelojSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}

/** Generador determinista para tests (`id-1`, `id-2`, ...). */
export class IdsSecuenciales implements GeneradorIds {
  private contador = 0;

  constructor(private readonly prefijo = 'id') {}

  nuevo(): string {
    this.contador += 1;
    return `${this.prefijo}-${this.contador}`;
  }
}
