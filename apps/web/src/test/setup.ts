import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sin `globals: true`, RTL no encuentra afterEach: limpiamos el DOM entre tests a mano.
afterEach(() => {
  cleanup();
});
