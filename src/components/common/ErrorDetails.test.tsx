import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorDetails } from './ErrorDetails';

function failed(): Error {
  const error = new TypeError('d is not a function');
  error.stack = 'TypeError: d is not a function\n    at Ab (https://example.org/assets/index.js:1:2)';
  return error;
}

describe('ErrorDetails', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('folds away the message, the code locations and the browser', async () => {
    render(<ErrorDetails error={failed()} />);
    await userEvent.click(screen.getByText('Technical details'));
    const details = screen.getByLabelText('Technical details');
    expect(details).toBeVisible();
    expect(details).toHaveTextContent('TypeError: d is not a function Where: at Ab (https://example.org/assets/index.js:1:2)');
    expect(details).toHaveTextContent(`Browser: ${navigator.userAgent}`);
  });

  it('copies the details and says so', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<ErrorDetails error={failed()} />);
    await user.click(screen.getByText('Technical details'));
    await user.click(screen.getByRole('button', { name: 'Copy details' }));
    expect(writeText).toHaveBeenCalledWith(screen.getByLabelText('Technical details').textContent);
    expect(screen.getByRole('button', { name: 'Details copied' })).toBeVisible();
  });

  it('says when the details could not be copied', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<ErrorDetails error={failed()} />);
    await user.click(screen.getByText('Technical details'));
    await user.click(screen.getByRole('button', { name: 'Copy details' }));
    expect(await screen.findByRole('button', { name: 'Could not copy: select the details instead' })).toBeVisible();
  });
});
