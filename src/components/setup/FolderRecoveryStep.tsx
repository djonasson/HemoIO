/**
 * FolderRecoveryStep Component
 *
 * Setting HemoIO up from a folder copy: choose the folder, enter the password
 * that made the copy, and HemoIO opens it with the lock kept beside it. The
 * password stays the same. A copy that does not open is explained, and
 * nothing is stored.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Group, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle, IconArrowLeft, IconFolderOpen, IconLockOpen } from '@tabler/icons-react';
import { folderCopyProblemMessage } from '@components/storage/folderCopyProblemMessage';
import type { FolderUnlockProblem } from '@services/sync';

export const FOLDER_RECOVERY_TITLE = 'Restore from your folder copy';

const CHOOSE_FAILED = "HemoIO couldn't open that folder. Choose it again.";
const RECOVER_FAILED = "HemoIO couldn't be set up from this copy. Nothing was stored. Please try again.";

export interface FolderRecoveryStepProps {
  /** The chosen folder's name; null until one is chosen */
  folderName: string | null;
  /** Shows the folder picker; throws when the folder cannot be opened */
  onChooseFolder: () => Promise<void>;
  /** Opens the copy with the password; a problem when it did not open */
  onRecover: (password: string) => Promise<FolderUnlockProblem | 'existing-locked' | null>;
  /** Back to the screen before this one */
  onBack: () => void;
}

function problemMessage(problem: FolderUnlockProblem, folderName: string | null): string {
  switch (problem) {
    case 'no-copy':
      return 'This folder has no HemoIO copy.';
    case 'no-lock':
      return (
        'This copy was saved before HemoIO kept the password lock in the folder. ' +
        'Only the browser that saved it can restore it.'
      );
    case 'wrong-password':
      return "That password doesn't open this copy.";
    default:
      return folderCopyProblemMessage(problem, folderName ? `“${folderName}”` : 'your folder');
  }
}

/** What is shown after an attempt, and where focus goes with it */
interface Shown {
  message: string;
  focus: 'password' | 'alert';
}

export function FolderRecoveryStep({
  folderName,
  onChooseFolder,
  onRecover,
  onBack,
}: FolderRecoveryStepProps): React.ReactNode {
  const headingId = useId();
  const chooseRef = useRef<HTMLButtonElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [password, setPassword] = useState('');
  const [isRecovering, setIsRecovering] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  // Guards against a second submit before React re-renders the disabled button
  const recoveringRef = useRef(false);

  // The first thing to do here
  useEffect(() => {
    chooseRef.current?.focus();
  }, []);

  // Each new problem moves focus: to the password to try again, else to the explanation
  useEffect(() => {
    if (!shown) return;
    (shown.focus === 'password' ? passwordRef : alertRef).current?.focus();
  }, [shown]);

  // No loading state: a disabled button would drop focus, and the picker is modal anyway
  const handleChoose = async (): Promise<void> => {
    try {
      await onChooseFolder();
      setShown(null);
    } catch {
      // Fixed text: the error could name the folder's path
      setShown({ message: CHOOSE_FAILED, focus: 'alert' });
    }
  };

  const canSubmit = folderName !== null && password !== '' && !isRecovering;

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit || recoveringRef.current) return;
    recoveringRef.current = true;
    setIsRecovering(true);
    try {
      const result = await onRecover(password);
      if (result === null || result === 'existing-locked') return;
      if (result === 'wrong-password') setPassword('');
      setShown({
        message: problemMessage(result, folderName),
        focus: result === 'wrong-password' ? 'password' : 'alert',
      });
    } catch {
      // Fixed text: never the error, which could carry key material
      setShown({ message: RECOVER_FAILED, focus: 'alert' });
    } finally {
      recoveringRef.current = false;
      setIsRecovering(false);
    }
  };

  return (
    <section aria-labelledby={headingId}>
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="lg">
          <Title order={2} id={headingId}>
            {FOLDER_RECOVERY_TITLE}
          </Title>
          <Text>
            Choose the folder HemoIO kept its copy in, and enter the password you used. HemoIO opens
            the copy with the password lock kept beside it. Your password stays the same.
          </Text>

          <Group gap="sm">
            <Button
              ref={chooseRef}
              type="button"
              variant="default"
              leftSection={<IconFolderOpen size={16} aria-hidden />}
              onClick={handleChoose}
              disabled={isRecovering}
            >
              Choose folder
            </Button>
            <Text size="sm" aria-live="polite">
              {folderName ? (
                <>
                  Folder: <strong>{folderName}</strong>
                </>
              ) : (
                'No folder chosen yet'
              )}
            </Text>
          </Group>

          <PasswordInput
            ref={passwordRef}
            label="Password you used"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            autoComplete="current-password"
          />

          {shown && (
            <Alert
              ref={alertRef}
              role="alert"
              tabIndex={-1}
              color="red"
              variant="light"
              icon={<IconAlertCircle size={16} aria-hidden />}
            >
              {shown.message}
            </Alert>
          )}

          <Group justify="space-between">
            <Button
              type="button"
              variant="default"
              leftSection={<IconArrowLeft size={16} aria-hidden />}
              onClick={onBack}
              disabled={isRecovering}
            >
              Back
            </Button>
            <Button
              type="submit"
              leftSection={<IconLockOpen size={16} aria-hidden />}
              disabled={!canSubmit}
              loading={isRecovering}
            >
              Unlock and restore
            </Button>
          </Group>
        </Stack>
      </form>
    </section>
  );
}
