import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { PageErrorFallback } from './PageErrorFallback';

describe('PageErrorFallback', () => {
  function renderFallback(resetErrorBoundary = vi.fn()) {
    render(
      <MantineProvider>
        <PageErrorFallback error={new TypeError('x is undefined')} resetErrorBoundary={resetErrorBoundary} />
      </MantineProvider>
    );
    return resetErrorBoundary;
  }

  it('says the page could not be shown, with the error, as an alert', () => {
    renderFallback();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This page could not be shown');
    expect(alert).toHaveTextContent('TypeError: x is undefined');
    expect(alert).toHaveTextContent('Reloading locks HemoIO until you enter your password again.');
  });

  it('tries the page again', async () => {
    const reset = renderFallback();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('offers to reload HemoIO', () => {
    renderFallback();
    expect(screen.getByRole('button', { name: 'Reload HemoIO' })).toBeVisible();
  });
});
