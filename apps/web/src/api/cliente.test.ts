import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESPERA_COLA_LOCKED_MS, ErrorApiCliente, api } from './cliente';

// Reintento ante `COLA_LOCKED` (spec §7.7, TASK-0020): el segundo coordinador espera 2 s y
// reintenta; solo escrituras, solo ese código, como mucho dos veces.

const respuesta = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const bloqueada = () =>
  respuesta(409, { code: 'COLA_LOCKED', message: 'Cola TM-CBZ bloqueada', details: {} });

describe('api(): reintento ante COLA_LOCKED', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('espera 2 s entre intentos y devuelve el resultado cuando la cola se libera', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(bloqueada())
      .mockResolvedValueOnce(bloqueada())
      .mockResolvedValueOnce(respuesta(201, { id: 'of-1' }));
    const promesa = api<{ id: string }>('/requerimientos/req-1/ofertas', { method: 'POST' });
    await vi.advanceTimersByTimeAsync(ESPERA_COLA_LOCKED_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ESPERA_COLA_LOCKED_MS * 2);
    await expect(promesa).resolves.toEqual({ id: 'of-1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('tras dos reintentos propaga COLA_LOCKED con su código estable', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(bloqueada())
      .mockResolvedValueOnce(bloqueada())
      .mockResolvedValueOnce(bloqueada())
      .mockResolvedValueOnce(respuesta(201, { id: 'nunca' }));
    const promesa = api('/ofertas/of-1/aceptar', { method: 'POST' });
    const esperado = expect(promesa).rejects.toMatchObject({ code: 'COLA_LOCKED', status: 409 });
    await vi.advanceTimersByTimeAsync(ESPERA_COLA_LOCKED_MS * 3);
    await esperado;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('no reintenta lecturas ni otros errores', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(bloqueada())
      .mockResolvedValueOnce(
        respuesta(422, { code: 'COLA_VACIA', message: 'No hay placas', details: {} }),
      );
    await expect(api('/colas/TM-CBZ')).rejects.toBeInstanceOf(ErrorApiCliente);
    await expect(api('/requerimientos/req-1/ofertas', { method: 'POST' })).rejects.toMatchObject({
      code: 'COLA_VACIA',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
