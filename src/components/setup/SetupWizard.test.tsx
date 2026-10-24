import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { SetupWizard } from './SetupWizard';
import { AuthProvider } from '@contexts';
import { AuthContext, type AuthContextValue } from '@contexts/AuthContext';
import { encryptString } from '@data/encryption';

// Mock the encryption module
vi.mock('@data/encryption', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@data/encryption')>()),
  encryptString: vi.fn().mockResolvedValue('encrypted'),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MantineProvider env="test">
      <AuthProvider>{ui}</AuthProvider>
    </MantineProvider>
  );
}

describe('SetupWizard', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Form Structure', () => {
    it('renders the wizard with form element', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      // The form should exist
      const form = document.querySelector('form');
      expect(form).toBeInTheDocument();
    });

    it('has submit type button for Next', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      expect(nextButton).toHaveAttribute('type', 'submit');
    });

    it('has button type for Back to prevent form submission', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      const backButton = screen.getByRole('button', { name: /go to previous step/i });
      expect(backButton).toHaveAttribute('type', 'button');
    });
  });

  describe('Navigation Buttons', () => {
    it('renders Back button disabled on first step', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      const backButton = screen.getByRole('button', { name: /go to previous step/i });
      expect(backButton).toBeDisabled();
    });

    it('renders Next button disabled when password is empty', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      expect(nextButton).toBeDisabled();
    });

    it('enables Next button when password is valid', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      await user.type(screen.getByPlaceholderText('Enter your password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText('Confirm your password'), 'TestPassword123!');

      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      expect(nextButton).not.toBeDisabled();
    });

    it('keeps Next button disabled when passwords do not match', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      await user.type(screen.getByPlaceholderText('Enter your password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText('Confirm your password'), 'DifferentPassword123!');

      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      expect(nextButton).toBeDisabled();
    });

    it('navigates to next step when Next button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      // Fill valid password
      await user.type(screen.getByPlaceholderText('Enter your password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText('Confirm your password'), 'TestPassword123!');

      // Click next (this triggers form submission)
      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      await user.click(nextButton);

      // Should be on storage step - the text is in the StorageStep component
      expect(screen.getByText(/choose where to store/i)).toBeInTheDocument();
    });
  });

  describe('Keyboard Submission', () => {
    it('form has proper structure for Enter key submission', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      // Verify the form structure allows Enter key submission:
      // 1. Form element exists
      const form = document.querySelector('form');
      expect(form).toBeInTheDocument();

      // 2. Submit button is inside the form
      const submitButton = screen.getByRole('button', { name: /go to next step/i });
      expect(form?.contains(submitButton)).toBe(true);

      // 3. Input fields are inside the form
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      expect(form?.contains(passwordInput)).toBe(true);
    });

    it('does not submit form when password is invalid (button disabled)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      // Fill invalid password (too short)
      await user.type(screen.getByPlaceholderText('Enter your password'), 'short');

      // Button should be disabled, preventing form submission
      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Step Progression', () => {
    it('shows all four steps in stepper', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      expect(screen.getByText('Security')).toBeInTheDocument();
      expect(screen.getByText('Storage')).toBeInTheDocument();
      expect(screen.getByText('AI Setup')).toBeInTheDocument();
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });

    it('starts on first step', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      // First step content should be visible
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    });
  });

  it('stores the AI setup before the app unlocks, so the app starts with it', async () => {
    const user = userEvent.setup();
    let storedBeforeUnlock = false;
    const auth = {
      status: 'needs_setup',
      encryptionKey: null,
      unlock: vi.fn(),
      lock: vi.fn(),
      changePassword: vi.fn(),
      isSetupComplete: () => false,
      // Unlocks once the setup step has run, as AuthProvider does
      setupPassword: vi.fn(async (_password: string, prepare?: (key: CryptoKey) => Promise<void>) => {
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
          'decrypt',
        ]);
        await prepare?.(key);
        storedBeforeUnlock = localStorage.getItem('hemoio_ai_api_key_encrypted') !== null;
      }),
    } satisfies AuthContextValue;
    render(
      <MantineProvider env="test">
        <AuthContext.Provider value={auth}>
          <SetupWizard onComplete={mockOnComplete} />
        </AuthContext.Provider>
      </MantineProvider>
    );

    await user.type(screen.getByPlaceholderText('Enter your password'), 'Str0ng-Passw0rd!');
    await user.type(screen.getByPlaceholderText('Confirm your password'), 'Str0ng-Passw0rd!');
    await user.click(screen.getByRole('button', { name: 'Go to next step' }));
    await user.click(screen.getByRole('button', { name: 'Go to next step' }));
    await user.click(screen.getByRole('textbox', { name: 'AI Provider' }));
    await user.click(await screen.findByRole('option', { name: 'Anthropic (Claude)' }));
    await user.type(screen.getByLabelText('API Key'), 'sk-ant-test-1234');
    await user.click(screen.getByRole('button', { name: 'Go to next step' }));
    await user.click(screen.getByRole('button', { name: 'Complete setup and get started' }));

    await waitFor(() => expect(mockOnComplete).toHaveBeenCalled());
    expect(storedBeforeUnlock).toBe(true);
    expect(localStorage.getItem('hemoio_ai_provider')).toBe('anthropic');
  }, 15000);

  it('encrypts the API key with the key the password setup returned', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

    await user.type(screen.getByPlaceholderText('Enter your password'), 'Str0ng-Passw0rd!');
    await user.type(screen.getByPlaceholderText('Confirm your password'), 'Str0ng-Passw0rd!');
    await user.click(screen.getByRole('button', { name: 'Go to next step' }));
    await user.click(screen.getByRole('button', { name: 'Go to next step' }));

    await user.click(screen.getByRole('textbox', { name: 'AI Provider' }));
    await user.click(await screen.findByRole('option', { name: 'Anthropic (Claude)' }));
    await user.type(screen.getByLabelText('API Key'), 'sk-ant-test-1234');
    await user.click(screen.getByRole('button', { name: 'Go to next step' }));
    await user.click(screen.getByRole('button', { name: 'Complete setup and get started' }));

    await waitFor(() => expect(mockOnComplete).toHaveBeenCalled());
    expect(encryptString).toHaveBeenCalledWith(
      'sk-ant-test-1234',
      expect.objectContaining({ type: 'secret', extractable: false })
    );
    expect(localStorage.getItem('hemoio_ai_api_key_encrypted')).toBe('encrypted');
  }, 15000);
});
