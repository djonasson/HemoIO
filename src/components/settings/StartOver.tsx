/**
 * StartOver Component
 *
 * Settings → Security: deletes this browser's HemoIO data and returns to
 * first run, after offering to export a backup and asking for the typed
 * confirmation word. The folder copy and folder backups are never touched.
 */

import { useState } from 'react';
import { Alert, Anchor, Button, Group, Modal, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '@contexts';

const BODY =
  "Removes all of HemoIO's data from this browser. Your folder copy and folder backups are not " +
  'touched. Export a backup first if this browser has data you need.';

/** What the user types to confirm */
const CONFIRMATION_WORD = 'START OVER';

const FAILED =
  "Some of HemoIO's data couldn't be removed from this browser. Try again.";

export interface StartOverProps {
  /** Opens Settings > Data, where a backup is exported */
  onExportBackup: () => void;
}

export function StartOver({ onExportBackup }: StartOverProps): React.ReactNode {
  const { startOver } = useAuth();
  const [opened, setOpened] = useState(false);
  const [typed, setTyped] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = (): void => {
    setTyped('');
    setFailed(false);
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
    setFailed(false);
    try {
      // On success setup replaces Settings, so nothing more happens here
      await startOver();
    } catch {
      // AuthContext logs it, with no detail
      setFailed(true);
    } finally {
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
            {exportLink}
            <TextInput
              label={`Type ${CONFIRMATION_WORD} to confirm`}
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={isWorking}
            />
            {failed && (
              <Alert role="alert" color="red" icon={<IconAlertCircle size={16} />}>
                {FAILED}
              </Alert>
            )}
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
