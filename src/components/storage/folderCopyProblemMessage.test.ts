import { describe, it, expect } from 'vitest';
import { PRE_LOINC_BACKUP_MESSAGE } from '@services/import';
import type { FolderCopyProblem } from '@services/sync';
import { folderCopyProblemMessage } from './folderCopyProblemMessage';

describe('folderCopyProblemMessage', () => {
  const reasons: FolderCopyProblem[] = [
    'cannot-decrypt',
    'another-setup',
    'not-a-copy',
    'newer-version',
    'before-loinc',
    'read-failed',
  ];

  it.each(reasons)('explains %s', (reason) => {
    expect(folderCopyProblemMessage(reason, '“Health”').length).toBeGreaterThan(20);
  });

  it('names the folder', () => {
    expect(folderCopyProblemMessage('not-a-copy', '“Health”')).toBe(
      'The file in “Health” isn\'t a folder copy HemoIO can read, or it is damaged.'
    );
  });

  it('uses the shared message for a copy from before LOINC', () => {
    expect(folderCopyProblemMessage('before-loinc', 'x')).toBe(PRE_LOINC_BACKUP_MESSAGE);
  });
});
