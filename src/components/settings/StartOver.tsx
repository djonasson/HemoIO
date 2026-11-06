/**
 * StartOver Component
 *
 * Settings → Security: deletes this browser's HemoIO data and returns to
 * first run, after offering to export a backup and asking for the typed
 * confirmation word. The folder copy and folder backups are never touched,
 * nor are the records HemoIO could not open: a key recovered from a folder
 * copy may open them, so setup offers to recover, keep or clear them.
 */

import { useState } from 'react';
import { Anchor, Button, Group, Modal, Stack, Text, TextInput, Title } from '@mantine/core';
import { useAuth } from '@contexts';

const BODY =
  "Removes all of HemoIO's data from this browser. Your folder copy and folder backups are not " +
  'touched. Export a backup first if this browser has data you need.';

/** What the user types to confirm */
const CONFIRMATION_WORD = 'START OVER';

/** The records kept aside stay for setup; told with their count, as every restore confirmation does */
function setAsideNote(count: number): string {
  return count === 1
    ? '1 record HemoIO could not open stays aside; setup will offer to clear it.'
    : `${count} records HemoIO could not open stay aside; setup will offer to clear them.`;
}

export interface StartOverProps {
  /** Opens Settings > Data, where a backup is exported */
  onExportBackup: () => void;
  /** Records HemoIO cannot open: Start over keeps them aside for setup */
  setAsideCount?: number;
}

export function StartOver({ onExportBackup, setAsideCount = 0 }: StartOverProps): React.ReactNode {
  const { startOver } = useAuth();
  const [opened, setOpened] = useState(false);
  const [typed, setTyped] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  const open = (): void => {
    setTyped('');
    setOpened(true);
  };

  const close = (): void => {
    if (!isWorking) setOpened(false);
  };

  const exportFirst = (): void => {
    setOpened(false);
    onExportBackup();
  };

  const confirm = async (): Promise<void> => {
    if (typed !== CONFIRMATION_WORD || isWorking) return;
    setIsWorking(true);
    try {
      // The page reloads when it is done, failed or not; AuthContext logs a failure
      await startOver();
    } catch {
      // Logged by AuthContext
    } finally {
      // Should the reload not come, the dialog is not left spinning with Cancel off
      setIsWorking(false);
    }
  };

  const exportLink = (
    <Anchor component="button" type="button" size="sm" onClick={exportFirst}>
      Export a backup
    </Anchor>
  );

  return (
    <Stack gap="md" maw={480}>
      <Title order={4}>Start over</Title>
      <Text size="sm" c="dimmed">
        {BODY}
      </Text>
      <Group gap="lg">
        {exportLink}
        <Button color="red" variant="outline" onClick={open}>
          Start over
        </Button>
      </Group>

      <Modal
        opened={opened}
        onClose={close}
        title="Start over?"
        closeOnClickOutside={!isWorking}
        closeOnEscape={!isWorking}
        withCloseButton={!isWorking}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <Stack gap="md">
            <Text size="sm">{BODY}</Text>
            {setAsideCount > 0 && <Text size="sm">{setAsideNote(setAsideCount)}</Text>}
            {exportLink}
            <TextInput
              label={`Type ${CONFIRMATION_WORD} to confirm`}
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={isWorking}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close} disabled={isWorking} data-autofocus>
                Cancel
              </Button>
              <Button
                type="submit"
                color="red"
                disabled={typed !== CONFIRMATION_WORD}
                loading={isWorking}
              >
                Start over
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
