import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppErrorFallback } from './AppErrorFallback';

describe('AppErrorFallback', () => {
  it('says HemoIO could not be shown, with the error and a reload', () => {
    render(<AppErrorFallback error={new Error('provider failed')} resetErrorBoundary={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('HemoIO could not be shown');
    expect(alert).toHaveTextContent('Error: provider failed');
    expect(screen.getByRole('button', { name: 'Reload HemoIO' })).toBeVisible();
  });
});
