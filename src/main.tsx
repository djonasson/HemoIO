import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import App from './App.tsx';
import { AppErrorFallback } from './components/common/AppErrorFallback';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={AppErrorFallback}>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
