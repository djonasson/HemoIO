import { useState, useCallback } from 'react';
import { Stack, PasswordInput, Text } from '@mantine/core';
import { PasswordStrengthMeter } from '@components/common/PasswordStrengthMeter';

interface PasswordStepProps {
  password: string;
  confirmPassword: string;
  onPasswordChange: (password: string) => void;
  onConfirmPasswordChange: (confirmPassword: string) => void;
}

export function PasswordStep({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
}: PasswordStepProps): React.ReactNode {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordsMatch = password === confirmPassword && password.length > 0;
  const showMismatchError = confirmPassword.length > 0 && !passwordsMatch;

  const handlePasswordChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onPasswordChange(event.target.value);
    },
    [onPasswordChange]
  );

  const handleConfirmPasswordChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onConfirmPasswordChange(event.target.value);
    },
    [onConfirmPasswordChange]
  );

  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        Create a strong password to protect your health data. This password will
        be used to encrypt all your lab results locally.
      </Text>

      <PasswordInput
        label="Password"
        placeholder="Enter your password"
        value={password}
        onChange={handlePasswordChange}
        visible={showPassword}
        onVisibilityChange={setShowPassword}
        autoFocus
        required
      />

      <PasswordStrengthMeter password={password} />

      <PasswordInput
        label="Confirm password"
        placeholder="Confirm your password"
        value={confirmPassword}
        onChange={handleConfirmPasswordChange}
        visible={showConfirmPassword}
        onVisibilityChange={setShowConfirmPassword}
        error={showMismatchError ? 'Passwords do not match' : undefined}
        required
      />
    </Stack>
  );
}
