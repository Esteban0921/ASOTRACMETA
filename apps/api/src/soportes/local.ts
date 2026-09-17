import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CLAVE_SOPORTE_REGEX, type UrlSubida } from '@asotracmet/shared';
import type { AlmacenSoportes, DescripcionObjeto } from './tipos.js';

// Almacén local en disco (TASK-0043): desarrollo, e2e y un VPS sin bucket (`SOPORTES_DIR`, un
// volumen en producción). La clave se valida contra `CLAVE_SOPORTE_REGEX` antes de tocar el
// sistema de archivos: sin `..`, sin rutas absolutas. Al lado de cada archivo va `<clave>.meta.json`
// con el tipo declarado al subir.

export class SoportesLocales implements AlmacenSoportes {
  readonly clase = 'local' as const;

  constructor(private readonly dir: string) {}

  private ruta(clave: string): string {
    if (!CLAVE_SOPORTE_REGEX.test(clave)) throw new Error(`Clave de soporte inválida: ${clave}`);
    return path.join(this.dir, ...clave.split('/'));
  }

  async urlSubida(clave: string, tipo: string, expiraSeg: number, ahora: Date): Promise<UrlSubida> {
    this.ruta(clave);
    return {
      clave,
      metodo: 'PUT',
      url: `/api/v1/soportes/${clave}`,
      cabeceras: { 'content-type': tipo },
      expiraEn: new Date(ahora.getTime() + expiraSeg * 1000).toISOString(),
    };
  }

  async guardar(clave: string, cuerpo: Buffer, tipo: string): Promise<void> {
    const destino = this.ruta(clave);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, cuerpo);
    await writeFile(`${destino}.meta.json`, JSON.stringify({ tipo, tamano: cuerpo.length }));
  }

  async describir(clave: string): Promise<DescripcionObjeto | null> {
    const destino = this.ruta(clave);
    try {
      const info = await stat(destino);
      const meta = JSON.parse(await readFile(`${destino}.meta.json`, 'utf8')) as {
        tipo?: string;
      };
      return { tamano: info.size, tipo: meta.tipo ?? null };
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null;
      throw error;
    }
  }

  async urlDescarga(): Promise<string | null> {
    return null;
  }

  referencia(clave: string): string {
    return `local://${clave}`;
  }

  async leer(clave: string): Promise<{ cuerpo: Buffer; tipo: string } | null> {
    const descripcion = await this.describir(clave);
    if (!descripcion) return null;
    return {
      cuerpo: await readFile(this.ruta(clave)),
      tipo: descripcion.tipo ?? 'application/octet-stream',
    };
  }
}
