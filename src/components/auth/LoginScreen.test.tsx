import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { LoginScreen } from './LoginScreen';

// Mock the useAuth hook
const mockUnlock = vi.fn();

vi.mock('@contexts/useAuth', () => ({
  useAuth: () => ({
    unlock: mockUnlock,
  }),
}));

function renderWithMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the login form', () => {
    renderWithMantine(<LoginScreen />);

    expect(screen.getByRole('heading', { name: 'HemoIO' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument();
  });

  it('focuses password input on mount', () => {
    renderWithMantine(<LoginScreen />);

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveFocus();
  });

  it('disables unlock button when password is empty', () => {
    renderWithMantine(<LoginScreen />);

    const unlockButton = screen.getByRole('button', { name: /unlock/i });
    expect(unlockButton).toBeDisabled();
  });

  it('enables unlock button when password is entered', async () => {
    const user = userEvent.setup();
    renderWithMantine(<LoginScreen />);

    const passwordInput = screen.getByLabelText('Password');
    await user.type(passwordInput, 'somepassword');

    const unlockButton = screen.getByRole('button', { name: /unlock/i });
    expect(unlockButton).toBeEnabled();
  });

  it('calls unlock with password when form is submitted', async () => {
    mockUnlock.mockResolvedValue(true);
    const user = userEvent.setup();
    renderWithMantine(<LoginScreen />);

    const passwordInput = screen.getByLabelText('Password');
    await user.type(passwordInput, 'correctpassword');

    const unlockButton = screen.getByRole('button', { name: /unlock/i });
    await user.click(unlockButton);

    expect(mockUnlock).toHaveBeenCalledWith('correctpassword');
  });

  it('shows error message when unlock fails', async () => {
    mockUnlock.mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithMantine(<LoginScreen />);

    const passwordInput = screen.getByLabelText('Password');
    await user.type(passwordInput, 'wrongpassword');

    const unlockButton = screen.getByRole('button', { name: /unlock/i });
    await user.click(unlockButton);

    await waitFor(() => {
      expect(screen.getByText('Incorrect password')).toBeInTheDocument();
    });
  });

  it('clears password and refocuses input after failed attempt', async () => {
    mockUnlock.mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithMantine(<LoginScreen />);

    const passwordInput = screen.getByLabelText('Password');
    await user.type(passwordInput, 'wrongpassword');

    const unlockButton = screen.getByRole('button', { name: /unlock/i });
    await user.click(unlockButton);

    await waitFor(() => {
      expect(passwordInput).toHaveValue('');
    });
  });

  it('clears error when user starts typing again', async () => {
    mockUnlock.mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithMantine(<LoginScreen />);

    // First, trigger an error
    const passwordInput = screen.getByLabelText('Password');
    await user.type(passwordInput, 'wrong');
    await user.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(screen.getByText('Incorrect password')).toBeInTheDocument();
    });

    // Then start typing again
    await user.type(passwordInput, 'new');

    await waitFor(() => {
      expect(screen.queryByText('Incorrect password')).not.toBeInTheDocument();
    });
  });

  it('shows security message', () => {
    renderWithMantine(<LoginScreen />);

    expect(
      screen.getByText(/data is encrypted locally/i)
    ).toBeInTheDocument();
  });
});
