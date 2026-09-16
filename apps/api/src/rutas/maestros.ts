import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ErrorDominio,
  type Actor,
  type GeneradorIds,
  type MotorCola,
  type Reloj,
  type UnidadDeTrabajo,
} from '@asotracmet/domain';
import {
  ActualizarAsociadoSchema,
  ActualizarClienteSchema,
  ActualizarConductorSchema,
  ActualizarDestinoSchema,
  ActualizarDocumentoSchema,
  ActualizarTarifaSchema,
  ActualizarTransportadoraSchema,
  ActualizarVehiculoSchema,
  AsignarConductoresSchema,
  CrearAsociadoSchema,
  CrearClienteSchema,
  CrearConductorSchema,
  CrearDestinoSchema,
  CrearDocumentoSchema,
  CrearTarifaSchema,
  CrearTransportadoraSchema,
  CrearVehiculoSchema,
  FiltroDocumentosSchema,
  FiltroMaestrosSchema,
  FiltroTarifasSchema,
  GuardarHabilitacionSchema,
  claseColaDe,
  fechaLocal,
  veEnmascarado,
  type Recurso,
} from '@asotracmet/shared';
import { cifrar } from '../auth/cifrado.js';
import { actorDe, exigir } from '../auth/plugin.js';
import type { Consultas } from '../consultas/tipos.js';
import type {
  AsociadoRegistro,
  ConductorRegistro,
  DocumentoRegistro,
  RepositorioMaestros,
  VehiculoRegistro,
} from '../maestros/tipos.js';
import {
  semaforoDe,
  vistaAsociado,
  vistaConductor,
  vistaDocumento,
  vistaHabilitacion,
  vistaVehiculo,
} from '../maestros/vistas.js';

export interface DepsMaestros {
  maestros: RepositorioMaestros;
  motor: MotorCola;
  uow: UnidadDeTrabajo;
  consultas: Consultas;
  reloj: Reloj;
  ids: GeneradorIds;
  claveCifrado: Buffer;
}

const IdParam = z.object({ id: z.string().min(1) });
const HabilitacionParams = z.object({ id: z.string().min(1), clienteId: z.string().min(1) });

/**
 * Maestros (spec §6.2-6.4, §8.3). Soft delete siempre. Las escrituras de vehículos pasan por el motor
 * para que la cola de cada clase siga siendo "los vehículos activos de la clase" (§7.1.2, §13.3).
 */
