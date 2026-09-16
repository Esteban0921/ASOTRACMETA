import type { Rol } from '@asotracmet/shared';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  passwordHash: string | null;
  activo: boolean;
  asociadoId: string | null;
  /** Scope `member` (tabla usuario_vehiculos). */
  vehiculoIds: string[];
}

export interface UsuarioPublico {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  asociadoId: string | null;
  vehiculoIds: string[];
}

export function usuarioPublico(u: Usuario): UsuarioPublico {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    asociadoId: u.asociadoId,
    vehiculoIds: [...u.vehiculoIds],
  };
}

/** Almacén de usuarios en memoria (fase puente). Con Postgres pasa a tabla `usuarios`. */
export class AlmacenUsuarios {
  private lista: Usuario[];

  constructor(usuarios: Usuario[]) {
    this.lista = usuarios.map((u) => ({ ...u, vehiculoIds: [...u.vehiculoIds] }));
  }

  porEmail(email: string): Usuario | undefined {
    const normalizado = email.trim().toLowerCase();
    return this.lista.find((u) => u.email.toLowerCase() === normalizado);
  }

  porId(id: string): Usuario | undefined {
    return this.lista.find((u) => u.id === id);
  }

  todos(): Usuario[] {
    return this.lista.map((u) => ({ ...u }));
  }

  reemplazar(usuarios: Usuario[]): void {
    this.lista = usuarios.map((u) => ({ ...u, vehiculoIds: [...u.vehiculoIds] }));
  }
}
