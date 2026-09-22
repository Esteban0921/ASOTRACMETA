import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sin `globals: true`, RTL no encuentra afterEach: limpiamos el DOM entre tests a mano.
afterEach(() => {
  cleanup();
});

// jsdom no implementa <dialog>.showModal()/close() (TASK-0046): polyfill mínimo que alterna `open`
// y dispara `close`, suficiente para probar Dialogo, DialogoMotivo y DialogoConfirmar.
if (typeof HTMLDialogElement !== 'undefined') {
  const prototipo = HTMLDialogElement.prototype;
  if (typeof prototipo.showModal !== 'function') {
    prototipo.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof prototipo.show !== 'function') {
    prototipo.show = function show(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof prototipo.close !== 'function') {
    prototipo.close = function close(this: HTMLDialogElement, valor?: string) {
      if (valor !== undefined) this.returnValue = valor;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}
