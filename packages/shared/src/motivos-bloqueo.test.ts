import { describe, expect, it } from 'vitest';
import {
  CODIGOS_MOTIVO_BLOQUEO,
  MOTIVOS_BLOQUEO,
  MotivoBloqueoSchema,
  esCodigoMotivoBloqueo,
  motivoBloqueoDesdeTexto,
  nombreMotivoBloqueo,
} from './motivos-bloqueo.js';

describe('catálogo de motivos de bloqueo (spec §6.3, §12; TASK-0059)', () => {
  it('es cerrado: seis códigos, cada uno con nombre legible y único', () => {
    expect(CODIGOS_MOTIVO_BLOQUEO).toEqual([
      'CURSO_VENCIDO',
      'SIN_CERTIFICACION',
      'DOCUMENTO_PENDIENTE',
      'INSPECCION_RECHAZADA',
      'SANCION_CLIENTE',
      'OTRO',
    ]);
    expect(MOTIVOS_BLOQUEO.map((m) => m.codigo)).toEqual([...CODIGOS_MOTIVO_BLOQUEO]);
    const nombres = MOTIVOS_BLOQUEO.map((m) => m.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
    expect(nombreMotivoBloqueo('CURSO_VENCIDO')).toBe('Curso del cliente vencido');
    expect(nombreMotivoBloqueo('OTRO')).toBe('Otro motivo (ver nota)');
  });

  it('el esquema solo acepta códigos del catálogo; el texto libre ya no es un motivo', () => {
    expect(MotivoBloqueoSchema.parse('SANCION_CLIENTE')).toBe('SANCION_CLIENTE');
    expect(MotivoBloqueoSchema.safeParse('Curso HLB vencido').success).toBe(false);
    expect(esCodigoMotivoBloqueo('OTRO')).toBe(true);
    expect(esCodigoMotivoBloqueo('otro')).toBe(false);
    expect(esCodigoMotivoBloqueo(null)).toBe(false);
  });

  it('un texto legado se recupera como código si es un nombre del catálogo; si no, OTRO con nota', () => {
    expect(motivoBloqueoDesdeTexto('Curso del cliente vencido')).toEqual({
      codigo: 'CURSO_VENCIDO',
      nombre: 'Curso del cliente vencido',
      nota: null,
    });
    expect(motivoBloqueoDesdeTexto('NA en el TURNERO legado')).toEqual({
      codigo: 'OTRO',
      nombre: 'Otro motivo (ver nota)',
      nota: 'NA en el TURNERO legado',
    });
    expect(motivoBloqueoDesdeTexto(null)).toEqual({
      codigo: 'OTRO',
      nombre: 'Otro motivo (ver nota)',
      nota: null,
    });
  });
});