export function rutasMaestros(app: FastifyInstance, deps: DepsMaestros): void {
  const { maestros, motor, uow, consultas, reloj, ids } = deps;

  const auditar = (
    actor: Actor,
    accion: string,
    entidad: string,
    entidadId: string,
    before: unknown,
    after: unknown,
  ) =>
    uow.ejecutar(null, (tx) =>
      tx.auditar({
        actorId: actor.id,
        actorRol: actor.rol,
        accion,
        entidad,
        entidadId,
        before,
        after,
      }),
    );

  async function hoy(): Promise<string> {
    const { timezone } = await consultas.parametros();
    return fechaLocal(reloj.ahora(), timezone);
  }

  const ahora = () => reloj.ahora().toISOString();
  const enmascara = (actor: Actor, recurso: Recurso) => veEnmascarado(actor.rol, recurso);
  const esMember = (actor: Actor) => actor.rol === 'member';
  const placasPropias = (actor: Actor) => new Set(actor.vehiculoIds ?? []);

  function exigirPropio(actor: Actor, vehiculoId: string): void {
    if (esMember(actor) && !placasPropias(actor).has(vehiculoId)) {
      throw new ErrorDominio('FORBIDDEN_OWN_SCOPE', 'La placa no es tuya');
    }
  }

  async function asociadoOr404(id: string): Promise<AsociadoRegistro> {
    const a = await maestros.asociado(id);
    if (!a) throw new ErrorDominio('NOT_FOUND', 'Asociado no existe');
    return a;
  }

  async function vehiculoOr404(id: string): Promise<VehiculoRegistro> {
    const v = await maestros.vehiculo(id);
    if (!v) throw new ErrorDominio('NOT_FOUND', 'Vehículo no existe');
    return v;
  }

  async function conductorOr404(id: string): Promise<ConductorRegistro> {
    const c = await maestros.conductor(id);
    if (!c) throw new ErrorDominio('NOT_FOUND', 'Conductor no existe');
    return c;
  }

  async function documentoOr404(id: string): Promise<DocumentoRegistro> {
    const d = await maestros.documento(id);
    if (!d) throw new ErrorDominio('NOT_FOUND', 'Documento no existe');
    return d;
  }

  /** Cambios de estado o clase mueven la placa entre colas con motivo auditado. */
  async function sincronizarCola(vehiculo: VehiculoRegistro, motivo: string, actor: Actor) {
    return motor.sincronizarVehiculoEnCola({ vehiculoId: vehiculo.id, motivo, actor });
  }

  // =============================================================================================
  // Asociados
  // =============================================================================================
  app.get(
    '/api/v1/asociados',
    { preHandler: exigir('asociados', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      const { incluirEliminados } = FiltroMaestrosSchema.parse(req.query);
      const lista = await maestros.asociados({ incluirEliminados });
      const propio = esMember(actor) ? req.usuario?.asociadoId : null;
      return reply.send(
        lista
          .filter((a) => !esMember(actor) || a.id === propio)
          .map((a) => vistaAsociado(a, enmascara(actor, 'asociados'))),
      );
    },
  );

  app.get(
    '/api/v1/asociados/:id',
    { preHandler: exigir('asociados', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      if (esMember(actor) && req.usuario?.asociadoId !== id) {
        throw new ErrorDominio('FORBIDDEN_OWN_SCOPE', 'Solo puedes ver tu propia ficha');
      }
      return reply.send(vistaAsociado(await asociadoOr404(id), enmascara(actor, 'asociados')));
    },
  );

  app.post('/api/v1/asociados', { preHandler: exigir('asociados', 'C') }, async (req, reply) => {
    const entrada = CrearAsociadoSchema.parse(req.body);
    const actor = actorDe(req);
    if (await maestros.asociadoPorDocumento(entrada.documento)) {
      throw new ErrorDominio('DOCUMENTO_EN_USO', 'Ya existe un asociado con ese documento');
    }
    const nuevo: AsociadoRegistro = {
      id: ids.nuevo(),
      tipo: entrada.tipo,
      nombres: entrada.nombres ?? null,
      apellidos: entrada.apellidos ?? null,
      razonSocial: entrada.razonSocial ?? null,
      documento: entrada.documento,
      documentoTipo: entrada.documentoTipo ?? (entrada.tipo === 'empresa' ? 'NIT' : 'CC'),
      celular: entrada.celular ?? null,
      correo: entrada.correo ?? null,
      direccion: entrada.direccion ?? null,
      cuentaBancariaEnc: entrada.cuentaBancaria
        ? cifrar(entrada.cuentaBancaria, deps.claveCifrado)
        : null,
      estado: 'activo',
      fechaAfiliacion: entrada.fechaAfiliacion ?? null,
      creadoEn: ahora(),
      actualizadoEn: ahora(),
      eliminadoEn: null,
    };
    await maestros.guardarAsociado(nuevo);
    await auditar(
      actor,
      'asociado.crear',
      'asociados',
      nuevo.id,
      null,
      vistaAsociado(nuevo, false),
    );
    return reply.status(201).send(vistaAsociado(nuevo, false));
  });

  app.patch(
    '/api/v1/asociados/:id',
    { preHandler: exigir('asociados', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const cambios = ActualizarAsociadoSchema.parse(req.body);
      const actor = actorDe(req);
      const actual = await asociadoOr404(id);
      if (cambios.documento && cambios.documento !== actual.documento) {
        const otro = await maestros.asociadoPorDocumento(cambios.documento);
        if (otro && otro.id !== id) {
          throw new ErrorDominio('DOCUMENTO_EN_USO', 'Ya existe un asociado con ese documento');
        }
      }
      const { cuentaBancaria, ...resto } = cambios;
      const actualizado: AsociadoRegistro = {
        ...actual,
        ...Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)),
        cuentaBancariaEnc: cuentaBancaria
          ? cifrar(cuentaBancaria, deps.claveCifrado)
          : actual.cuentaBancariaEnc,
        actualizadoEn: ahora(),
      };
      await maestros.guardarAsociado(actualizado);
      await auditar(
        actor,
        'asociado.actualizar',
        'asociados',
        id,
        vistaAsociado(actual, false),
        vistaAsociado(actualizado, false),
      );
      return reply.send(vistaAsociado(actualizado, false));
    },
  );

  app.delete(
    '/api/v1/asociados/:id',
    { preHandler: exigir('asociados', 'D') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      const actual = await asociadoOr404(id);
      const retirado: AsociadoRegistro = {
        ...actual,
        estado: 'retirado',
        eliminadoEn: ahora(),
        actualizadoEn: ahora(),
      };
      await maestros.guardarAsociado(retirado);
      await auditar(
        actor,
        'asociado.retirar',
        'asociados',
        id,
        vistaAsociado(actual, false),
        vistaAsociado(retirado, false),
      );
      return reply.send(vistaAsociado(retirado, false));
    },
  );

  // =============================================================================================
  // Vehículos: alta, ficha, cambios de estado/clase (con la cola), baja lógica
  // =============================================================================================
  app.post('/api/v1/vehiculos', { preHandler: exigir('vehiculos', 'C') }, async (req, reply) => {
    const entrada = CrearVehiculoSchema.parse(req.body);
    const actor = actorDe(req);
    if (await maestros.vehiculoPorPlaca(entrada.placa)) {
      throw new ErrorDominio('PLACA_EN_USO', `Ya existe la placa ${entrada.placa}`);
    }
    await asociadoOr404(entrada.asociadoId);
    const { placa, clase, ...ficha } = entrada;
    const nuevo: VehiculoRegistro = {
      id: ids.nuevo(),
      placa,
      clase,
      claseCola: claseColaDe(clase),
      tipoCarroceria: ficha.tipoCarroceria ?? null,
      modelo: ficha.modelo ?? null,
      repotenciacion: ficha.repotenciacion ?? null,
      largoMts: ficha.largoMts ?? null,
      kmRecorrido: ficha.kmRecorrido ?? null,
      asociadoId: ficha.asociadoId,
      propietarioNombre: ficha.propietarioNombre ?? null,
      propietarioDocumento: ficha.propietarioDocumento ?? null,
      parentesco: ficha.parentesco ?? null,
      trailerPlaca: ficha.trailerPlaca ?? null,
      gpsProveedor: ficha.gpsProveedor ?? null,
      estado: 'activo',
      noElegibleHasta: null,
      creadoEn: ahora(),
      actualizadoEn: ahora(),
      eliminadoEn: null,
    };
    await maestros.guardarVehiculo(nuevo);
    const cola = await sincronizarCola(nuevo, `alta de la placa ${nuevo.placa}`, actor);
    await auditar(
      actor,
      'vehiculo.crear',
      'vehiculos',
      nuevo.id,
      null,
      vistaVehiculo(nuevo, false),
    );
    return reply.status(201).send({ ...vistaVehiculo(nuevo, false), cola });
  });

  app.patch(
    '/api/v1/vehiculos/:id',
    { preHandler: exigir('vehiculos', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const cambios = ActualizarVehiculoSchema.parse(req.body);
      const actor = actorDe(req);
      const actual = await vehiculoOr404(id);
      if (cambios.asociadoId) await asociadoOr404(cambios.asociadoId);
      const { motivo, clase, estado, ...ficha } = cambios;
      const actualizado: VehiculoRegistro = {
        ...actual,
        ...Object.fromEntries(Object.entries(ficha).filter(([, v]) => v !== undefined)),
        clase: clase ?? actual.clase,
        claseCola: clase ? claseColaDe(clase) : actual.claseCola,
        estado: estado ?? actual.estado,
        actualizadoEn: ahora(),
      };
      await maestros.guardarVehiculo(actualizado);
      const cambiaCola =
        actualizado.estado !== actual.estado || actualizado.claseCola !== actual.claseCola;
      const cola = cambiaCola
        ? await sincronizarCola(actualizado, motivo ?? 'actualización de la placa', actor)
        : [];
      await auditar(actor, 'vehiculo.actualizar', 'vehiculos', id, vistaVehiculo(actual, false), {
        ...vistaVehiculo(actualizado, false),
        motivo: motivo ?? null,
      });
      return reply.send({ ...vistaVehiculo(actualizado, false), cola });
    },
  );

  // Baja lógica (spec §3.3): nunca DELETE físico; la placa sale de la cola y conserva su historia.
  app.delete(
    '/api/v1/vehiculos/:id',
    { preHandler: exigir('vehiculos', 'D') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      const actual = await vehiculoOr404(id);
      if (actual.eliminadoEn) return reply.send({ ...vistaVehiculo(actual, false), cola: [] });
      const inactivo: VehiculoRegistro = { ...actual, estado: 'inactivo', actualizadoEn: ahora() };
      await maestros.guardarVehiculo(inactivo);
      const cola = await sincronizarCola(inactivo, `baja de la placa ${actual.placa}`, actor);
      const eliminado: VehiculoRegistro = { ...inactivo, eliminadoEn: ahora() };
      await maestros.guardarVehiculo(eliminado);
      await auditar(actor, 'vehiculo.baja', 'vehiculos', id, vistaVehiculo(actual, false), {
        ...vistaVehiculo(eliminado, false),
        conHistoria: await maestros.vehiculoTieneTrs(id),
      });
      return reply.send({ ...vistaVehiculo(eliminado, false), cola });
    },
  );

  app.get(
    '/api/v1/vehiculos/semaforo',
    { preHandler: exigir('vehiculos', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      const fecha = await hoy();
      const tipos = new Map((await maestros.tiposDocumento()).map((t) => [t.id, t]));
      const documentos = await maestros.documentos({ sujetoTipo: 'vehiculo' });
      const asociados = new Map(
        (await maestros.asociados({ incluirEliminados: true })).map((a) => [a.id, a]),
      );
      const vehiculos = (await maestros.vehiculos()).filter(
        (v) => !esMember(actor) || placasPropias(actor).has(v.id),
      );
      return reply.send(
        vehiculos.map((v) => {
          const propios = documentos
            .filter((d) => d.sujetoId === v.id)
            .map((d) => vistaDocumento(d, tipos.get(d.tipoId), fecha, false));
          return {
            id: v.id,
            placa: v.placa,
            clase: v.clase,
            claseCola: v.claseCola,
            estado: v.estado,
            asociadoNombre: asociados.get(v.asociadoId)
              ? vistaAsociado(asociados.get(v.asociadoId)!, true).nombre
              : null,
            semaforo: semaforoDe(propios),
            vencidos: propios.filter((d) => d.estado === 'vencido').length,
            porVencer: propios.filter((d) => d.estado === 'por_vencer').length,
          };
        }),
      );
    },
  );

  app.get(
    '/api/v1/vehiculos/:id/ficha',
    { preHandler: exigir('vehiculos', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      exigirPropio(actor, id);
      const vehiculo = await vehiculoOr404(id);
      const fecha = await hoy();
      const tipos = new Map((await maestros.tiposDocumento()).map((t) => [t.id, t]));
      const clientes = new Map((await maestros.clientes()).map((c) => [c.id, c]));
      const documentos = (await maestros.documentos({ sujetoTipo: 'vehiculo', sujetoId: id })).map(
        (d) => vistaDocumento(d, tipos.get(d.tipoId), fecha, enmascara(actor, 'documentos')),
      );
      const asociado = await maestros.asociado(vehiculo.asociadoId);
      const [enCola] = await consultas.posicionesDeVehiculos([id]);
      return reply.send({
        vehiculo: vistaVehiculo(vehiculo, enmascara(actor, 'vehiculos')),
        asociado: asociado ? vistaAsociado(asociado, enmascara(actor, 'asociados')) : null,
        conductores: (await maestros.conductoresDe(id)).map((vc) => ({
          ...vistaConductor(vc.conductor, enmascara(actor, 'conductores')),
          esPrincipal: vc.esPrincipal,
        })),
        documentos,
        habilitaciones: (await maestros.habilitacionesDe(id)).map((h) =>
          vistaHabilitacion(h, clientes.get(h.clienteId)),
        ),
        semaforo: semaforoDe(documentos),
        enCola: enCola ?? null,
      });
    },
  );

  // Habilitación por cliente (spec §6.3): reemplaza las X / NA / NO del TURNERO.
  app.put(
    '/api/v1/vehiculos/:id/habilitaciones/:clienteId',
    { preHandler: exigir('habilitaciones', 'U') },
    async (req, reply) => {
      const { id, clienteId } = HabilitacionParams.parse(req.params);
      const entrada = GuardarHabilitacionSchema.parse(req.body);
      const actor = actorDe(req);
      await vehiculoOr404(id);
      const cliente = (await maestros.clientes()).find((c) => c.id === clienteId);
      if (!cliente) throw new ErrorDominio('NOT_FOUND', 'Cliente no existe');
      const previa = (await maestros.habilitacionesDe(id)).find((h) => h.clienteId === clienteId);
      const nueva = {
        id: previa?.id ?? ids.nuevo(),
        vehiculoId: id,
        clienteId,
        apto: entrada.apto,
        motivoBloqueo: entrada.apto ? null : (entrada.motivoBloqueo ?? null),
        requisitos: entrada.requisitos ?? previa?.requisitos ?? null,
        actualizadoEn: ahora(),
      };
      await maestros.guardarHabilitacion(nueva);
      await auditar(
        actor,
        'habilitacion.guardar',
        'habilitaciones',
        nueva.id,
        previa ?? null,
        nueva,
      );
      return reply.send(vistaHabilitacion(nueva, cliente));
    },
  );

  app.put(
    '/api/v1/vehiculos/:id/conductores',
    { preHandler: exigir('conductores', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { conductores } = AsignarConductoresSchema.parse(req.body);
      const actor = actorDe(req);
      await vehiculoOr404(id);
      for (const c of conductores) await conductorOr404(c.conductorId);
      const antes = (await maestros.conductoresDe(id)).map((vc) => ({
        conductorId: vc.conductorId,
        esPrincipal: vc.esPrincipal,
      }));
      await maestros.asignarConductores(
        id,
        conductores.map((c) => ({
          vehiculoId: id,
          conductorId: c.conductorId,
          esPrincipal: c.esPrincipal,
        })),
      );
      await auditar(
        actor,
        'vehiculo.conductores',
        'vehiculos',
        id,
        { conductores: antes },
        { conductores },
      );
      return reply.send(
        (await maestros.conductoresDe(id)).map((vc) => ({
          ...vistaConductor(vc.conductor, false),
          esPrincipal: vc.esPrincipal,
        })),
      );
    },
  );

  // =============================================================================================
  // Conductores
  // =============================================================================================
  app.get(
    '/api/v1/conductores',
    { preHandler: exigir('conductores', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      const { incluirEliminados } = FiltroMaestrosSchema.parse(req.query);
      if (esMember(actor)) {
        const vistos = new Map<string, ConductorRegistro>();
        for (const vehiculoId of placasPropias(actor)) {
          for (const vc of await maestros.conductoresDe(vehiculoId))
            vistos.set(vc.conductorId, vc.conductor);
        }
        return reply.send([...vistos.values()].map((c) => vistaConductor(c, false)));
      }
      const lista = await maestros.conductores({ incluirEliminados });
      return reply.send(lista.map((c) => vistaConductor(c, enmascara(actor, 'conductores'))));
    },
  );

  app.get(
    '/api/v1/conductores/:id',
    { preHandler: exigir('conductores', 'R') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      return reply.send(vistaConductor(await conductorOr404(id), enmascara(actor, 'conductores')));
    },
  );

  app.post(
    '/api/v1/conductores',
    { preHandler: exigir('conductores', 'C') },
    async (req, reply) => {
      const entrada = CrearConductorSchema.parse(req.body);
      const actor = actorDe(req);
      if (await maestros.conductorPorDocumento(entrada.documento)) {
        throw new ErrorDominio('DOCUMENTO_EN_USO', 'Ya existe un conductor con ese documento');
      }
      if (entrada.asociadoId) await asociadoOr404(entrada.asociadoId);
      const nuevo: ConductorRegistro = {
        id: ids.nuevo(),
        nombres: entrada.nombres,
        documento: entrada.documento,
        celular: entrada.celular ?? null,
        correo: entrada.correo ?? null,
        asociadoId: entrada.asociadoId ?? null,
        licenciaCategoria: entrada.licenciaCategoria ?? null,
        licenciaVence: entrada.licenciaVence ?? null,
        creadoEn: ahora(),
        actualizadoEn: ahora(),
        eliminadoEn: null,
      };
      await maestros.guardarConductor(nuevo);
      await auditar(
        actor,
        'conductor.crear',
        'conductores',
        nuevo.id,
        null,
        vistaConductor(nuevo, false),
      );
      return reply.status(201).send(vistaConductor(nuevo, false));
    },
  );

  app.patch(
    '/api/v1/conductores/:id',
    { preHandler: exigir('conductores', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const cambios = ActualizarConductorSchema.parse(req.body);
      const actor = actorDe(req);
      const actual = await conductorOr404(id);
      if (cambios.documento && cambios.documento !== actual.documento) {
        const otro = await maestros.conductorPorDocumento(cambios.documento);
        if (otro && otro.id !== id) {
          throw new ErrorDominio('DOCUMENTO_EN_USO', 'Ya existe un conductor con ese documento');
        }
      }
      if (cambios.asociadoId) await asociadoOr404(cambios.asociadoId);
      const actualizado: ConductorRegistro = {
        ...actual,
        ...Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined)),
        actualizadoEn: ahora(),
      };
      await maestros.guardarConductor(actualizado);
      await auditar(
        actor,
        'conductor.actualizar',
        'conductores',
        id,
        vistaConductor(actual, false),
        vistaConductor(actualizado, false),
      );
      return reply.send(vistaConductor(actualizado, false));
    },
  );

  app.delete(
    '/api/v1/conductores/:id',
    { preHandler: exigir('conductores', 'D') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      const actual = await conductorOr404(id);
      const retirado: ConductorRegistro = {
        ...actual,
        eliminadoEn: ahora(),
        actualizadoEn: ahora(),
      };
      await maestros.guardarConductor(retirado);
      await auditar(
        actor,
        'conductor.retirar',
        'conductores',
        id,
        vistaConductor(actual, false),
        vistaConductor(retirado, false),
      );
      return reply.send(vistaConductor(retirado, false));
    },
  );

  // =============================================================================================
  // Catálogos: clientes, destinos, transportadoras (spec §6.3-6.4)
  // =============================================================================================
  app.post('/api/v1/clientes', { preHandler: exigir('catalogos', 'C') }, async (req, reply) => {
    const entrada = CrearClienteSchema.parse(req.body);
    const actor = actorDe(req);
    if (await maestros.clientePorCodigo(entrada.codigo)) {
      throw new ErrorDominio('CATALOGO_EN_USO', `Ya existe el cliente ${entrada.codigo}`);
    }
    const nuevo = { id: ids.nuevo(), ...entrada, activo: true };
    await maestros.guardarCliente(nuevo);
    await auditar(actor, 'cliente.crear', 'catalogos', nuevo.id, null, nuevo);
    return reply.status(201).send(nuevo);
  });

  app.patch(
    '/api/v1/clientes/:id',
    { preHandler: exigir('catalogos', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const cambios = ActualizarClienteSchema.parse(req.body);
      const actor = actorDe(req);
      const actual = (await maestros.clientes()).find((c) => c.id === id);
      if (!actual) throw new ErrorDominio('NOT_FOUND', 'Cliente no existe');
      const actualizado = {
        ...actual,
        ...Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined)),
      };
      await maestros.guardarCliente(actualizado);
      await auditar(actor, 'cliente.actualizar', 'catalogos', id, actual, actualizado);
      return reply.send(actualizado);
    },
  );

  app.delete(
    '/api/v1/clientes/:id',
    { preHandler: exigir('catalogos', 'D') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      const actual = (await maestros.clientes()).find((c) => c.id === id);
      if (!actual) throw new ErrorDominio('NOT_FOUND', 'Cliente no existe');
      const inactivo = { ...actual, activo: false };
      await maestros.guardarCliente(inactivo);
      await auditar(actor, 'cliente.desactivar', 'catalogos', id, actual, inactivo);
      return reply.send(inactivo);
    },
  );

  app.post('/api/v1/destinos', { preHandler: exigir('catalogos', 'C') }, async (req, reply) => {
    const entrada = CrearDestinoSchema.parse(req.body);
    const actor = actorDe(req);
    if (await maestros.destinoPorNombre(entrada.nombre)) {
      throw new ErrorDominio('CATALOGO_EN_USO', `Ya existe el destino ${entrada.nombre}`);
    }
    const nuevo = { id: ids.nuevo(), nombre: entrada.nombre, km: entrada.km ?? null, activo: true };
    await maestros.guardarDestino(nuevo);
    await auditar(actor, 'destino.crear', 'catalogos', nuevo.id, null, nuevo);
    return reply.status(201).send(nuevo);
  });

  app.patch(
    '/api/v1/destinos/:id',
    { preHandler: exigir('catalogos', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const cambios = ActualizarDestinoSchema.parse(req.body);
      const actor = actorDe(req);
      const actual = (await maestros.destinos()).find((d) => d.id === id);
      if (!actual) throw new ErrorDominio('NOT_FOUND', 'Destino no existe');
      if (
        cambios.nombre &&
        cambios.nombre !== actual.nombre &&
        (await maestros.destinoPorNombre(cambios.nombre))
      ) {
        throw new ErrorDominio('CATALOGO_EN_USO', `Ya existe el destino ${cambios.nombre}`);
      }
      const actualizado = {
        ...actual,
        ...Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined)),
      };
      await maestros.guardarDestino(actualizado);
      await auditar(actor, 'destino.actualizar', 'catalogos', id, actual, actualizado);
      return reply.send(actualizado);
    },
  );

  app.delete(
    '/api/v1/destinos/:id',
    { preHandler: exigir('catalogos', 'D') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      const actual = (await maestros.destinos()).find((d) => d.id === id);
      if (!actual) throw new ErrorDominio('NOT_FOUND', 'Destino no existe');
      const inactivo = { ...actual, activo: false };
      await maestros.guardarDestino(inactivo);
      await auditar(actor, 'destino.desactivar', 'catalogos', id, actual, inactivo);
      return reply.send(inactivo);
    },
  );

  app.get(
    '/api/v1/transportadoras',
    { preHandler: exigir('catalogos', 'R') },
    async (_req, reply) => reply.send((await maestros.transportadoras()).filter((t) => t.activo)),
  );

  app.post(
    '/api/v1/transportadoras',
    { preHandler: exigir('catalogos', 'C') },
    async (req, reply) => {
      const entrada = CrearTransportadoraSchema.parse(req.body);
      const actor = actorDe(req);
      if (await maestros.transportadoraPorNombre(entrada.nombre)) {
        throw new ErrorDominio('CATALOGO_EN_USO', `Ya existe la transportadora ${entrada.nombre}`);
      }
      const nueva = { id: ids.nuevo(), nombre: entrada.nombre, activo: true };
      await maestros.guardarTransportadora(nueva);
      await auditar(actor, 'transportadora.crear', 'catalogos', nueva.id, null, nueva);
      return reply.status(201).send(nueva);
    },
  );

  app.patch(
    '/api/v1/transportadoras/:id',
    { preHandler: exigir('catalogos', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const cambios = ActualizarTransportadoraSchema.parse(req.body);
      const actor = actorDe(req);
      const actual = (await maestros.transportadoras()).find((t) => t.id === id);
      if (!actual) throw new ErrorDominio('NOT_FOUND', 'Transportadora no existe');
      const actualizada = {
        ...actual,
        ...Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined)),
      };
      await maestros.guardarTransportadora(actualizada);
      await auditar(actor, 'transportadora.actualizar', 'catalogos', id, actual, actualizada);
      return reply.send(actualizada);
    },
  );

  app.delete(
    '/api/v1/transportadoras/:id',
    { preHandler: exigir('catalogos', 'D') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      const actual = (await maestros.transportadoras()).find((t) => t.id === id);
      if (!actual) throw new ErrorDominio('NOT_FOUND', 'Transportadora no existe');
      const inactiva = { ...actual, activo: false };
      await maestros.guardarTransportadora(inactiva);
      await auditar(actor, 'transportadora.desactivar', 'catalogos', id, actual, inactiva);
      return reply.send(inactiva);
    },
  );

  // =============================================================================================
  // Tarifas (spec §6.4): con vigencia; el viaje guarda tarifa_id y flete_acordado (fase 2)
  // =============================================================================================
  app.get('/api/v1/tarifas', { preHandler: exigir('tarifas', 'R') }, async (req, reply) => {
    const filtro = FiltroTarifasSchema.parse(req.query);
    return reply.send(await maestros.tarifas(filtro));
  });

  app.post('/api/v1/tarifas', { preHandler: exigir('tarifas', 'C') }, async (req, reply) => {
    const entrada = CrearTarifaSchema.parse(req.body);
    const actor = actorDe(req);
    if (!(await maestros.clientes()).some((c) => c.id === entrada.clienteId)) {
      throw new ErrorDominio('NOT_FOUND', 'Cliente no existe');
    }
    if (!(await maestros.destinos()).some((d) => d.id === entrada.destinoId)) {
      throw new ErrorDominio('NOT_FOUND', 'Destino no existe');
    }
    const nueva = { id: ids.nuevo(), ...entrada, vigenciaHasta: entrada.vigenciaHasta ?? null };
    await maestros.guardarTarifa(nueva);
    await auditar(actor, 'tarifa.crear', 'tarifas', nueva.id, null, nueva);
    return reply.status(201).send(nueva);
  });

  app.patch('/api/v1/tarifas/:id', { preHandler: exigir('tarifas', 'U') }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const cambios = ActualizarTarifaSchema.parse(req.body);
    const actor = actorDe(req);
    const actual = await maestros.tarifa(id);
    if (!actual) throw new ErrorDominio('NOT_FOUND', 'Tarifa no existe');
    const actualizada = {
      ...actual,
      valor: cambios.valor ?? actual.valor,
      vigenciaHasta:
        cambios.vigenciaHasta === undefined ? actual.vigenciaHasta : cambios.vigenciaHasta,
    };
    if (actualizada.vigenciaHasta && actualizada.vigenciaHasta < actualizada.vigenciaDesde) {
      throw new ErrorDominio('VALIDATION_ERROR', 'La vigencia termina antes de empezar');
    }
    await maestros.guardarTarifa(actualizada);
    await auditar(actor, 'tarifa.actualizar', 'tarifas', id, actual, actualizada);
    return reply.send(actualizada);
  });

  // "Borrar" una tarifa es cerrar su vigencia hoy: los viajes históricos la siguen referenciando.
  app.delete('/api/v1/tarifas/:id', { preHandler: exigir('tarifas', 'D') }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const actor = actorDe(req);
    const actual = await maestros.tarifa(id);
    if (!actual) throw new ErrorDominio('NOT_FOUND', 'Tarifa no existe');
    const fecha = await hoy();
    const cerrada = {
      ...actual,
      vigenciaHasta: fecha < actual.vigenciaDesde ? actual.vigenciaDesde : fecha,
    };
    await maestros.guardarTarifa(cerrada);
    await auditar(actor, 'tarifa.cerrar', 'tarifas', id, actual, cerrada);
    return reply.send(cerrada);
  });

  // =============================================================================================
  // Documentos (spec §6.3): el semáforo se calcula, el archivo vive en storage
  // =============================================================================================
  app.get(
    '/api/v1/tipos-documento',
    { preHandler: exigir('documentos', 'R', { permitirOwn: true }) },
    async (_req, reply) => reply.send(await maestros.tiposDocumento()),
  );

  app.get(
    '/api/v1/documentos',
    { preHandler: exigir('documentos', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const filtro = FiltroDocumentosSchema.parse(req.query);
      const actor = actorDe(req);
      const fecha = await hoy();
      const tipos = new Map((await maestros.tiposDocumento()).map((t) => [t.id, t]));
      const lista = (await maestros.documentos(filtro)).filter(
        (d) =>
          !esMember(actor) || (d.sujetoTipo === 'vehiculo' && placasPropias(actor).has(d.sujetoId)),
      );
      return reply.send(
        lista.map((d) =>
          vistaDocumento(d, tipos.get(d.tipoId), fecha, enmascara(actor, 'documentos')),
        ),
      );
    },
  );

  async function sujetoExiste(
    sujetoTipo: 'vehiculo' | 'conductor',
    sujetoId: string,
  ): Promise<void> {
    const existe =
      sujetoTipo === 'vehiculo'
        ? await maestros.vehiculo(sujetoId)
        : await maestros.conductor(sujetoId);
    if (!existe) throw new ErrorDominio('NOT_FOUND', `No existe el ${sujetoTipo}`);
  }

  app.post('/api/v1/documentos', { preHandler: exigir('documentos', 'C') }, async (req, reply) => {
    const entrada = CrearDocumentoSchema.parse(req.body);
    const actor = actorDe(req);
    const tipo = (await maestros.tiposDocumento()).find((t) => t.id === entrada.tipoId);
    if (!tipo) throw new ErrorDominio('NOT_FOUND', 'Tipo de documento no existe');
    if (tipo.aplicaA !== entrada.sujetoTipo) {
      throw new ErrorDominio(
        'VALIDATION_ERROR',
        `${tipo.codigo} aplica a ${tipo.aplicaA}, no a ${entrada.sujetoTipo}`,
      );
    }
    await sujetoExiste(entrada.sujetoTipo, entrada.sujetoId);
    const nuevo: DocumentoRegistro = {
      id: ids.nuevo(),
      sujetoTipo: entrada.sujetoTipo,
      sujetoId: entrada.sujetoId,
      tipoId: entrada.tipoId,
      numero: entrada.numero ?? null,
      emitidoEn: entrada.emitidoEn ?? null,
      venceEn: entrada.venceEn ?? null,
      archivoUrl: entrada.archivoUrl ?? null,
      creadoEn: ahora(),
      actualizadoEn: ahora(),
      eliminadoEn: null,
    };
    await maestros.guardarDocumento(nuevo);
    const vista = vistaDocumento(nuevo, tipo, await hoy(), false);
    await auditar(actor, 'documento.crear', 'documentos', nuevo.id, null, vista);
    return reply.status(201).send(vista);
  });

  app.patch(
    '/api/v1/documentos/:id',
    { preHandler: exigir('documentos', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const cambios = ActualizarDocumentoSchema.parse(req.body);
      const actor = actorDe(req);
      const actual = await documentoOr404(id);
      const actualizado: DocumentoRegistro = {
        ...actual,
        ...Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined)),
        actualizadoEn: ahora(),
      };
      await maestros.guardarDocumento(actualizado);
      const tipo = (await maestros.tiposDocumento()).find((t) => t.id === actual.tipoId);
      const fecha = await hoy();
      await auditar(
        actor,
        'documento.actualizar',
        'documentos',
        id,
        vistaDocumento(actual, tipo, fecha, false),
        vistaDocumento(actualizado, tipo, fecha, false),
      );
      return reply.send(vistaDocumento(actualizado, tipo, fecha, false));
    },
  );

  app.delete(
    '/api/v1/documentos/:id',
    { preHandler: exigir('documentos', 'D') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      const actual = await documentoOr404(id);
      const eliminado: DocumentoRegistro = {
        ...actual,
        eliminadoEn: ahora(),
        actualizadoEn: ahora(),
      };
      await maestros.guardarDocumento(eliminado);
      const tipo = (await maestros.tiposDocumento()).find((t) => t.id === actual.tipoId);
      const fecha = await hoy();
      await auditar(
        actor,
        'documento.retirar',
        'documentos',
        id,
        vistaDocumento(actual, tipo, fecha, false),
        vistaDocumento(eliminado, tipo, fecha, false),
      );
      return reply.send(vistaDocumento(eliminado, tipo, fecha, false));
    },
  );

  // --- Alertas de vencimiento y job nocturno (spec §9.2 HSEQ, §14) -------------------------------
  app.get(
    '/api/v1/documentos/alertas',
    { preHandler: exigir('documentos', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const { dias } = z
        .object({ dias: z.coerce.number().int().min(1).max(365).optional() })
        .parse(req.query);
      const actor = actorDe(req);
      const fecha = await hoy();
      const tipos = new Map((await maestros.tiposDocumento()).map((t) => [t.id, t]));
      const vehiculos = new Map(
        (await maestros.vehiculos({ incluirEliminados: true })).map((v) => [v.id, v]),
      );
      const conductores = new Map(
        (await maestros.conductores({ incluirEliminados: true })).map((c) => [c.id, c]),
      );
      const alertas = (await maestros.documentos({}))
        .filter(
          (d) =>
            !esMember(actor) ||
            (d.sujetoTipo === 'vehiculo' && placasPropias(actor).has(d.sujetoId)),
        )
        .map((d) => {
          const vista = vistaDocumento(
            d,
            tipos.get(d.tipoId),
            fecha,
            enmascara(actor, 'documentos'),
          );
          const vehiculo = d.sujetoTipo === 'vehiculo' ? vehiculos.get(d.sujetoId) : undefined;
          const conductor = d.sujetoTipo === 'conductor' ? conductores.get(d.sujetoId) : undefined;
          return {
            ...vista,
            placa: vehiculo?.placa ?? null,
            conductor: conductor?.nombres ?? null,
            sujeto: vehiculo?.placa ?? conductor?.nombres ?? d.sujetoId,
          };
        })
        .filter((a) => {
          const limite = dias ?? a.tipo?.diasAlerta ?? 30;
          return a.diasParaVencer !== null && a.diasParaVencer < limite;
        })
        .sort((a, b) => (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0));
      return reply.send(alertas);
    },
  );

  app.post(
    '/api/v1/jobs/recalcular-documentos',
    { preHandler: exigir('documentos', 'U') },
    async (req, reply) => {
      const actor = actorDe(req);
      const fecha = await hoy();
      const recalculados = await maestros.recalcularEstadosDocumentos(fecha);
      await auditar(actor, 'documentos.recalcular', 'documentos', fecha, null, { recalculados });
      return reply.send({ hoy: fecha, recalculados });
    },
  );
}
