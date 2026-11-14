import { useState } from 'react';
import { errorDetails } from '@/utils/errorText';

interface ErrorDetailsProps {
  error: unknown;
}

type CopyState = 'idle' | 'copied' | 'failed';

/** Said once copying ends, in a status a screen reader reads out */
const COPY_RESULT: Record<CopyState, string> = {
  idle: '',
  copied: 'Details copied',
  failed: 'Could not copy: select the details instead',
};

/**
 * The details of a failure, folded away, for the user to copy into a report:
 * plain HTML, as the app's own failure screen sits outside the theme
 */
export function ErrorDetails({ error }: ErrorDetailsProps): React.ReactNode {
  const [copy, setCopy] = useState<CopyState>('idle');
  const details = errorDetails(error);

  const copyDetails = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(details);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };

  return (
    <details>
      <summary style={{ cursor: 'pointer' }}>Technical details</summary>
      <pre
        role="region"
        aria-label="Technical details"
        style={{ fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text' }}
      >
        {details}
      </pre>
      <button type="button" onClick={() => void copyDetails()} style={{ fontSize: 14, padding: '6px 12px' }}>
        Copy details
      </button>{' '}
      <span role="status">{COPY_RESULT[copy]}</span>
    </details>
  );
}
