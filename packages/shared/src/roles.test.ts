import { describe, expect, it } from 'vitest';
import { MATRIZ_RBAC, RECURSOS, ROLES, esSoloPropio, puede, veEnmascarado } from './roles.js';

describe('matriz RBAC (spec §3.2)', () => {
  it('cubre todos los recursos y roles', () => {
    for (const recurso of RECURSOS) {
      for (const rol of ROLES) {
        expect(MATRIZ_RBAC[recurso][rol]).toBeDefined();
      }
    }
  });

  it('viewer no puede mutar ninguna entidad (criterio de aceptación §20.1)', () => {
    for (const recurso of RECURSOS) {
      expect(puede('viewer', recurso, 'C')).toBe(false);
      expect(puede('viewer', recurso, 'U')).toBe(false);
      expect(puede('viewer', recurso, 'D')).toBe(false);
    }
    expect(puede('viewer', 'cola', 'A')).toBe(false);
    expect(puede('viewer', 'ofertas', 'A')).toBe(false);
  });

  it('member solo ve lo propio y puede aceptar/declinar ofertas', () => {
    expect(esSoloPropio('member', 'trs')).toBe(true);
    expect(esSoloPropio('member', 'ofertas')).toBe(true);
    expect(puede('member', 'ofertas', 'A')).toBe(true);
    expect(puede('member', 'requerimientos', 'R')).toBe(false);
    expect(puede('member', 'usuarios', 'R')).toBe(false);
  });

  it('admin_ops opera cola, ofertas y TR pero no toca valores de viajes', () => {
    expect(puede('admin_ops', 'cola', 'A')).toBe(true);
    expect(puede('admin_ops', 'ofertas', 'C')).toBe(true);
    expect(puede('admin_ops', 'trs', 'A')).toBe(true);
    expect(puede('admin_ops', 'recaudos', 'C')).toBe(false);
    expect(puede('admin_ops', 'tarifas', 'U')).toBe(false);
  });

  it('viewer ve PII enmascarada', () => {
    expect(veEnmascarado('viewer', 'asociados')).toBe(true);
    expect(veEnmascarado('viewer', 'viajes')).toBe(true);
    expect(veEnmascarado('admin_ops', 'asociados')).toBe(false);
  });

  it('superadmin tiene override auditado en cola, ofertas y TR', () => {
    expect(MATRIZ_RBAC.cola.superadmin.override).toBe(true);
    expect(MATRIZ_RBAC.ofertas.superadmin.override).toBe(true);
    expect(MATRIZ_RBAC.trs.superadmin.override).toBe(true);
    expect(puede('superadmin', 'usuarios', 'D')).toBe(true);
  });
});
