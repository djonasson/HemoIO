/**
 * ReplaceFolderCopyModal Component
 *
 * "Replace folder copy…" from the folder sync notice: asks first, then
 * keeps the copy as a dated backup and lets the next sync write over it.
 */

import { useState } from 'react';
import { Modal, Stack } from '@mantine/core';
import { ReplaceFolderCopyConfirm } from './ReplaceFolderCopyConfirm';

export interface ReplaceFolderCopyModalProps {
  opened: boolean;
  /** The copy may be someone else's (ReplaceFolderCopyConfirm) */
  warnOtherSetup: boolean;
  /** Keep the copy as a backup and choose to replace it; rejects, choosing nothing, when the backup fails */
  onReplace: () => Promise<void>;
  /** Back, Escape, or the replace done */
  onClose: () => void;
}

export function ReplaceFolderCopyModal({
  opened,
  warnOtherSetup,
  onReplace,
  onClose,
}: ReplaceFolderCopyModalProps): React.ReactNode {
  const [isReplacing, setIsReplacing] = useState(false);
  const [failed, setFailed] = useState(false);

  const close = (): void => {
    if (isReplacing) return;
    setFailed(false);
    onClose();
  };

  const handleConfirm = async (): Promise<void> => {
    setIsReplacing(true);
    setFailed(false);
    try {
      await onReplace();
    } catch {
      // Not shown: the reason could name the folder, and nothing was chosen
      setFailed(true);
      return;
    } finally {
      setIsReplacing(false);
    }
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Replace the folder copy?"
      withCloseButton={false}
      closeOnClickOutside={false}
      centered
    >
      <Stack gap="md">
        <ReplaceFolderCopyConfirm
          folder="your folder"
          warnOtherSetup={warnOtherSetup}
          isReplacing={isReplacing}
          failed={failed}
          onBack={close}
          onConfirm={() => void handleConfirm()}
        />
      </Stack>
    </Modal>
  );
}
