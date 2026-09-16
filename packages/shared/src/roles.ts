// Matriz RBAC (spec §3). La DB aplica RLS; esta matriz gobierna la API y la UI.

export const ROLES = [
  'superadmin',
  'admin_ops',
  'admin_hseq',
  'admin_finance',
  'viewer',
  'member',
] as const;
export type Rol = (typeof ROLES)[number];

export const RECURSOS = [
  'usuarios',
  'parametros',
  'asociados',
  'vehiculos',
  'conductores',
  'documentos',
  'habilitaciones',
  'catalogos',
  'tarifas',
  'requerimientos',
  'cola',
  'ofertas',
  'trs',
  'viajes',
  'recaudos',
  'audit_log',
  'export',
] as const;
export type Recurso = (typeof RECURSOS)[number];

/** C crear · R leer · U actualizar · D borrado lógico · A acción de dominio. */
export type Permiso = 'C' | 'R' | 'U' | 'D' | 'A';

export interface Concesion {
  readonly permisos: readonly Permiso[];
  /** Solo registros ligados a los `vehiculo_ids` del usuario. */
  readonly own?: boolean;
  /** Campos PII enmascarados (`R*`). */
  readonly enmascarado?: boolean;
  /** Override auditado: puede todo, pero cada acción queda en audit_log. */
  readonly override?: boolean;
}

const NADA: Concesion = { permisos: [] };
const R: Concesion = { permisos: ['R'] };
const R_MASK: Concesion = { permisos: ['R'], enmascarado: true };
const RU: Concesion = { permisos: ['R', 'U'] };
const CRUD: Concesion = { permisos: ['C', 'R', 'U', 'D'] };
const OVERRIDE: Concesion = { permisos: ['C', 'R', 'U', 'D', 'A'], override: true };
const OWN_R: Concesion = { permisos: ['R'], own: true };
const OWN_R_MASK: Concesion = { permisos: ['R'], own: true, enmascarado: true };

export const MATRIZ_RBAC: Readonly<Record<Recurso, Readonly<Record<Rol, Concesion>>>> = {
  usuarios: {
    superadmin: CRUD,
    admin_ops: R,
    admin_hseq: R,
    admin_finance: R,
    viewer: NADA,
    member: NADA,
  },
  parametros: {
    superadmin: RU,
    admin_ops: R,
    admin_hseq: R,
    admin_finance: R,
    viewer: R,
    member: NADA,
  },
  asociados: {
    superadmin: CRUD,
    admin_ops: R,
    admin_hseq: RU,
    admin_finance: R,
    viewer: R_MASK,
    member: OWN_R,
  },
  vehiculos: {
    superadmin: CRUD,
    admin_ops: R,
    admin_hseq: CRUD,
    admin_finance: R,
    viewer: R_MASK,
    member: OWN_R,
  },
  conductores: {
    superadmin: CRUD,
    admin_ops: R,
    admin_hseq: CRUD,
    admin_finance: R,
    viewer: R_MASK,
    member: OWN_R,
  },
  documentos: {
    superadmin: CRUD,
    admin_ops: R,
    admin_hseq: CRUD,
    admin_finance: NADA,
    viewer: R_MASK,
    member: OWN_R,
  },
  habilitaciones: {
    superadmin: CRUD,
    admin_ops: R,
    admin_hseq: CRUD,
    admin_finance: NADA,
    viewer: R,
    member: OWN_R,
  },
  catalogos: {
    superadmin: CRUD,
    admin_ops: RU,
    admin_hseq: R,
    admin_finance: CRUD,
    viewer: R,
    member: R,
  },
  tarifas: {
    superadmin: CRUD,
    admin_ops: R,
    admin_hseq: NADA,
    admin_finance: CRUD,
    viewer: R,
    member: NADA,
  },
  requerimientos: {
    superadmin: CRUD,
    admin_ops: CRUD,
    admin_hseq: R,
    admin_finance: R,
    viewer: R,
    member: NADA,
  },
  cola: {
    superadmin: { permisos: ['R', 'U', 'A'], override: true },
    admin_ops: { permisos: ['R', 'A'] },
    admin_hseq: R,
    admin_finance: R,
    viewer: R,
    member: OWN_R,
  },
  ofertas: {
    superadmin: OVERRIDE,
    admin_ops: { permisos: ['C', 'R', 'A'] },
    admin_hseq: R,
    admin_finance: R,
    viewer: R,
    member: { permisos: ['R', 'A'], own: true },
  },
  trs: {
    superadmin: OVERRIDE,
    admin_ops: { permisos: ['C', 'R', 'U', 'A'] },
    admin_hseq: R,
    admin_finance: R,
    viewer: R,
    member: OWN_R,
  },
  viajes: {
    superadmin: OVERRIDE,
    admin_ops: RU,
    admin_hseq: R,
    admin_finance: CRUD,
    viewer: R_MASK,
    member: OWN_R_MASK,
  },
  recaudos: {
    superadmin: OVERRIDE,
    admin_ops: R,
    admin_hseq: NADA,
    admin_finance: CRUD,
    viewer: R_MASK,
    member: OWN_R,
  },
  audit_log: {
    superadmin: R,
    admin_ops: R,
    admin_hseq: R,
    admin_finance: R,
    viewer: NADA,
    member: NADA,
  },
  export: {
    superadmin: { permisos: ['A'] },
    admin_ops: { permisos: ['A'] },
    admin_hseq: { permisos: ['A'] },
    admin_finance: { permisos: ['A'] },
    viewer: { permisos: ['A'], enmascarado: true },
    member: { permisos: ['A'], own: true },
  },
};

/** Entidades de audit_log que cada admin puede leer ("R propio módulo"). */
export const MODULO_AUDIT: Readonly<Record<Rol, readonly string[] | 'todo' | 'nada'>> = {
  superadmin: 'todo',
  admin_ops: ['requerimientos', 'cola', 'ofertas', 'trs'],
  admin_hseq: ['asociados', 'vehiculos', 'conductores', 'documentos', 'habilitaciones'],
  admin_finance: ['viajes', 'recaudos', 'tarifas', 'catalogos'],
  viewer: 'nada',
  member: 'nada',
};

/** Duración máxima de sesión por rol (spec §3.3). */
export const DURACION_SESION_HORAS: Readonly<Record<Rol, number>> = {
  superadmin: 4,
  admin_ops: 8,
  admin_hseq: 8,
  admin_finance: 8,
  viewer: 12,
  member: 24 * 7,
};

export function concesionDe(rol: Rol, recurso: Recurso): Concesion {
  return MATRIZ_RBAC[recurso][rol];
}

export function puede(rol: Rol, recurso: Recurso, permiso: Permiso): boolean {
  return concesionDe(rol, recurso).permisos.includes(permiso);
}

export function esSoloPropio(rol: Rol, recurso: Recurso): boolean {
  return concesionDe(rol, recurso).own === true;
}

export function veEnmascarado(rol: Rol, recurso: Recurso): boolean {
  return concesionDe(rol, recurso).enmascarado === true;
}

export function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor);
}
