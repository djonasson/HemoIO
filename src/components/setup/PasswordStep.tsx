import { useState, useCallback } from 'react';
import {
  Stack,
  PasswordInput,
  Text,
  Progress,
  List,
  ThemeIcon,
  Group,
} from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { checkPasswordStrength, type PasswordStrengthResult } from '@data/encryption';

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

  const getProgressColor = (score: number): string => {
    if (score <= 1) return 'red';
    if (score <= 2) return 'orange';
    if (score <= 3) return 'yellow';
    return 'green';
  };

  const getStrengthLabel = (score: number): string => {
    if (score <= 1) return 'Weak';
    if (score <= 2) return 'Fair';
    if (score <= 3) return 'Good';
    return 'Strong';
  };

  const strength = checkPasswordStrength(password);
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
        aria-describedby="password-requirements"
        autoFocus
        required
      />

      {password.length > 0 && (
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Password strength: {getStrengthLabel(strength.score)}
            </Text>
          </Group>
          <Progress
            value={(strength.score / 5) * 100}
            color={getProgressColor(strength.score)}
            size="sm"
            aria-label={`Password strength: ${getStrengthLabel(strength.score)}`}
          />
        </Stack>
      )}

      <div id="password-requirements">
        <Text size="sm" fw={500} mb="xs">
          Password requirements:
        </Text>
        <PasswordRequirements strength={strength} />
      </div>

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

interface PasswordRequirementsProps {
  strength: PasswordStrengthResult;
}

function PasswordRequirements({
  strength,
}: PasswordRequirementsProps): React.ReactNode {
  const requirements = [
    { label: 'At least 8 characters', met: strength.checks.minLength },
    { label: 'At least one uppercase letter', met: strength.checks.hasUppercase },
    { label: 'At least one lowercase letter', met: strength.checks.hasLowercase },
    { label: 'At least one number', met: strength.checks.hasNumber },
    { label: 'At least one special character', met: strength.checks.hasSpecial },
  ];

  return (
    <List spacing="xs" size="sm" center>
      {requirements.map((req) => (
        <List.Item
          key={req.label}
          icon={
            <ThemeIcon
              color={req.met ? 'green' : 'gray'}
              size="sm"
              radius="xl"
              aria-hidden="true"
            >
              {req.met ? <IconCheck size={12} /> : <IconX size={12} />}
            </ThemeIcon>
          }
        >
          <Text size="sm" c={req.met ? 'green' : 'dimmed'}>
            {req.label}
          </Text>
        </List.Item>
      ))}
    </List>
  );
}
