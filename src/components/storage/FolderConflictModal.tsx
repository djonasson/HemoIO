/**
 * FolderConflictModal Component
 *
 * Asks which data to keep when the folder copy was changed on another
 * computer and this one has changes of its own. Shows counts and dates only,
 * never what the records hold. Whichever side is chosen, the other is kept
 * as a dated backup in the folder first; "Decide later" changes nothing.
 */

import { useId, useState } from 'react';
import { Alert, Button, Group, List, Modal, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { formatDateTime } from '@/utils/formatDateTime';
import { pluralize } from '@/utils/pluralize';
import type { FolderConflict, FolderConflictChoice } from '@hooks';
import type { FolderSide } from '@services/sync';

export interface FolderConflictModalProps {
  conflict: FolderConflict | null;
  /** Carry out the choice; rejects when the backup could not be saved, and nothing was changed */
  onResolve: (choice: FolderConflictChoice) => Promise<void>;
}

const TITLE = 'Your folder copy changed on another computer';

interface SideProps {
  heading: string;
  side: FolderSide;
  /** "Saved" for the folder copy, "Last changed" for this computer */
  dateLabel: string;
}

function Side({ heading, side, dateLabel }: SideProps): React.ReactNode {
  const headingId = useId();
  return (
    <Paper component="section" withBorder p="md" aria-labelledby={headingId}>
      <Stack gap="xs">
        <Title order={3} size="h5" id={headingId}>
          {heading}
        </Title>
        <List size="sm">
          <List.Item>{pluralize(side.labResults, 'lab result')}</List.Item>
          <List.Item>{pluralize(side.testValues, 'test value')}</List.Item>
          <List.Item>{pluralize(side.notes, 'note')}</List.Item>
        </List>
        {side.savedAt && (
          <Text size="sm">
            {dateLabel} {formatDateTime(side.savedAt)}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

export function FolderConflictModal({ conflict, onResolve }: FolderConflictModalProps): React.ReactNode {
  const [busy, setBusy] = useState<FolderConflictChoice | null>(null);
  const [failed, setFailed] = useState(false);
  // The last conflict stays on screen while the dialog closes; a new one starts afresh
  const [shown, setShown] = useState(conflict);
  if (conflict !== null && conflict !== shown) {
    setShown(conflict);
    setFailed(false);
  }

  const choose = async (choice: FolderConflictChoice): Promise<void> => {
    if (busy) return;
    setBusy(choice);
    setFailed(false);
    try {
      await onResolve(choice);
    } catch {
      // The reason is not shown: it could name stored data, and nothing changed either way
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const folder = shown?.folderName ? `“${shown.folderName}”` : 'your folder';

  return (
    <Modal
      opened={conflict !== null}
      // Escape is "Decide later", the choice that changes nothing; never while a choice is carried out
      onClose={() => void choose('later')}
      title={TITLE}
      withCloseButton={false}
      closeOnClickOutside={false}
      centered
      size="lg"
    >
      {shown && (
        <Stack gap="md">
          {shown.reason === 'empties' ? (
            <Text size="sm">
              The folder copy holds no lab results, while this computer does. It was saved on another
              computer after the copy this computer last saw, so they may have been deleted there.
              Choose which data to keep.
            </Text>
          ) : shown.reason === 'not-newer' ? (
            <Text size="sm">
              The folder copy is not a newer version of the one this computer last saw. It may be an
              older copy put back, one saved at the same time as this computer&apos;s, or one this
              computer has not seen the steps to. Choose which data to keep.
            </Text>
          ) : (
            <Text size="sm">
              The copy in {folder} was saved on another computer, and this computer has changes of
              its own. Choose which data to keep.
            </Text>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Side heading="In the folder" side={shown.folder} dateLabel="Saved" />
            <Side heading="On this computer" side={shown.browser} dateLabel="Last changed" />
          </SimpleGrid>
          <Text size="sm">The side you don&apos;t choose is kept as a dated backup in your folder.</Text>
          {failed && (
            <Alert role="alert" color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              Nothing was changed: the backup could not be saved to your folder.
            </Alert>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => void choose('later')}
              disabled={busy !== null}
              data-autofocus
            >
              Decide later
            </Button>
            <Button
              variant="default"
              onClick={() => void choose('browser')}
              loading={busy === 'browser'}
              disabled={busy !== null && busy !== 'browser'}
            >
              Keep this computer&apos;s data
            </Button>
            <Button
              onClick={() => void choose('folder')}
              loading={busy === 'folder'}
              disabled={busy !== null && busy !== 'folder'}
            >
              Load the folder copy
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
