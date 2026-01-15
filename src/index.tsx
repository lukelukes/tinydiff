import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import AppLoader from './app-loader.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppLoader />
  </StrictMode>
);
