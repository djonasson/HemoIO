/**
 * SetAsideBanner Component
 *
 * Tells the user how many stored records HemoIO cannot open, never what they
 * hold, and offers the two ways to settle them: a sealed download, or a
 * delete the user confirms first.
 */

import { useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconLockQuestion, IconTrash } from '@tabler/icons-react';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import { recordCount } from './setAsideCopy';

export interface SetAsideBannerProps {
  /** How many records are kept aside; the banner shows only when there are some */
  total: number;
  onDownload: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export function SetAsideBanner({ total, onDownload, onDelete }: SetAsideBannerProps): React.ReactNode {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDownload = async (): Promise<void> => {
    setIsDownloading(true);
    try {
      await onDownload();
    } catch {
      // Fixed text: the error could name stored data
      notifications.show({
        title: 'Sealed file not saved',
        message: 'The unreadable records could not be downloaded. They are still kept aside.',
        color: 'red',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    setIsDeleting(true);
    try {
      await onDelete();
      setConfirmingDelete(false);
    } catch (err) {
      notifySaveFailed('Unreadable records not deleted', err, 'They are still kept aside.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (total === 0 && !confirmingDelete) return null;

  return (
    <>
      {total > 0 && (
        // The title is a child, not Alert's title: Alert would name the
        // region by its title, over the aria-label
        <Alert
          role="region"
          aria-label="Unreadable records"
          color="yellow"
          variant="light"
          icon={<IconLockQuestion size={20} aria-hidden />}
          mb="md"
        >
          <Stack gap="xs">
            <Text fw={700} size="sm">
              {`${total} stored record${total === 1 ? '' : 's'} can't be opened`}
            </Text>
            <Text size="sm">
              They were saved with a different key, or are damaged. HemoIO keeps them aside and
              does not delete them. You can download them as a sealed file or delete them.
            </Text>
            <Group gap="sm">
              <Button
                size="xs"
                variant="light"
                leftSection={<IconDownload size={14} />}
                onClick={handleDownload}
                loading={isDownloading}
              >
                Download sealed file
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete…
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}

      <Modal
        opened={confirmingDelete}
        onClose={() => {
          if (!isDeleting) setConfirmingDelete(false);
        }}
        title="Delete unreadable records?"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            HemoIO cannot open these records, and once deleted they cannot be recovered, even with
            the key they were saved with. Download them as a sealed file first to keep a copy.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              onClick={() => setConfirmingDelete(false)}
              disabled={isDeleting}
              data-autofocus
            >
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete} loading={isDeleting}>
              Delete {recordCount(total)}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
