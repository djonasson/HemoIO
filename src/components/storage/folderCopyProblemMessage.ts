/**
 * What a folder copy that cannot be read means for the user, in words: shown
 * where the folder copy is offered for restore, and where a dated backup is.
 */

import { PRE_LOINC_BACKUP_MESSAGE } from '@services/import';
import type { FolderCopyProblem } from '@services/sync';

export function folderCopyProblemMessage(reason: FolderCopyProblem, folder: string): string {
  switch (reason) {
    case 'cannot-decrypt':
      return (
        `The copy in ${folder} can't be opened with your password. It was saved with a ` +
        'different password or by an earlier setup of HemoIO, or the file is damaged.'
      );
    case 'another-setup':
      return (
        `The copy in ${folder} belongs to another HemoIO setup, made with a different key. ` +
        "HemoIO won't write over it. To use that folder on this computer, HemoIO must be " +
        "set up again from that folder's copy: in Settings > Security, choose Start over, " +
        'then "I already have a folder copy".'
      );
    case 'not-a-copy':
      return `The file in ${folder} isn't a folder copy HemoIO can read, or it is damaged.`;
    case 'newer-version':
      return (
        `The copy in ${folder} was saved by a newer version of HemoIO. ` +
        'Update HemoIO on this device to restore it.'
      );
    case 'before-loinc':
      return PRE_LOINC_BACKUP_MESSAGE;
    case 'read-failed':
      return `HemoIO couldn't read the file in ${folder}. Check that the folder is available.`;
  }
}
