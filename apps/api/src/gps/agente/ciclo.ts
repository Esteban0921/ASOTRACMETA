import type { LoteUbicacionesGps, UbicacionGps } from '@asotracmet/shared';
import { ErrorIngesta, type ClienteIngesta } from './api.js';
import type { CuentaGps } from './cuentas.js';
import type { Log } from './log.js';
import type { RegistroProveedores } from './proveedores/registro.js';
import { ErrorProveedorGps } from './proveedores/tipos.js';

// Una corrida del agente GPS (ADR-0007, TASK-0064).
//
// Reglas que gobiernan esta vuelta, y el porqué de cada una:
//  - Antes de tocar ninguna plataforma se comprueba el token con un lote vacío. Un token mal
//    rotado no debe gastar intentos de acceso de los propietarios.
//  - Un lote por cuenta: si el adaptador de una plataforma devuelve algo que la API rechaza, las
//    demás cuentas ya entregaron lo suyo.
//  - Una cuenta con credenciales inválidas se aparta unos ciclos, duplicando la espera. Repetir el
//    acceso cada veinte minutos con una clave vieja es la forma más rápida de que la plataforma
//    bloquee la cuenta del asociado, y el perjudicado sería él.
//  - Nada de esto llega a la API ni al log más allá de conteos.

const ESPERA_MAXIMA_CICLOS = 72;
const FALLOS_ANTES_DE_APARTAR = 3;

export interface EstadoCuenta {
  fallosSeguidos: number;
  /** Número de ciclo a partir del cual se vuelve a intentar. */
  saltarHasta: number;
  ultimoMotivo: string | null;
}

export interface ResumenCiclo {
  ciclo: number;
  cuentas: number;
  consultadas: number;
  saltadas: number;
  fallidas: number;
  enviadas: number;
  recibidas: number;
  guardadas: number;
  intervaloMinutos: number;
  /** La API rechazó el token: este ciclo no consultó ninguna plataforma. */
  tokenInvalido: boolean;
}

export interface DepsCiclo {
  /** Relee el archivo de cuentas en cada vuelta. */
  leerCuentas: () => Promise<CuentaGps[]>;
  proveedores: RegistroProveedores;
  api: ClienteIngesta;
  fetch: typeof fetch;
  ahora: () => Date;
  nuevoId: () => string;
  log: Log;
  timeoutMs: number;
  concurrencia: number;
  intervaloMinutos: number;
  /** En desarrollo y e2e fuerza `simulado` para no salir a la red. */
  proveedorForzado?: string;
}

export class CicloGps {
  private readonly estados = new Map<string, EstadoCuenta>();
  private numeroCiclo = 0;
  private intervalo: number;
  private tokenComprobado = false;

  constructor(private readonly deps: DepsCiclo) {
    this.intervalo = deps.intervaloMinutos;
  }

  /** Minutos hasta la próxima vuelta; la API lo decide con `gps_intervalo_minutos`. */
  get intervaloMinutos(): number {
    return this.intervalo;
  }

  estadoDe(cuentaId: string): EstadoCuenta | undefined {
    return this.estados.get(cuentaId);
  }

  async correr(): Promise<ResumenCiclo> {
    this.numeroCiclo += 1;
    const resumen: ResumenCiclo = {
      ciclo: this.numeroCiclo,
      cuentas: 0,
      consultadas: 0,
      saltadas: 0,
      fallidas: 0,
      enviadas: 0,
      recibidas: 0,
      guardadas: 0,
      intervaloMinutos: this.intervalo,
      tokenInvalido: false,
    };

    // 1. El token, antes que nada: un lote vacío no consulta ninguna plataforma.
    if (!this.tokenComprobado) {
      try {
        const prueba = await this.deps.api.enviar(this.lote('verificacion', []));
        this.adoptarIntervalo(prueba.intervaloMinutos);
        this.tokenComprobado = true;
      } catch (error) {
        resumen.tokenInvalido = error instanceof ErrorIngesta && error.motivo === 'token';
        this.deps.log(
          { ciclo: this.numeroCiclo, error: mensajeDe(error) },
          resumen.tokenInvalido
            ? 'gps agente: la API rechazó el token; no se consulta ninguna plataforma'
            : 'gps agente: la API no respondió a la comprobación del token',
          'error',
        );
        resumen.intervaloMinutos = this.intervalo;
        return resumen;
      }
    }

    // 2. Las cuentas, releídas cada vuelta. Si el archivo desapareció, no se reutiliza el anterior.
    let cuentas: CuentaGps[];
    try {
      cuentas = await this.deps.leerCuentas();
    } catch (error) {
      this.deps.log(
        { ciclo: this.numeroCiclo, error: mensajeDe(error) },
        'gps agente: no se pudieron leer las cuentas',
        'error',
      );
      return resumen;
    }
    resumen.cuentas = cuentas.length;

    // 3. Cada cuenta por su lado, de a pocas a la vez.
    const pendientes = [...cuentas];
    const trabajador = async (): Promise<void> => {
      for (let cuenta = pendientes.shift(); cuenta; cuenta = pendientes.shift()) {
        await this.procesar(cuenta, resumen);
      }
    };
    await Promise.all(
      Array.from({ length: Math.max(1, this.deps.concurrencia) }, () => trabajador()),
    );

    resumen.intervaloMinutos = this.intervalo;
    this.deps.log({ ...resumen }, 'gps agente: ciclo terminado');
    return resumen;
  }

