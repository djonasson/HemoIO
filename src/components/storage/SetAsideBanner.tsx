/**
 * SetAsideBanner Component
 *
 * Tells the user how many stored records HemoIO cannot open, never what they
 * hold, and offers the two ways to settle them: a sealed download, or a
 * delete the user confirms first.
 */

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconLockQuestion, IconTrash } from '@tabler/icons-react';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import { pluralize } from '@/utils/pluralize';
import { recordCount } from './setAsideCopy';
import type { SealedDownload } from '@hooks/useSetAsideRecords';

export interface SetAsideBannerProps {
  /** How many records are kept aside; the banner shows only when there are some */
  total: number;
  /** How many of them are not saved to a file yet */
  unsaved: number;
  /** Whether the data is synced to a folder, which waits for the unsaved ones */
  folderStorageOn: boolean;
  onDownload: () => Promise<SealedDownload>;
  /** The user says a plain download saved: the rows of that file */
  onConfirmSaved: (ids: number[]) => Promise<void>;
  /** The IDs set aside now, which the delete confirmation counts */
  onSnapshot: () => Promise<number[]>;
  /** Delete the rows the confirmation counted, and no others */
  onDelete: (ids: number[]) => Promise<void>;
}

/**
 * Where focus goes once the banner's delete is done: the main content, which
 * every view has (a view's first heading may be one of its sections)
 */
function focusMainContent(main: HTMLElement | null): void {
  if (!main) return;
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus();
}

export function SetAsideBanner({
  total,
  unsaved,
  folderStorageOn,
  onDownload,
  onConfirmSaved,
  onSnapshot,
  onDelete,
}: SetAsideBannerProps): React.ReactNode {
  // The rows the open delete confirmation counts; null while it is closed
  const [deleteIds, setDeleteIds] = useState<number[] | null>(null);
  // The rows of a plain download, until the user says whether it saved
  const [unconfirmedIds, setUnconfirmedIds] = useState<number[] | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [justDeleted, setJustDeleted] = useState(false);
  // False from a delete until the confirmation opens again. Kept apart from
  // justDeleted, which the focus effect resets at once: the dialog hands
  // focus back as its close transition ends, later, and must not then
  // take it from the main content to a button that is gone
  const [returnFocus, setReturnFocus] = useState(true);
  const bannerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!justDeleted || deleteIds !== null) return;
    setJustDeleted(false);
    // The banner, and the button that opened the confirmation, may be gone
    focusMainContent(mainRef.current);
  }, [justDeleted, deleteIds]);

  const handleDownload = async (): Promise<void> => {
    setIsDownloading(true);
    try {
      const result = await onDownload();
      setUnconfirmedIds(result.outcome === 'unconfirmed' ? result.ids : null);
      if (result.outcome === 'unrecorded') {
        notifications.show({
          title: 'Sealed file saved, but not recorded',
          message:
            'The sealed file was saved, but HemoIO could not record that, so it still counts ' +
            'these records as not saved. Download them again.',
          color: 'yellow',
        });
      }
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

  const handleConfirmSaved = async (): Promise<void> => {
    if (!unconfirmedIds) return;
    try {
      await onConfirmSaved(unconfirmedIds);
      setUnconfirmedIds(null);
    } catch (err) {
      notifySaveFailed('Not marked as saved', err);
    }
  };

  const handleOpenDelete = async (): Promise<void> => {
    mainRef.current = bannerRef.current?.closest('main') ?? null;
    try {
      const ids = await onSnapshot();
      if (ids.length > 0) {
        setReturnFocus(true);
        setDeleteIds(ids);
      }
    } catch {
      console.error('Could not list the records kept aside');
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteIds) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteIds);
      // The banner and the dialog go away: say what was done, politely
      notifications.show({
        title: 'Unreadable records deleted',
        message: `${recordCount(deleteIds.length)} deleted.`,
        role: 'status',
      });
      setUnconfirmedIds(null);
      setJustDeleted(true);
      setReturnFocus(false);
      setDeleteIds(null);
    } catch (err) {
      notifySaveFailed('Unreadable records not deleted', err, 'They are still kept aside.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (total === 0 && deleteIds === null) return null;

  return (
    <>
      {total > 0 && (
        // The title is a child, not Alert's title: Alert would name the
        // region by its title, over the aria-label
        <Alert
          ref={bannerRef}
          role="region"
          aria-label="Unreadable records"
          color="yellow"
          variant="light"
          icon={<IconLockQuestion size={20} aria-hidden />}
          mb="md"
        >
          <Stack gap="xs">
            <Text fw={700} size="sm">
              {`${pluralize(total, 'stored record')} can't be opened`}
            </Text>
            <Text size="sm">
              They were saved with a different key, or are damaged. HemoIO keeps them aside and
              does not delete them. You can download them as a sealed file or delete them.
              {folderStorageOn && unsaved > 0 && (
                <> Folder sync is paused until you download or delete them.</>
              )}
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
                onClick={handleOpenDelete}
              >
                Delete…
              </Button>
            </Group>
            {/* The browser does not say whether a download was kept */}
            <div role="status">
              {unconfirmedIds && (
                <Group gap="sm">
                  <Text size="sm">Did the file save?</Text>
                  <Button size="xs" variant="light" onClick={handleConfirmSaved}>
                    Yes, I saved it
                  </Button>
                  <Button size="xs" variant="subtle" onClick={() => setUnconfirmedIds(null)}>
                    Not yet
                  </Button>
                </Group>
              )}
            </div>
          </Stack>
        </Alert>
      )}

      <Modal
        opened={deleteIds !== null}
        onClose={() => {
          if (!isDeleting) setDeleteIds(null);
        }}
        title="Delete unreadable records?"
        // After a delete, focus goes to the main content instead
        returnFocus={returnFocus}
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
              onClick={() => setDeleteIds(null)}
              disabled={isDeleting}
              data-autofocus
            >
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete} loading={isDeleting}>
              Delete {recordCount(deleteIds?.length ?? 0)}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
