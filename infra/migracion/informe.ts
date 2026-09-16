import type { ResumenCarga } from './cargar.js';
import type { Excepcion, Plan, TipoExcepcion } from './modelo.js';

// Informe de excepciones (spec §13.1.8): lo que el Excel no deja migrar limpio, listado y no silenciado.

const TITULOS: Readonly<Record<TipoExcepcion, string>> = {
  placa_invalida: 'Placas que no cumplen el formato (fila no importada)',
  placa_alias: 'Erratas de placa corregidas por alias',
  placa_sin_asociado: 'Viajes con flete cuya placa no tiene asociado (sin recaudo)',
  placa_no_asociada: 'Placas sin asociado (creadas inactivas, fuera de la cola)',
  asociado_por_nombre: 'Placas atribuidas a un asociado por su nombre corto',
  asociado_conflicto: 'Placas que dos hojas atribuyen a asociados distintos',
  asociado_documento_discrepante: 'Asociados con el mismo nombre y documento distinto',
  clase_conflicto: 'Placas con clase distinta según la hoja',
  tr_duplicado: 'TR repetidos en CONTROL TURNOS',
  tr_vacio: 'Códigos `TR-` sin número',
  declino_vs_declina: '`DECLINO` en vez de `DECLINA`',
  tr_sufijo: 'TR con sufijo (`TR-39591-1`)',
  destino_no_canonico: 'Lugares de descargue que no coinciden con un destino de tarifas',
  recaudo_distinto: 'Recaudo recalculado distinto del 3 % legado',
  fecha_invalida: 'Fechas ausentes o incoherentes',
  documento_sin_fecha: 'Documentos marcados sin fecha de vencimiento',
  correo_duplicado: 'Correos compartidos por varios asociados',
  habilitacion_sin_dato: 'Vehículos con clientes sin marca en el TURNERO',
  sancion: 'Sanciones vigentes o históricas del TURNERO',
  tarifa_sin_valor: 'Destinos sin tarifa',
  conductor_sin_documento: 'Conductores sin documento (no importados)',
  fila_ignorada: 'Filas ignoradas',
  hoja_ausente: 'Hojas esperadas que no están en el libro',
};

export function resumenPlan(plan: Plan): Record<string, number> {
  const activos = plan.vehiculos.filter((v) => v.estado === 'activo').length;
  return {
    asociados: plan.asociados.length,
    vehiculos: plan.vehiculos.length,
    vehiculos_activos: activos,
    conductores: plan.conductores.length,
    documentos: plan.documentos.length,
    habilitaciones: plan.habilitaciones.length,
    destinos: plan.destinos.length,
    tarifas: plan.tarifas.length,
    transportadoras: plan.transportadoras.length,
    posiciones: plan.posiciones.length,
    viajes: plan.viajes.length,
    usuarios_member: plan.usuariosMember.length,
    excepciones: plan.excepciones.length,
  };
}

function agrupar(excepciones: readonly Excepcion[]): Map<TipoExcepcion, Excepcion[]> {
  const grupos = new Map<TipoExcepcion, Excepcion[]>();
  for (const e of excepciones) {
    const lista = grupos.get(e.tipo) ?? [];
    lista.push(e);
    grupos.set(e.tipo, lista);
  }
  return grupos;
}

export function generarInforme(plan: Plan, carga: ResumenCarga | null): string {
  const lineas: string[] = [];
  lineas.push('# Informe de migración del Excel legado');
  lineas.push('');
  lineas.push(`- Foto del TURNERO: ${plan.fechaFoto}`);
  lineas.push(
    `- Porcentaje de recaudo aplicado: ${plan.porcentajeRecaudo * 100} % (parámetro \`recaudo_porcentaje\`)`,
  );
  lineas.push(
    `- Carga en base de datos: ${carga ? (carga.commit ? 'confirmada (commit)' : 'simulada (dry-run, rollback)') : 'no ejecutada (--sin-db)'}`,
  );
  lineas.push('');
  lineas.push('## Decisiones (spec §13.2)');
  lineas.push('');
  for (const d of plan.decisiones) lineas.push(`- ${d}`);
  lineas.push('');
  lineas.push('## Conteos');
  lineas.push('');
  lineas.push('| Entidad | Plan | Cargado |');
  lineas.push('| --- | ---: | ---: |');
  const resumen = resumenPlan(plan);
  const cargado = carga as unknown as Record<string, number | boolean> | null;
  for (const [k, v] of Object.entries(resumen)) {
    const c = cargado && typeof cargado[k] === 'number' ? String(cargado[k]) : '';
    lineas.push(`| ${k} | ${v} | ${c} |`);
  }
  if (carga) {
    for (const k of ['requerimientos', 'trs', 'recaudos', 'usuarios'] as const) {
      lineas.push(`| ${k} |  | ${carga[k]} |`);
    }
  }
  lineas.push('');
  lineas.push('## Cola reconstruida por clase (§13.3: N = vehículos activos de la clase)');
  lineas.push('');
  const porClase = new Map<string, number>();
  for (const p of plan.posiciones) porClase.set(p.claseCola, (porClase.get(p.claseCola) ?? 0) + 1);
  for (const [clase, n] of porClase) {
    const activos = plan.vehiculos.filter(
      (v) => v.estado === 'activo' && v.claseCola === clase,
    ).length;
    lineas.push(
      `- ${clase}: ${n} posiciones, ${activos} vehículos activos${n === activos ? '' : ' **(no cuadra)**'}`,
    );
  }
  lineas.push('');
  lineas.push('## Planillas CONTROL TURNOS (solo informe: el TR real no trae placa)');
  lineas.push('');
  lineas.push('| Hoja | Asignaciones con TR | Declinas | Pendientes | Canceladas |');
  lineas.push('| --- | ---: | ---: | ---: | ---: |');
  for (const r of plan.resumenControl) {
    lineas.push(
      `| ${r.hoja} | ${r.asignacionesConTr} | ${r.declinas} | ${r.pendientes} | ${r.canceladas} |`,
    );
  }
  lineas.push('');
  lineas.push('## Excepciones');
  lineas.push('');
  const grupos = agrupar(plan.excepciones);
  if (grupos.size === 0) lineas.push('Sin excepciones.');
  for (const [tipo, lista] of [...grupos.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lineas.push(`### ${TITULOS[tipo]} (${lista.length})`);
    lineas.push('');
    if (tipo === 'destino_no_canonico') {
      // Un lugar por línea con su frecuencia: es la lista de trabajo para el catálogo de destinos.
      const porLugar = new Map<string, number>();
      for (const e of lista) porLugar.set(e.detalle, (porLugar.get(e.detalle) ?? 0) + 1);
      for (const [lugar, n] of [...porLugar].sort((a, b) => b[1] - a[1])) {
        lineas.push(`- ${lugar} (${n} viajes)`);
      }
    } else {
      for (const e of lista) {
        lineas.push(`- ${e.hoja}${e.fila !== null ? ` fila ${e.fila}` : ''}: ${e.detalle}`);
      }
    }
    lineas.push('');
  }
  return lineas.join('\n');
}