  private async procesar(cuenta: CuentaGps, resumen: ResumenCiclo): Promise<void> {
    const estado = this.estados.get(cuenta.id);
    if (estado && estado.saltarHasta > this.numeroCiclo) {
      resumen.saltadas += 1;
      this.deps.log(
        {
          ciclo: this.numeroCiclo,
          cuentaId: cuenta.id,
          motivo: estado.ultimoMotivo,
          saltarHasta: estado.saltarHasta,
        },
        'gps agente: cuenta apartada, no se intenta este ciclo',
        'warn',
      );
      return;
    }

    const clase = this.deps.proveedorForzado ?? cuenta.proveedor;
    const proveedor = this.deps.proveedores.get(clase);
    if (!proveedor) {
      resumen.saltadas += 1;
      this.deps.log(
        { ciclo: this.numeroCiclo, cuentaId: cuenta.id, proveedor: clase },
        'gps agente: no hay adaptador para esa plataforma',
        'warn',
      );
      return;
    }

    const inicio = this.deps.ahora().getTime();
    try {
      const leidas = await proveedor.ubicaciones(cuenta, {
        fetch: this.deps.fetch,
        ahora: this.deps.ahora,
        signal: AbortSignal.timeout(this.deps.timeoutMs),
        log: (datos, mensaje) => this.deps.log(datos, mensaje),
      });
      resumen.consultadas += 1;
      const ubicaciones = this.filtrar(leidas, cuenta);
      if (ubicaciones.length > 0) {
        const resultado = await this.deps.api.enviar(this.lote(cuenta.id, ubicaciones));
        this.adoptarIntervalo(resultado.intervaloMinutos);
        resumen.enviadas += 1;
        resumen.recibidas += resultado.recibidas;
        resumen.guardadas += resultado.guardadas;
        this.deps.log(
          {
            ciclo: this.numeroCiclo,
            cuentaId: cuenta.id,
            proveedor: clase,
            placas: ubicaciones.length,
            guardadas: resultado.guardadas,
            duplicadas: resultado.duplicadas,
            ignoradas: resultado.ignoradas,
            placasDesconocidas: resultado.placasDesconocidas.length,
            ms: this.deps.ahora().getTime() - inicio,
          },
          'gps agente: cuenta entregada',
        );
      }
      this.estados.delete(cuenta.id);
    } catch (error) {
      resumen.fallidas += 1;
      this.apartar(cuenta, error, resumen);
    }
  }

  /** La allowlist de la cuenta manda: si declara placas, no se envía nada fuera de ellas. */
  private filtrar(leidas: readonly UbicacionGps[], cuenta: CuentaGps): UbicacionGps[] {
    const permitidas = cuenta.placas ? new Set(cuenta.placas) : null;
    const ultimaPorPlaca = new Map<string, UbicacionGps>();
    for (const lectura of leidas) {
      if (permitidas && !permitidas.has(lectura.placa)) continue;
      const previa = ultimaPorPlaca.get(lectura.placa);
      if (!previa || lectura.capturadaEn > previa.capturadaEn) {
        ultimaPorPlaca.set(lectura.placa, lectura);
      }
    }
    return [...ultimaPorPlaca.values()];
  }

  private lote(cuentaId: string, ubicaciones: UbicacionGps[]): LoteUbicacionesGps {
    return { loteId: this.deps.nuevoId(), cuentaId, ubicaciones };
  }

  private adoptarIntervalo(minutos: number): void {
    // Acotado: el parámetro ya lo valida la API, pero el agente no se fía de lo que llega por red.
    if (Number.isFinite(minutos)) this.intervalo = Math.min(180, Math.max(10, Math.round(minutos)));
  }

  private apartar(cuenta: CuentaGps, error: unknown, resumen: ResumenCiclo): void {
    const motivo =
      error instanceof ErrorProveedorGps
        ? error.motivo
        : error instanceof ErrorIngesta
          ? `api_${error.motivo}`
          : 'desconocido';
    const previo = this.estados.get(cuenta.id);
    const fallosSeguidos = (previo?.fallosSeguidos ?? 0) + 1;
    // Las credenciales inválidas apartan desde el primer fallo; lo demás, tras tres seguidos.
    const apartar =
      motivo === 'credenciales_invalidas' || fallosSeguidos >= FALLOS_ANTES_DE_APARTAR;
    const espera = apartar ? Math.min(ESPERA_MAXIMA_CICLOS, 2 ** Math.min(fallosSeguidos, 10)) : 0;
    this.estados.set(cuenta.id, {
      fallosSeguidos,
      saltarHasta: this.numeroCiclo + espera,
      ultimoMotivo: motivo,
    });
    this.deps.log(
      {
        ciclo: this.numeroCiclo,
        cuentaId: cuenta.id,
        proveedor: cuenta.proveedor,
        motivo,
        intentos: fallosSeguidos,
        saltarHasta: this.numeroCiclo + espera,
        error: mensajeDe(error),
      },
      apartar
        ? 'gps agente: cuenta apartada tras fallar'
        : 'gps agente: la cuenta falló, se reintenta en el siguiente ciclo',
      'warn',
    );
    if (error instanceof ErrorIngesta && error.motivo === 'token') resumen.tokenInvalido = true;
  }
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
