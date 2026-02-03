import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { BackupPasswordInput } from './BackupPasswordInput';

// Mock the password strength checker
vi.mock('@data/encryption', () => ({
  checkPasswordStrength: vi.fn((password: string) => {
    const checks = {
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };
    const score = Object.values(checks).filter(Boolean).length;
    return { score, checks };
  }),
}));

interface BackupPasswordInputTestProps {
  value?: string;
  onChange?: (value: string) => void;
  confirmValue?: string;
  onConfirmChange?: (value: string) => void;
  onValidChange?: (isValid: boolean) => void;
  disabled?: boolean;
  label?: string;
  confirmLabel?: string;
  showStrengthIndicator?: boolean;
  minStrength?: number;
}

function renderBackupPasswordInput(props: BackupPasswordInputTestProps = {}) {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    confirmValue: '',
    onConfirmChange: vi.fn(),
    onValidChange: vi.fn(),
    disabled: false,
    showStrengthIndicator: true,
    minStrength: 3,
    ...props,
  };

  return render(
    <MantineProvider>
      <BackupPasswordInput {...defaultProps} />
    </MantineProvider>
  );
}

describe('BackupPasswordInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders password input with default label', () => {
      renderBackupPasswordInput();

      expect(screen.getByText('Backup Password')).toBeInTheDocument();
    });

    it('renders confirmation input with default label', () => {
      renderBackupPasswordInput();

      expect(screen.getByText('Confirm Password')).toBeInTheDocument();
    });

    it('renders with custom labels', () => {
      renderBackupPasswordInput({
        label: 'Custom Password',
        confirmLabel: 'Custom Confirm',
      });

      expect(screen.getByText('Custom Password')).toBeInTheDocument();
      expect(screen.getByText('Custom Confirm')).toBeInTheDocument();
    });

    it('disables inputs when disabled is true', () => {
      const { container } = renderBackupPasswordInput({ disabled: true });

      const inputs = container.querySelectorAll('input[type="password"]');
      expect(inputs[0]).toBeDisabled();
      expect(inputs[1]).toBeDisabled();
    });
  });

  describe('Password strength indicator', () => {
    it('shows strength indicator when password is entered', () => {
      renderBackupPasswordInput({ value: 'TestPassword123!' });

      expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
      expect(screen.getByText('Uppercase letter')).toBeInTheDocument();
      expect(screen.getByText('Lowercase letter')).toBeInTheDocument();
      expect(screen.getByText('Number')).toBeInTheDocument();
      expect(screen.getByText('Special character')).toBeInTheDocument();
    });

    it('does not show strength indicator when showStrengthIndicator is false', () => {
      renderBackupPasswordInput({ value: 'TestPassword123!', showStrengthIndicator: false });

      expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument();
    });

    it('does not show strength indicator when password is empty', () => {
      renderBackupPasswordInput({ value: '' });

      expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument();
    });

    it('shows progress bar', () => {
      renderBackupPasswordInput({ value: 'TestPassword123!' });

      expect(screen.getByLabelText('Password strength')).toBeInTheDocument();
    });
  });

  describe('Password validation', () => {
    it('calls onValidChange with true when passwords match and are strong enough', async () => {
      const onValidChange = vi.fn();
      renderBackupPasswordInput({
        value: 'TestPass123!',
        confirmValue: 'TestPass123!',
        onValidChange,
        minStrength: 4,
      });

      await waitFor(() => {
        expect(onValidChange).toHaveBeenCalledWith(true);
      });
    });

    it('calls onValidChange with false when passwords do not match', async () => {
      const onValidChange = vi.fn();
      renderBackupPasswordInput({
        value: 'TestPass123!',
        confirmValue: 'DifferentPass',
        onValidChange,
      });

      await waitFor(() => {
        expect(onValidChange).toHaveBeenCalledWith(false);
      });
    });

    it('calls onValidChange with false when password is too weak', async () => {
      const onValidChange = vi.fn();
      renderBackupPasswordInput({
        value: 'weak',
        confirmValue: 'weak',
        onValidChange,
        minStrength: 3,
      });

      await waitFor(() => {
        expect(onValidChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('Password mismatch error', () => {
    it('shows mismatch error after confirm field is touched', () => {
      const { container } = renderBackupPasswordInput({
        value: 'TestPassword',
        confirmValue: 'Different',
      });

      // Mantine PasswordInput has an inner input, find it by container query
      const confirmInput = container.querySelectorAll('input[type="password"]')[1];
      fireEvent.blur(confirmInput!);

      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });

    it('does not show mismatch error when confirm is empty', () => {
      const { container } = renderBackupPasswordInput({
        value: 'TestPassword',
        confirmValue: '',
      });

      const confirmInput = container.querySelectorAll('input[type="password"]')[1];
      fireEvent.blur(confirmInput!);

      expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
    });

    it('does not show mismatch error when passwords match', () => {
      const { container } = renderBackupPasswordInput({
        value: 'TestPassword',
        confirmValue: 'TestPassword',
      });

      const confirmInput = container.querySelectorAll('input[type="password"]')[1];
      fireEvent.blur(confirmInput!);

      expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
    });
  });

  describe('Input handling', () => {
    it('calls onChange when password is typed', () => {
      const onChange = vi.fn();
      const { container } = renderBackupPasswordInput({ onChange });

      const passwordInput = container.querySelectorAll('input[type="password"]')[0];
      fireEvent.change(passwordInput!, { target: { value: 'newpass' } });

      expect(onChange).toHaveBeenCalledWith('newpass');
    });

    it('calls onConfirmChange when confirmation is typed', () => {
      const onConfirmChange = vi.fn();
      const { container } = renderBackupPasswordInput({ onConfirmChange });

      const confirmInput = container.querySelectorAll('input[type="password"]')[1];
      fireEvent.change(confirmInput!, { target: { value: 'newpass' } });

      expect(onConfirmChange).toHaveBeenCalledWith('newpass');
    });
  });

  describe('Accessibility', () => {
    it('has required attribute on both inputs', () => {
      const { container } = renderBackupPasswordInput();

      const inputs = container.querySelectorAll('input[type="password"]');
      expect(inputs[0]).toHaveAttribute('required');
      expect(inputs[1]).toHaveAttribute('required');
    });

    it('renders strength indicator with proper id for aria-describedby', () => {
      renderBackupPasswordInput({ value: 'TestPassword', showStrengthIndicator: true });

      // The strength indicator should have id="password-strength"
      expect(document.getElementById('password-strength')).toBeInTheDocument();
    });
  });
});
