/**
 * Password strength bar, label and requirements checklist.
 * Used by the setup wizard and by Settings → Security.
 */

import { Stack, Text, Progress, List, ThemeIcon, Group, VisuallyHidden } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { checkPasswordStrength, type PasswordStrengthResult } from '@data/encryption';

export interface PasswordStrengthMeterProps {
  password: string;
}

/**
 * Bar colour for a score. Hues far apart also for colour-blind people:
 * orange, yellow, lime and green look alike to protanopes and deuteranopes.
 */
function getProgressColor(score: number): string {
  if (score <= 1) return 'red';
  if (score <= 2) return 'yellow';
  if (score <= 3) return 'teal';
  return 'blue';
}

function getStrengthLabel(score: number): string {
  if (score <= 1) return 'Weak';
  if (score <= 2) return 'Fair';
  if (score <= 3) return 'Good';
  return 'Strong';
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps): React.ReactNode {
  const strength = checkPasswordStrength(password);
  const label = getStrengthLabel(strength.score);

  return (
    <Stack gap="lg">
      {password.length > 0 && (
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Password strength: {label}
            </Text>
          </Group>
          <Progress
            value={(strength.score / 5) * 100}
            color={getProgressColor(strength.score)}
            size="sm"
            aria-label={`Password strength: ${label}`}
          />
        </Stack>
      )}

      <div>
        <Text size="sm" fw={500} mb="xs">
          Password requirements:
        </Text>
        <PasswordRequirements strength={strength} />
      </div>
    </Stack>
  );
}

interface PasswordRequirementsProps {
  strength: PasswordStrengthResult;
}

function PasswordRequirements({ strength }: PasswordRequirementsProps): React.ReactNode {
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
            <ThemeIcon color={req.met ? 'green' : 'gray'} size="sm" radius="xl" aria-hidden="true">
              {req.met ? <IconCheck size={12} /> : <IconX size={12} />}
            </ThemeIcon>
          }
        >
          <Text size="sm" c={req.met ? 'green' : 'dimmed'}>
            {req.label}
          </Text>
          {/* The icon and colour are visual only; this states it for screen readers */}
          <VisuallyHidden>{req.met ? ' (met)' : ' (not met)'}</VisuallyHidden>
        </List.Item>
      ))}
    </List>
  );
}
