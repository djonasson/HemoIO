/**
 * ReplaceFolderCopyModal Component
 *
 * "Replace folder copy…" from the folder sync notice or Settings: asks
 * first, then keeps the copy as a dated backup and lets the next sync write
 * over it. Keyed by its host per opening, so each starts afresh.
 */

import { Modal, Stack, getDefaultZIndex } from '@mantine/core';
import { useReplaceConfirm } from '@hooks/useReplaceConfirm';
import { ReplaceFolderCopyConfirm } from './ReplaceFolderCopyConfirm';

export interface ReplaceFolderCopyModalProps {
  opened: boolean;
  /** The copy may be someone else's (ReplaceFolderCopyConfirm) */
  warnOtherSetup: boolean;
  /**
   * Keep the copy as a backup and choose to replace it; rejects, choosing
   * nothing, when the backup fails. Resolves however it ended otherwise
   * (replaced, or the copy changed and the question is asked again).
   */
  onReplace: () => Promise<unknown>;
  /** Back, Escape, or the replace done */
  onClose: () => void;
}

export function ReplaceFolderCopyModal({
  opened,
  warnOtherSetup,
  onReplace,
  onClose,
}: ReplaceFolderCopyModalProps): React.ReactNode {
  const replacing = useReplaceConfirm();

  const close = (): void => {
    if (replacing.isReplacing) return;
    replacing.reset();
    onClose();
  };

  const handleConfirm = async (): Promise<void> => {
    if (await replacing.run(onReplace)) onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Replace the folder copy?"
      withCloseButton={false}
      closeOnClickOutside={false}
      centered
      // Above the notice it was opened from, which notifications otherwise draw over it
      zIndex={getDefaultZIndex('max')}
    >
      <Stack gap="md">
        <ReplaceFolderCopyConfirm
          folder="your folder"
          warnOtherSetup={warnOtherSetup}
          isReplacing={replacing.isReplacing}
          failed={replacing.failed}
          onBack={close}
          onConfirm={() => void handleConfirm()}
        />
      </Stack>
    </Modal>
  );
}
