import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { SesionProvider } from './sesion/SesionProvider';
import './estilos.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true, staleTime: 2_000 } },
});

// PWA (spec §9.1): el service worker se actualiza solo; sin red, "Mi turno" sigue leyendo lo cacheado.
registerSW({ immediate: true });

const raiz = document.getElementById('root');
if (!raiz) throw new Error('No existe #root');

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SesionProvider>
          <App />
        </SesionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
