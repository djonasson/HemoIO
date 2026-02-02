/**
 * BackupPasswordInput Component
 *
 * Password input with strength indicator for backup encryption.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Stack,
  PasswordInput,
  Progress,
  Text,
  List,
  ThemeIcon,
} from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { checkPasswordStrength } from '@data/encryption';

/**
 * Props for BackupPasswordInput component
 */
export interface BackupPasswordInputProps {
  /** Current password value */
  value: string;
  /** Called when password changes */
  onChange: (value: string) => void;
  /** Confirmation password value */
  confirmValue: string;
  /** Called when confirmation password changes */
  onConfirmChange: (value: string) => void;
  /** Whether passwords match and are strong enough */
  onValidChange?: (isValid: boolean) => void;
  /** Whether the inputs are disabled */
  disabled?: boolean;
  /** Label for the password field */
  label?: string;
  /** Label for the confirmation field */
  confirmLabel?: string;
  /** Whether to show the strength indicator */
  showStrengthIndicator?: boolean;
  /** Minimum required strength score (0-5) */
  minStrength?: number;
}

/**
 * Get color for strength indicator
 */
function getStrengthColor(score: number): string {
  if (score <= 1) return 'red';
  if (score <= 2) return 'orange';
  if (score <= 3) return 'yellow';
  if (score <= 4) return 'lime';
  return 'green';
}

/**
 * Get progress value for strength indicator
 */
function getStrengthProgress(score: number): number {
  return (score / 5) * 100;
}

/**
 * BackupPasswordInput component for encrypted backup passwords
 */
export function BackupPasswordInput({
  value,
  onChange,
  confirmValue,
  onConfirmChange,
  onValidChange,
  disabled = false,
  label = 'Backup Password',
  confirmLabel = 'Confirm Password',
  showStrengthIndicator = true,
  minStrength = 3,
}: BackupPasswordInputProps): React.ReactNode {
  const [touched, setTouched] = useState({ password: false, confirm: false });

  // Calculate password strength as derived state (useMemo instead of useState + useEffect)
  const strength = useMemo(() => {
    if (value) {
      return checkPasswordStrength(value);
    }
    return null;
  }, [value]);

  // Calculate validity and notify parent
  useEffect(() => {
    if (onValidChange) {
      const passwordsMatch = value === confirmValue && value.length > 0;
      const isStrongEnough = strength ? strength.score >= minStrength : false;
      onValidChange(passwordsMatch && isStrongEnough);
    }
  }, [value, confirmValue, strength, minStrength, onValidChange]);

  const handlePasswordChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
    },
    [onChange]
  );

  const handleConfirmChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onConfirmChange(event.target.value);
    },
    [onConfirmChange]
  );

  const handlePasswordBlur = useCallback(() => {
    setTouched((prev) => ({ ...prev, password: true }));
  }, []);

  const handleConfirmBlur = useCallback(() => {
    setTouched((prev) => ({ ...prev, confirm: true }));
  }, []);

  const passwordsMatch = value === confirmValue;
  const showMismatchError =
    touched.confirm && confirmValue.length > 0 && !passwordsMatch;

  return (
    <Stack gap="sm">
      <PasswordInput
        label={label}
        value={value}
        onChange={handlePasswordChange}
        onBlur={handlePasswordBlur}
        disabled={disabled}
        required
        aria-describedby={showStrengthIndicator ? 'password-strength' : undefined}
      />

      {showStrengthIndicator && value && strength && (
        <Stack gap="xs" id="password-strength">
          <Progress
            value={getStrengthProgress(strength.score)}
            color={getStrengthColor(strength.score)}
            size="sm"
            aria-label="Password strength"
          />
          <List size="xs" spacing="xs">
            <List.Item
              icon={
                <ThemeIcon
                  size={16}
                  radius="xl"
                  color={strength.checks.minLength ? 'green' : 'gray'}
                >
                  {strength.checks.minLength ? (
                    <IconCheck size={12} />
                  ) : (
                    <IconX size={12} />
                  )}
                </ThemeIcon>
              }
            >
              <Text size="xs" c={strength.checks.minLength ? 'green' : 'dimmed'}>
                At least 8 characters
              </Text>
            </List.Item>
            <List.Item
              icon={
                <ThemeIcon
                  size={16}
                  radius="xl"
                  color={strength.checks.hasUppercase ? 'green' : 'gray'}
                >
                  {strength.checks.hasUppercase ? (
                    <IconCheck size={12} />
                  ) : (
                    <IconX size={12} />
                  )}
                </ThemeIcon>
              }
            >
              <Text size="xs" c={strength.checks.hasUppercase ? 'green' : 'dimmed'}>
                Uppercase letter
              </Text>
            </List.Item>
            <List.Item
              icon={
                <ThemeIcon
                  size={16}
                  radius="xl"
                  color={strength.checks.hasLowercase ? 'green' : 'gray'}
                >
                  {strength.checks.hasLowercase ? (
                    <IconCheck size={12} />
                  ) : (
                    <IconX size={12} />
                  )}
                </ThemeIcon>
              }
            >
              <Text size="xs" c={strength.checks.hasLowercase ? 'green' : 'dimmed'}>
                Lowercase letter
              </Text>
            </List.Item>
            <List.Item
              icon={
                <ThemeIcon
                  size={16}
                  radius="xl"
                  color={strength.checks.hasNumber ? 'green' : 'gray'}
                >
                  {strength.checks.hasNumber ? (
                    <IconCheck size={12} />
                  ) : (
                    <IconX size={12} />
                  )}
                </ThemeIcon>
              }
            >
              <Text size="xs" c={strength.checks.hasNumber ? 'green' : 'dimmed'}>
                Number
              </Text>
            </List.Item>
            <List.Item
              icon={
                <ThemeIcon
                  size={16}
                  radius="xl"
                  color={strength.checks.hasSpecial ? 'green' : 'gray'}
                >
                  {strength.checks.hasSpecial ? (
                    <IconCheck size={12} />
                  ) : (
                    <IconX size={12} />
                  )}
                </ThemeIcon>
              }
            >
              <Text size="xs" c={strength.checks.hasSpecial ? 'green' : 'dimmed'}>
                Special character
              </Text>
            </List.Item>
          </List>
        </Stack>
      )}

      <PasswordInput
        label={confirmLabel}
        value={confirmValue}
        onChange={handleConfirmChange}
        onBlur={handleConfirmBlur}
        disabled={disabled}
        required
        error={showMismatchError ? 'Passwords do not match' : undefined}
      />
    </Stack>
  );
}
