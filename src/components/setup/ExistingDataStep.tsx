/**
 * ExistingDataStep Component
 *
 * The first setup screen when the browser already holds HemoIO data whose
 * password lock is gone: setup never goes ahead over it without saying so.
 * Keeping it aside is the default; clearing it is confirmed first. Where
 * folders can be used, setup can also start from a folder copy: rows its key
 * opens become readable again, and the rest are kept aside.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle, IconArchive, IconFolderOpen, IconTrash } from '@tabler/icons-react';

export const EXISTING_DATA_TITLE = 'This browser already holds HemoIO data';

export interface ExistingDataStepProps {
  /** Set up anew; the unlock sweep keeps the old rows aside */
  onKeep: () => void;
  /** Delete the old rows, once the user has confirmed; throws if it fails */
  onClear: () => Promise<void>;
  /** Set up from a folder copy; offered only when given (where folders can be used) */
  onFolderCopy?: () => void;
}

export function ExistingDataStep({ onKeep, onClear, onFolderCopy }: ExistingDataStepProps): React.ReactNode {
  const headingId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);

  // The safe choice has focus, so Enter keeps the data
  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  const closeConfirmation = (): void => {
    if (isClearing) return;
    setConfirming(false);
    setClearFailed(false);
  };

  const handleClear = async (): Promise<void> => {
    setIsClearing(true);
    setClearFailed(false);
    try {
      await onClear();
      // Done either way: cleared, and setup goes on; or not, because another
      // tab finished setup meanwhile and its storage event takes this tab to
      // the login screen. Either way nothing is left to confirm.
      setIsClearing(false);
      setConfirming(false);
    } catch {
      // Fixed text: the error could name stored data
      setClearFailed(true);
      setIsClearing(false);
    }
  };

  return (
    <section aria-labelledby={headingId}>
      <Stack gap="lg">
        <Title order={2} id={headingId}>
          {EXISTING_DATA_TITLE}
        </Title>
        <Text>
          It was saved by an earlier setup whose password lock is gone, so this setup can't open
          it.
        </Text>
        <Group gap="sm">
          <Button ref={keepRef} leftSection={<IconArchive size={16} aria-hidden />} onClick={onKeep}>
            Keep it aside and set up anew
          </Button>
          <Button
            variant="outline"
            color="red"
            leftSection={<IconTrash size={16} aria-hidden />}
            onClick={() => setConfirming(true)}
          >
            Clear it and set up anew…
          </Button>
          {onFolderCopy && (
            <Button
              variant="default"
              leftSection={<IconFolderOpen size={16} aria-hidden />}
              onClick={onFolderCopy}
            >
              I already have a folder copy
            </Button>
          )}
        </Group>
      </Stack>

      <Modal
        opened={confirming}
        onClose={closeConfirmation}
        title="Clear the data in this browser?"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Every record stored in this browser is deleted, and this cannot be undone. Keep it aside
            instead if it might open later.
          </Text>
          {clearFailed && (
            <Alert role="alert" color="red" variant="light" icon={<IconAlertCircle size={16} />}>
              The data could not be cleared. Nothing was changed.
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeConfirmation} disabled={isClearing} data-autofocus>
              Cancel
            </Button>
            <Button color="red" onClick={handleClear} loading={isClearing}>
              Clear and set up anew
            </Button>
          </Group>
        </Stack>
      </Modal>
    </section>
  );
}
