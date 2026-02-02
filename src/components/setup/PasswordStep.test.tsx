import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { PasswordStep } from './PasswordStep';
import { isPasswordStepValid } from './passwordUtils';

function renderWithMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('PasswordStep', () => {
  const defaultProps = {
    password: '',
    confirmPassword: '',
    onPasswordChange: vi.fn(),
    onConfirmPasswordChange: vi.fn(),
  };

  it('renders password and confirm password fields', () => {
    renderWithMantine(<PasswordStep {...defaultProps} />);

    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm your password')).toBeInTheDocument();
  });

  it('renders password requirements', () => {
    renderWithMantine(<PasswordStep {...defaultProps} />);

    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    expect(screen.getByText('At least one uppercase letter')).toBeInTheDocument();
    expect(screen.getByText('At least one lowercase letter')).toBeInTheDocument();
    expect(screen.getByText('At least one number')).toBeInTheDocument();
    expect(screen.getByText('At least one special character')).toBeInTheDocument();
  });

  it('calls onPasswordChange when password is entered', async () => {
    const onPasswordChange = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <PasswordStep {...defaultProps} onPasswordChange={onPasswordChange} />
    );

    const passwordInput = screen.getByPlaceholderText('Enter your password');
    await user.type(passwordInput, 'test');

    expect(onPasswordChange).toHaveBeenCalled();
  });

  it('calls onConfirmPasswordChange when confirm password is entered', async () => {
    const onConfirmPasswordChange = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <PasswordStep
        {...defaultProps}
        onConfirmPasswordChange={onConfirmPasswordChange}
      />
    );

    const confirmInput = screen.getByLabelText(/Confirm password/);
    await user.type(confirmInput, 'test');

    expect(onConfirmPasswordChange).toHaveBeenCalled();
  });

  it('shows password strength indicator when password is entered', () => {
    renderWithMantine(
      <PasswordStep {...defaultProps} password="MySecurePass123!" />
    );

    expect(screen.getByText(/Password strength:/)).toBeInTheDocument();
    // "Strong" is part of the same text node as "Password strength: "
    expect(screen.getByText(/Strong/)).toBeInTheDocument();
  });

  it('shows password mismatch error when passwords differ', () => {
    renderWithMantine(
      <PasswordStep
        {...defaultProps}
        password="Password123!"
        confirmPassword="Different123!"
      />
    );

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  it('does not show mismatch error when confirm password is empty', () => {
    renderWithMantine(
      <PasswordStep
        {...defaultProps}
        password="Password123!"
        confirmPassword=""
      />
    );

    expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
  });
});

describe('isPasswordStepValid', () => {
  it('returns false for weak password', () => {
    expect(isPasswordStepValid('weak', 'weak')).toBe(false);
  });

  it('returns false when passwords do not match', () => {
    expect(isPasswordStepValid('Strong123!', 'Different123!')).toBe(false);
  });

  it('returns false when confirm password is empty', () => {
    expect(isPasswordStepValid('Strong123!', '')).toBe(false);
  });

  it('returns true for strong matching passwords', () => {
    expect(isPasswordStepValid('MySecurePass123!', 'MySecurePass123!')).toBe(true);
  });
});
