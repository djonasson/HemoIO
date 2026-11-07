import { describe, it, expect } from 'vitest';
import { folderCopyProblemActions, folderSyncIssueActions } from './folderProblemActions';

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
