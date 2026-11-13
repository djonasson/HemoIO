import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import App from './App.tsx';
import { AppErrorFallback } from './components/common/AppErrorFallback';
import { logFailure } from './utils/logFailure';

/** A failed render, logged by the error's kind only: its message can name health data */
function logRenderFailure(error: unknown): void {
  logFailure(`A page failed to show (${error instanceof Error ? error.name : typeof error})`);
}

createRoot(document.getElementById('root')!, {
  onCaughtError: logRenderFailure,
  onUncaughtError: logRenderFailure,
}).render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={AppErrorFallback}>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
