import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

function renderMeter(password: string) {
  return render(
    <MantineProvider env="test">
      <PasswordStrengthMeter password={password} />
    </MantineProvider>
  );
}

describe('PasswordStrengthMeter', () => {
  it('lists the requirements without a strength bar while the password is empty', () => {
    renderMeter('');

    expect(screen.getByText('Password requirements:')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByText(/Password strength:/)).not.toBeInTheDocument();
  });

  it('labels a weak password', () => {
    renderMeter('abc');

    expect(screen.getByText('Password strength: Weak')).toBeInTheDocument();
    expect(screen.getByLabelText('Password strength: Weak')).toBeInTheDocument();
  });

  it('labels a strong password', () => {
    renderMeter('Str0ng-Passw0rd!');

    expect(screen.getByText('Password strength: Strong')).toBeInTheDocument();
  });

  it('marks each requirement as met or not with an icon and text', () => {
    renderMeter('abcdefgh');

    const list = screen.getByRole('list');
    expect(within(list).getByText('At least 8 characters')).toBeInTheDocument();
    expect(within(list).getByText('At least one lowercase letter')).toBeInTheDocument();
    expect(within(list).getByText('At least one uppercase letter')).toBeInTheDocument();
    expect(within(list).getByText('At least one number')).toBeInTheDocument();
    expect(within(list).getByText('At least one special character')).toBeInTheDocument();
  });
});
