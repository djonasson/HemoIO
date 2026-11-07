/**
 * E2E Tests for restoring from the folder copy
 *
 * See features/restore-from-folder.feature
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { TEST_PASSWORD, setupOrUnlock, unlockApp } from './steps/app.steps';
import { SEED_LAB_RESULTS, seedLabData } from './steps/data.steps';
import { lockApp } from './steps/changePassword.steps';
import {
  FOLDER_NAME,
  FolderRestoreDialog,
  canReadFolderAgain,
  expectCurrentFolder,
  failFolderReads,
  folderCopyHash,
  folderPermissionQueries,
  forgetFolderPermission,
  grantFolderAccess,
  installFolderPicker,
  pickNext,
  switchToFolderStorage,
  writeForeignFolderCopy,
} from './steps/folderRestore.steps';
import { FOLDER_COPY, loseBrowserData } from './steps/folderSync.steps';
import { FOLDER_BACKUPS, folderBackupNames, folderFileBody, folderFileHeader } from './steps/otherComputer.steps';

/**
 * Background: folder storage on, holding a copy of two lab results, three
 * test values and one note. The data is in the browser first, so the copy is
 * written once, by the sync that starts when the folder is chosen. Returns
 * the copy's fingerprint.
 */
async function folderWithCopy(page: Page): Promise<string> {
  // The test's own clock, so it can skip ahead to the periodic sync
  await page.clock.install();
  await installFolderPicker(page);
  await page.goto('/');
  await setupOrUnlock(page);
  await seedLabData(page, {
    userNotes: [
      {
        id: 1,
        labResultId: 1,
        content: 'Fasting',
        tags: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ],
  });
  await switchToFolderStorage(page);
  await expect.poll(() => folderCopyHash(page)).not.toBeNull();
  return (await folderCopyHash(page))!;
}

const LATER_RESULT = {
  id: 99,
  date: '2024-06-06T09:00:00.000Z',
  labName: 'New Clinic',
  createdAt: '2024-06-06T09:00:00.000Z',
  updatedAt: '2024-06-06T09:00:00.000Z',
};

/**
 * Then the folder copy should not have been changed — not even by the
 * periodic sync, which a held sync must skip too
 */
async function expectFolderCopyUnchanged(page: Page, hash: string | null): Promise<void> {
  // The check made at unlock asks about permission too: counted once it is done
  let queries = -1;
  await expect
    .poll(async () => {
      const before = queries;
      queries = await folderPermissionQueries(page);
      return queries > 0 && queries === before;
    })
    .toBe(true);
  await page.clock.fastForward('00:31');
  // A sync the timer started would have asked about permission by now
  expect(await folderPermissionQueries(page)).toBe(queries);
  expect(await folderCopyHash(page)).toBe(hash);
}

/**
 * Given the folder copy was saved before tests were identified by LOINC: the
 * app writes format 4, so have it seal format 3 instead, as an earlier version
 * did, under this user's own key
 */
async function sealAsPreLoinc(page: Page): Promise<void> {
  await sealAsVersion(page, 3);
}

/** Given the folder copy was saved by a newer version of HemoIO: format 5 */
async function sealAsNewer(page: Page): Promise<void> {
  await sealAsVersion(page, 5);
}

const SEAL_AS_KEY = 'e2e-seal-as';

/** Have the app seal its folder copy in another format version, until sealAsCurrent */
async function sealAsVersion(page: Page, version: number): Promise<void> {
  await page.addInitScript(
    ({ version, key }) => {
      const encode = TextEncoder.prototype.encode;
      TextEncoder.prototype.encode = function (input?: string): Uint8Array<ArrayBuffer> {
        const text =
          typeof input === 'string' && sessionStorage.getItem(key) !== 'off'
            ? input.replace(/^\{"version":4,/, `{"version":${version},`)
            : input;
        return encode.call(this, text) as Uint8Array<ArrayBuffer>;
      };
    },
    { version, key: SEAL_AS_KEY }
  );
}

/** The app seals its folder copy in its own format again */
async function sealAsCurrent(page: Page): Promise<void> {
  await page.evaluate((key) => sessionStorage.setItem(key, 'off'), SEAL_AS_KEY);
}

/** Then my folder should hold a new folder copy that my password opens */
async function expectFreshCopy(page: Page, replaced: string | null): Promise<void> {
  await expect.poll(() => folderCopyHash(page)).not.toBe(replaced);
  const body = await folderFileBody(page, FOLDER_COPY, TEST_PASSWORD);
  expect(body.version).toBe(4);
  // Built on nothing: no one saw the file it replaced
  expect(body.ancestors).toEqual([]);
  expect(await folderFileHeader(page, FOLDER_COPY)).toMatchObject({ format: 'hemoio-folder-copy' });
}

/** The one dated backup in the folder, by name */
async function onlyBackup(page: Page): Promise<string> {
  const names = await folderBackupNames(page, FOLDER_NAME);
  expect(names).toEqual([expect.stringMatching(/^hemoio-backup-\d{8}T\d{9}Z\.encrypted$/)]);
  return `${FOLDER_BACKUPS}/${names[0]}`;
}

test.describe('Restore from the folder copy', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Folder storage needs the File System Access API, which only Chromium has'
  );

  test('offers the folder copy when the browser has lost its data', async ({ page }) => {
    const hash = await folderWithCopy(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.offer()).toBeVisible();
    await expect(dialog.dialog).toContainText(FOLDER_NAME);
    await expect(dialog.dialog).toContainText('2 lab results');
    await expect(dialog.dialog).toContainText('3 test values');
    await expect(dialog.dialog).toContainText('1 note');
    await expect(dialog.dialog).toContainText(/Saved .*\d{4}/);
    await expectFolderCopyUnchanged(page, hash);
  });

  test('restores the folder copy, and saves the restored data to the folder', async ({ page }) => {
    await folderWithCopy(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await dialog.restore.click();
    await expect(dialog.dialog).toBeHidden();
    await expect(page.getByText(SEED_LAB_RESULTS[0].labName).first()).toBeVisible();

    // What reached the folder after the restore is the restored data
    await loseBrowserData(page);
    await unlockApp(page);
    await expect(dialog.offer()).toContainText('2 lab results');
  });

  test('"Not now" writes nothing and asks again at the next unlock, by keyboard', async ({ page }) => {
    const hash = await folderWithCopy(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.offer()).toBeVisible();
    await dialog.notNow.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.dialog).toBeHidden();

    // A restore of another backup in the meantime does not reach the folder
    await seedLabData(page);
    await expectFolderCopyUnchanged(page, hash);

    await lockApp(page);
    await loseBrowserData(page);
    await unlockApp(page);
    await expect(dialog.offer()).toBeVisible();
    await expectFolderCopyUnchanged(page, hash);
  });

  test('replacing the folder copy asks first, then saves to the folder again', async ({ page }) => {
    const original = await folderWithCopy(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await dialog.replace.click();
    await expect(dialog.dialog).toContainText('will be replaced');
    await expect(dialog.dialog).toContainText('kept as a dated backup');
    await dialog.confirmReplace.click();
    await expect(dialog.dialog).toBeHidden();
    // The copy offered is kept first, without the lock
    const names = await folderBackupNames(page, FOLDER_NAME);
    expect(names).toEqual([expect.stringMatching(/^hemoio-backup-\d{8}T\d{9}Z\.encrypted$/)]);
    expect(await folderFileHeader(page, `${FOLDER_BACKUPS}/${names[0]}`, FOLDER_NAME)).toMatchObject({
      lock: null,
    });

    // From now on saves reach the folder: a one-result backup replaces the copy
    await seedLabData(page, { labResults: [SEED_LAB_RESULTS[0]], testValues: [] });
    // The save reaches the folder after the restore: data lost before it is lost from both.
    // The first change of the copy is this save, because the sync right after "Replace"
    // never writes empty data over a copy that has some (writeFolderCopy in folderSync.ts)
    await expect.poll(() => folderCopyHash(page)).not.toBe(original);
    await loseBrowserData(page);
    await unlockApp(page);
    await expect(dialog.offer()).toContainText('1 lab result');
  });

  test('a copy from another setup is explained, not offered or changed', async ({ page }) => {
    // Scenario: Folder copy from another setup
    await folderWithCopy(page);
    await writeForeignFolderCopy(page, 'another-setup');
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.unreadable()).toBeVisible();
    await expect(dialog.dialog).toContainText(
      `The copy in “${FOLDER_NAME}” belongs to another HemoIO setup, made with a different key.`
    );
    await expect(dialog.dialog).toContainText(
      "HemoIO must be set up again from that folder's copy"
    );
    await expect(dialog.restore).toHaveCount(0);
    // Other computers may still sync from it
    await expect(dialog.replace).toHaveCount(0);
    await expect(dialog.chooseFolder).toBeVisible();
    await expect(dialog.notNow).toBeFocused();
    await expectFolderCopyUnchanged(page, hash);
  });

  test('an older copy saved with another key is reported, not offered for restore or changed', async ({ page }) => {
    // Scenario: Older folder copy saved with another key
    await folderWithCopy(page);
    await writeForeignFolderCopy(page, 'legacy-other-key');
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.unreadable()).toBeVisible();
    await expect(dialog.dialog).toContainText('different password');
    await expect(dialog.restore).toHaveCount(0);
    await expect(dialog.dialog).toContainText('choose another folder, or replace the folder copy');
    await expect(dialog.replace).toBeVisible();
    await expect(dialog.chooseFolder).toBeVisible();
    await expectFolderCopyUnchanged(page, hash);
  });

  test('a copy saved with another key is replaced only once confirmed, after a warning, and kept sealed', async ({
    page,
  }) => {
    // Scenario: Replace a folder copy that cannot be opened with my password
    await folderWithCopy(page);
    await writeForeignFolderCopy(page, 'legacy-other-key');
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await dialog.replace.click();
    await expect(dialog.dialog).toHaveAccessibleName('Replace the folder copy?');
    await expect(dialog.dialog).toContainText('will be replaced');
    await expect(dialog.dialog).toContainText('kept as a dated backup');
    await expect(dialog.dialog).toContainText(
      "If the copy was made with another password or by someone else's HemoIO setup, their data will no longer sync from this folder."
    );
    await expect(dialog.back).toBeFocused();
    await dialog.confirmReplace.click();
    await expect(dialog.dialog).toBeHidden();

    // The old file is kept whole, sealed with this key: no lock in plain text
    const backup = await onlyBackup(page);
    expect(await folderFileHeader(page, backup)).toEqual({ format: 'hemoio-damaged-copy', version: 1, lock: null });
    await expectFreshCopy(page, hash);
  });

  test('a damaged copy is reported and left alone', async ({ page }) => {
    await folderWithCopy(page);
    await writeForeignFolderCopy(page, 'damaged');
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.unreadable()).toBeVisible();
    await expect(dialog.dialog).toContainText('damaged');
    await expect(dialog.replace).toBeVisible();
    await expect(dialog.chooseFolder).toBeVisible();
    await dialog.notNow.click();
    await expectFolderCopyUnchanged(page, hash);
  });

  test('a damaged copy is replaced once confirmed, kept first as a sealed backup', async ({ page }) => {
    // Scenario: Replace a damaged folder copy
    await folderWithCopy(page);
    await writeForeignFolderCopy(page, 'damaged');
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await dialog.replace.click();
    await dialog.confirmReplace.click();
    await expect(dialog.dialog).toBeHidden();

    const backup = await onlyBackup(page);
    expect(await folderFileHeader(page, backup)).toEqual({ format: 'hemoio-damaged-copy', version: 1, lock: null });
    await expectFreshCopy(page, hash);

    // From now on saves reach the folder
    const fresh = await folderCopyHash(page);
    await seedLabData(page, { labResults: [SEED_LAB_RESULTS[0]], testValues: [] });
    await expect.poll(() => folderCopyHash(page)).not.toBe(fresh);
  });

  test('"Back" from replacing a damaged copy goes back to the problem, changing nothing', async ({ page }) => {
    // Scenario: Go back from replacing a folder copy that cannot be read
    await folderWithCopy(page);
    await writeForeignFolderCopy(page, 'damaged');
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await dialog.replace.click();
    await dialog.back.click();

    await expect(dialog.unreadable()).toBeVisible();
    expect(await folderBackupNames(page, FOLDER_NAME)).toEqual([]);
    await expectFolderCopyUnchanged(page, hash);
  });

  test('"Choose another folder" opens the picker, and syncs to the folder picked', async ({ page }) => {
    // Scenario: Choose another folder when the folder copy cannot be read
    await folderWithCopy(page);
    await writeForeignFolderCopy(page, 'damaged');
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.unreadable()).toBeVisible();
    await pickNext(page, 'Other Folder');
    await dialog.chooseFolder.click();

    await expect(dialog.dialog).toHaveCount(0);
    await expect.poll(() => folderCopyHash(page, 'Other Folder')).not.toBeNull();
    await expectCurrentFolder(page, 'Other Folder');
    expect(await folderCopyHash(page)).toBe(hash);
  });

  test('cancelling the picker leaves the question as it was', async ({ page }) => {
    // Scenario: Cancel choosing another folder
    await folderWithCopy(page);
    await writeForeignFolderCopy(page, 'damaged');
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await pickNext(page, 'cancel');
    await dialog.chooseFolder.click();

    await expect(dialog.unreadable()).toBeVisible();
    await expect(dialog.dialog.getByRole('alert')).toHaveCount(0);
    await expectFolderCopyUnchanged(page, hash);
  });

  test('a folder that cannot be read offers to try again, not to replace', async ({ page }) => {
    // Scenario: The folder cannot be read
    await folderWithCopy(page);
    await failFolderReads(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.unreadable()).toBeVisible();
    await expect(dialog.dialog).toContainText("HemoIO couldn't read the file in");
    await expect(dialog.replace).toHaveCount(0);
    await expect(dialog.chooseFolder).toBeVisible();

    await canReadFolderAgain(page);
    await dialog.tryAgain.click();
    await expect(dialog.offer()).toBeVisible();
  });

  test('a copy from a newer HemoIO offers no folder actions', async ({ page }) => {
    // Scenario: Folder copy from a newer version of HemoIO
    await sealAsNewer(page);
    await folderWithCopy(page);
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.unreadable()).toBeVisible();
    await expect(dialog.dialog).toContainText('saved by a newer version of HemoIO');
    await expect(dialog.dialog.getByRole('button')).toHaveText(['Not now']);
    await expectFolderCopyUnchanged(page, hash);
  });

  test('a copy saved before tests were identified by LOINC is reported, not offered for restore or changed', async ({ page }) => {
    // Scenario: Folder copy saved before tests were identified by LOINC
    await sealAsPreLoinc(page);
    await folderWithCopy(page);
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.unreadable()).toBeVisible();
    await expect(dialog.dialog).toContainText(
      'This backup was made before tests were identified by LOINC and cannot be restored. Re-import your reports instead.'
    );
    await expect(dialog.restore).toHaveCount(0);
    await expect(dialog.replace).toBeVisible();
    await expect(dialog.chooseFolder).toBeVisible();
    await expectFolderCopyUnchanged(page, hash);
  });

  test('a copy saved before LOINC is replaced once confirmed, kept first without its lock', async ({ page }) => {
    // Scenario: Replace a folder copy saved before tests were identified by LOINC
    await sealAsPreLoinc(page);
    await folderWithCopy(page);
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);
    await sealAsCurrent(page);

    const dialog = new FolderRestoreDialog(page);
    await dialog.replace.click();
    await expect(dialog.dialog).not.toContainText('another password');
    await dialog.confirmReplace.click();
    await expect(dialog.dialog).toBeHidden();

    // The key opens it: kept as it was, sealed again without the lock
    const backup = await onlyBackup(page);
    expect(await folderFileHeader(page, backup)).toEqual({ format: 'hemoio-folder-copy', version: 1, lock: null });
    expect((await folderFileBody(page, backup, TEST_PASSWORD)).version).toBe(3);
    await expectFreshCopy(page, hash);
  });

  test('a pre-LOINC copy the user declined is not written over after an import', async ({ page }) => {
    // Scenario: A folder copy saved before LOINC is never written over
    await sealAsPreLoinc(page);
    await folderWithCopy(page);
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.unreadable()).toBeVisible();
    await dialog.notNow.click();
    await expect(dialog.dialog).toBeHidden();
    await seedLabData(page);
    await expectFolderCopyUnchanged(page, hash);

    // The browser has data now, so nothing asks first: the sync itself must refuse
    await lockApp(page);
    await unlockApp(page);
    await expect(page.getByText('Folder sync skipped')).toBeVisible();
    await expect(page.getByText(/saved before tests were identified by LOINC/)).toBeVisible();
    await page.clock.fastForward('00:31');
    expect(await folderCopyHash(page)).toBe(hash);
  });

  test('an empty folder file is not asked about, and is saved over', async ({ page }) => {
    await folderWithCopy(page);
    await writeForeignFolderCopy(page, 'empty');
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    await expect.poll(() => folderCopyHash(page)).not.toBe(hash);
    await expect(new FolderRestoreDialog(page).dialog).toHaveCount(0);
  });

  test('a browser that still has its data is not asked, and saves as usual', async ({ page }) => {
    const hash = await folderWithCopy(page);
    await page.reload();
    await unlockApp(page);
    await expect(new FolderRestoreDialog(page).dialog).toHaveCount(0);

    // A change reaches the folder as usual
    await seedLabData(page, { labResults: [...SEED_LAB_RESULTS, LATER_RESULT], testValues: [] });
    await expect.poll(() => folderCopyHash(page)).not.toBe(hash);
    await expect(new FolderRestoreDialog(page).dialog).toHaveCount(0);
  });

  test('asks once folder access is granted again', async ({ page }) => {
    const hash = await folderWithCopy(page);
    await forgetFolderPermission(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expectFolderCopyUnchanged(page, hash);
    await grantFolderAccess(page);
    await expect(dialog.offer()).toBeVisible();
    await expectFolderCopyUnchanged(page, hash);
  });

  test('data added while folder access waited is no reason to skip the question', async ({ page }) => {
    const hash = await folderWithCopy(page);
    await forgetFolderPermission(page);
    await loseBrowserData(page);
    await unlockApp(page);

    await seedLabData(page, { labResults: [SEED_LAB_RESULTS[0]], testValues: [] });
    await grantFolderAccess(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.offer()).toContainText('2 lab results');
    await expect(dialog.dialog).toContainText(
      'Restoring replaces the lab data added to this browser since you unlocked HemoIO'
    );
    await expectFolderCopyUnchanged(page, hash);
  });

  test('Escape on the replace confirmation goes back to the offer', async ({ page }) => {
    await folderWithCopy(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await dialog.replace.click();
    await expect(dialog.confirmReplace).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog.offer()).toBeVisible();
  });
});
