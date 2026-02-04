import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { SetupWizard } from './SetupWizard';
import { AuthProvider } from '@contexts';

// Mock the encryption module
vi.mock('@data/encryption', () => ({
  encryptString: vi.fn().mockResolvedValue('encrypted'),
  getEncryptionKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
  checkPasswordStrength: vi.fn((password: string) => {
    const hasMinLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const isStrong = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;
    return {
      score: isStrong ? 5 : 2,
      label: isStrong ? 'Strong' : 'Weak',
      isStrong,
      checks: { hasMinLength, hasUppercase, hasLowercase, hasNumber, hasSpecial },
    };
  }),
  createStoredCredentials: vi.fn().mockResolvedValue({
    salt: 'test-salt',
    verificationHash: 'test-hash',
  }),
  verifyPassword: vi.fn().mockResolvedValue(true),
  deriveKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MantineProvider>
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
});
