import type { FallbackProps } from 'react-error-boundary';
import { errorText } from './PageErrorFallback';

/**
 * Shown when HemoIO itself failed, outside any page: plain HTML, as it sits
 * outside the theme
 */
export function AppErrorFallback({ error }: FallbackProps): React.ReactNode {
  return (
    <main role="alert" style={{ maxWidth: 640, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22 }}>HemoIO could not be shown</h1>
      <p>Something went wrong. Reloading locks HemoIO until you enter your password again.</p>
      <p style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{errorText(error)}</p>
      <button type="button" onClick={() => window.location.reload()} style={{ fontSize: 16, padding: '8px 16px' }}>
        Reload HemoIO
      </button>
    </main>
  );
}
