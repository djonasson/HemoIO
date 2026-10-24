/**
 * ChangePassword Component
 *
 * Settings → Security form that changes the app password. The data key is
 * re-wrapped, so stored data and existing backups are untouched.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Stack, Title, Text, PasswordInput, Button, Alert } from '@mantine/core';
import { IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '@contexts';
import { useFormKeyboardSubmit } from '@hooks';
import { PasswordStrengthMeter } from '@components/common/PasswordStrengthMeter';
import { isPasswordStepValid } from '@components/setup/passwordUtils';

const WRONG_PASSWORD = 'Current password is incorrect';
const SAME_PASSWORD = 'New password must be different from your current password';

type Outcome = 'success' | 'failed' | null;

export function ChangePassword(): React.ReactNode {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  // Guards against a second submit before React re-renders the disabled button
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // After a wrong password the inputs are enabled again only on the next
  // render, so focus moves once the error has rendered
  useEffect(() => {
    if (currentError) currentRef.current?.focus();
  }, [currentError]);

  const isSame = newPassword.length > 0 && newPassword === currentPassword;
  const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    isPasswordStepValid(newPassword, confirmPassword) &&
    !isSame &&
    !isSubmitting;

  const { formRef } = useFormKeyboardSubmit({ canSubmit });

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!canSubmit || submittingRef.current) return;

      submittingRef.current = true;
      setIsSubmitting(true);
      setOutcome(null);
      setCurrentError(null);
      const result = await changePassword(currentPassword, newPassword);
      submittingRef.current = false;
      if (!mountedRef.current) return;

      setIsSubmitting(false);
      if (result.ok) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setOutcome('success');
      } else if (result.reason === 'wrong_password') {
        setCurrentError(WRONG_PASSWORD);
      } else if (result.reason === 'failed') {
        setOutcome('failed');
      }
      // same_password cannot be submitted: the form shows it live
    },
    [canSubmit, changePassword, currentPassword, newPassword]
  );

  return (
    <Stack gap="md" maw={480}>
      <Title order={4}>Change password</Title>
      <Text size="sm" c="dimmed">
        Your data stays encrypted. Changing your password does not affect existing backup files,
        which use their own backup password.
      </Text>

      {outcome === 'success' && (
        <Alert role="status" color="green" variant="light" icon={<IconCheck size={16} />}>
          Password changed. Use your new password next time you unlock HemoIO.
        </Alert>
      )}
      {outcome === 'failed' && (
        <Alert role="alert" color="red" variant="light" icon={<IconAlertCircle size={16} />}>
          Password could not be changed. Your existing password still works.
        </Alert>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          {/* Mantine marks errors with data-invalid only; aria-invalid tells screen readers */}
          <PasswordInput
            ref={currentRef}
            label="Current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.currentTarget.value);
              setCurrentError(null);
            }}
            error={currentError ?? undefined}
            aria-invalid={currentError !== null}
            disabled={isSubmitting}
          />
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.currentTarget.value)}
            error={isSame ? SAME_PASSWORD : undefined}
            aria-invalid={isSame}
            disabled={isSubmitting}
          />
          <PasswordStrengthMeter password={newPassword} />
          <PasswordInput
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            error={confirmMismatch ? 'Passwords do not match' : undefined}
            aria-invalid={confirmMismatch}
            disabled={isSubmitting}
          />
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={!canSubmit && !isSubmitting}
            style={{ alignSelf: 'flex-start' }}
          >
            Change password
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
