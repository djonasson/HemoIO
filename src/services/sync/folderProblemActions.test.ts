import { describe, it, expect } from 'vitest';
import { createCredentialsV2 } from '@data/encryption/keyWrapping';
import { assessFolderCopy } from './folderCopy';
import { sealEnvelope } from './folderEnvelope';
import { folderCopyProblemActions, folderSyncIssueActions } from './folderProblemActions';
import { FOLDER_SYNC_FILE_VERSION, isReplaceableFolderCopy, REPLACEABLE } from './folderSync';

describe('folderCopyProblemActions', () => {
  it.each([
    ['before-loinc', { chooseFolder: true, replace: 'replace', tryAgain: false }],
    ['not-a-copy', { chooseFolder: true, replace: 'replace', tryAgain: false }],
    ['damaged-copy', { chooseFolder: true, replace: 'replace', tryAgain: false }],
    // Damaged, or another password: replacing it may stop someone else's sync
    ['cannot-decrypt', { chooseFolder: true, replace: 'warn', tryAgain: false }],
    // Other computers may still sync from it: Start over is the way to join it
    ['another-setup', { chooseFolder: true, replace: false, tryAgain: false }],
    // Updating HemoIO restores it
    ['newer-version', { chooseFolder: false, replace: false, tryAgain: false }],
    ['read-failed', { chooseFolder: true, replace: false, tryAgain: true }],
  ] as const)('%s', (reason, actions) => {
    expect(folderCopyProblemActions(reason)).toEqual(actions);
  });
});

describe('folderSyncIssueActions', () => {
  it.each([
    ['before-loinc', { chooseFolder: true, replace: 'replace', tryAgain: false }],
    // The sync cannot tell a damaged copy from one under another key
    ['unreadable', { chooseFolder: true, replace: 'warn', tryAgain: false }],
    ['another-setup', { chooseFolder: true, replace: false, tryAgain: false }],
    ['newer', { chooseFolder: false, replace: false, tryAgain: false }],
    ['empty', { chooseFolder: false, replace: false, tryAgain: false }],
    ['set-aside', { chooseFolder: false, replace: false, tryAgain: false }],
    ['failed', { chooseFolder: false, replace: false, tryAgain: false }],
  ] as const)('%s', (issue, actions) => {
    expect(folderSyncIssueActions(issue)).toEqual(actions);
  });
});

describe('the one replace policy', () => {
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
  const fileOf = (text: string): ArrayBuffer => encode(text).buffer as ArrayBuffer;
  const newKey = (): Promise<CryptoKey> =>
    crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const body = (version: number): string =>
    JSON.stringify({ version, exportedAt: '2026-10-29T08:30:00.000Z', revision: 'r1', data: { labResults: 'x' } });

  it('lets the sync write over only the problems the table lets the user replace', () => {
    expect([...REPLACEABLE].sort()).toEqual(['before-loinc', 'unreadable']);
  });

  it('agrees with the restore question about every kind of file', async () => {
    const key = await newKey();
    const other = await createCredentialsV2('Other-Passw0rd!', 1000);
    const files: Record<string, ArrayBuffer> = {
      'another key': await sealEnvelope(encode(body(FOLDER_SYNC_FILE_VERSION)), await newKey(), null),
      'another setup': await sealEnvelope(encode(body(FOLDER_SYNC_FILE_VERSION)), other.key, other.credentials),
      'a damaged header': fileOf('{"format":"hemoio-folder-copy","version":1}'),
      'a newer envelope': fileOf('{"format":"hemoio-folder-copy","version":2,"sealed":"AAAA"}'),
      'a newer copy': await sealEnvelope(encode(body(FOLDER_SYNC_FILE_VERSION + 1)), key, null),
      'records that cannot be read': await sealEnvelope(encode(body(FOLDER_SYNC_FILE_VERSION)), key, null),
      'plaintext that is not JSON': await sealEnvelope(encode('not json'), key, null),
    };

    const seen = new Set<boolean>();
    for (const [label, bytes] of Object.entries(files)) {
      const assessment = await assessFolderCopy({ loadCurrent: async () => bytes }, key);
      const asked = assessment.kind === 'unreadable' ? assessment.replace !== false : false;
      expect({ label, replaceable: await isReplaceableFolderCopy(bytes, key, null) }).toEqual({
        label,
        replaceable: asked,
      });
      seen.add(asked);
    }
    // Both answers are covered
    expect(seen.size).toBe(2);
  });
});
