/**
 * E2E tests for features/folder-sync-safety.feature
 *
 * The folder sync never replaces a folder copy holding lab results with an
 * empty one, keeps the copy it replaces as the previous copy, and tells the
 * user when it holds back.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { TEST_PASSWORD, openSettingsTab, setupOrUnlock, unlockApp } from './steps/app.steps';
import {
  NEW_PASSWORD,
  SecuritySettingsPage,
  expectPasswordRejected,
  lockApp,
} from './steps/changePassword.steps';
import { SEED_LAB_RESULTS, seedLabData } from './steps/data.steps';
import {
  FOLDER_COPY,
  PREVIOUS_FOLDER_COPY,
  ReplaceFolderCopyDialog,
  SkippedSyncNotice,
  TestFolder,
  changeFolder,
  failedSyncNotice,
  loseBrowserData,
  pickNextFolder,
  readFolderFile,
  skippedSyncNotice,
  syncAttempts,
  storeDataInFolder,
  useTestFolder,
} from './steps/folderSync.steps';
import {
  FolderRestoreDialog,
  expectCurrentFolder,
  folderCopyHash,
  writeForeignFolderCopy,
} from './steps/folderRestore.steps';
import {
  FOLDER_BACKUPS,
  currentFolderData,
  folderBackupNames,
  folderFileBody,
  folderFileRevision,
  readFolderCopyText,
  readFolderEnvelope,
  saveCopyAsAnotherComputer,
  storedLockChangedAt,
} from './steps/otherComputer.steps';
import {
  seedUnreadableRecords,
  setAsideBanner,
  setAsideSavedFlags,
  withSavePicker,
} from './steps/unreadableRecords.steps';

const MORE_LAB_RESULTS = [
  ...SEED_LAB_RESULTS,
  {
    id: 3,
    date: '2024-03-12T09:00:00.000Z',
    labName: 'City Hospital',
    createdAt: '2024-03-12T09:00:00.000Z',
    updatedAt: '2024-03-12T09:00:00.000Z',
  },
];

/** The password another computer changed to */
const OTHER_PASSWORD = 'Other-Computer-Passw0rd!';

const NEW_LAB_RESULT = {
  id: 1,
  date: '2024-05-06T09:00:00.000Z',
  labName: 'New Clinic',
  createdAt: '2024-05-06T09:00:00.000Z',
  updatedAt: '2024-05-06T09:00:00.000Z',
};

const LATER_LAB_RESULT = {
  ...NEW_LAB_RESULT,
  id: 2,
  date: '2024-06-06T09:00:00.000Z',
  createdAt: '2024-06-06T09:00:00.000Z',
  updatedAt: '2024-06-06T09:00:00.000Z',
};

const EVEN_MORE_LAB_RESULTS = [
  ...MORE_LAB_RESULTS,
  {
    id: 4,
    date: '2024-04-02T09:00:00.000Z',
    labName: 'Riverside Clinic',
    createdAt: '2024-04-02T09:00:00.000Z',
    updatedAt: '2024-04-02T09:00:00.000Z',
  },
];

/**
 * And I choose to replace the folder copy instead of restoring it — the
 * restore offer an empty browser gets at unlock
 */
async function replaceFolderCopyInstead(page: Page): Promise<void> {
  const dialog = new FolderRestoreDialog(page);
  await expect(dialog.offer()).toBeVisible();
  await dialog.replace.click();
  await dialog.confirmReplace.click();
  await expect(dialog.dialog).toHaveCount(0);
}

test.describe('Folder Sync Safety', () => {
  let folder: TestFolder;

  test.beforeEach(async ({ page }) => {
    await useTestFolder(page);
    folder = new TestFolder(page);
    await page.goto('/');
    await setupOrUnlock(page);
    await storeDataInFolder(page);
    // Choosing the folder syncs at once: wait for that first copy
    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBeNull();
  });

  /** Given my lab results have been synced to my folder */
  async function syncResults(page: Parameters<typeof seedLabData>[0]): Promise<string> {
    // The copy written when the folder was chosen, before there were results
    const before = await folder.read(FOLDER_COPY);
    await seedLabData(page);
    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(before);
    return (await folder.read(FOLDER_COPY))!;
  }

  /** The revision of a file in the folder, which a copy keeps when it becomes the previous copy */
  function revisionOf(page: Page, fileName: string, password = TEST_PASSWORD): Promise<string | null> {
    return folderFileRevision(page, fileName, password);
  }

  test('an empty browser does not overwrite the folder copy', async ({ page }) => {
    const synced = await syncResults(page);

    await loseBrowserData(page);
    await unlockApp(page);
    await replaceFolderCopyInstead(page);

    await expect(skippedSyncNotice(page)).toBeVisible();
    await expect(skippedSyncNotice(page)).toContainText('your folder copy does');
    expect(await folder.read(FOLDER_COPY)).toBe(synced);
  });

  test('sync starts again once the results are back', async ({ page }) => {
    // Setup, a reload or relock and three restores: each unlock derives the key again
    test.slow();
    const synced = await syncResults(page);
    await loseBrowserData(page);
    await unlockApp(page);
    await replaceFolderCopyInstead(page);
    await expect(skippedSyncNotice(page)).toBeVisible();

    await seedLabData(page, { labResults: MORE_LAB_RESULTS });

    await expect(skippedSyncNotice(page)).toHaveCount(0);
    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(synced);
  });

  test('I am told when the folder cannot be written', async ({ page }) => {
    await syncResults(page);
    await folder.remove();

    await seedLabData(page, { labResults: MORE_LAB_RESULTS });

    await expect(failedSyncNotice(page)).toBeVisible();
    await expect(failedSyncNotice(page)).toContainText('safe in this browser');
    // Told once: the restore that added the results, notified before the sync
    // ran, does not report it again
    await expect(page.getByRole('alert').filter({ hasText: 'With Problems' })).toHaveCount(0);
  });

  test('the previous folder copy is kept next to the new one', async ({ page }) => {
    const synced = await syncResults(page);
    const syncedRevision = await revisionOf(page, FOLDER_COPY);

    await seedLabData(page, { labResults: MORE_LAB_RESULTS });

    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(synced);
    expect(await revisionOf(page, PREVIOUS_FOLDER_COPY)).toBe(syncedRevision);
    // Only the current copy carries the password lock
    expect(JSON.parse(atob((await folder.read(PREVIOUS_FOLDER_COPY))!)).lock).toBeNull();
  });

  test('a full copy is not pushed out by smaller ones', async ({ page }) => {
    // Setup, a reload or relock and three restores: each unlock derives the key again
    test.slow();
    await syncResults(page);
    const full = await revisionOf(page, FOLDER_COPY);
    await loseBrowserData(page);
    await unlockApp(page);
    await replaceFolderCopyInstead(page);
    await expect(skippedSyncNotice(page)).toBeVisible();

    await seedLabData(page, { labResults: [NEW_LAB_RESULT], testValues: [] });
    await seedLabData(page, { labResults: [NEW_LAB_RESULT, LATER_LAB_RESULT], testValues: [] });

    expect(await revisionOf(page, PREVIOUS_FOLDER_COPY)).toBe(full);
  });

  test('opening the app without changes keeps the previous copy', async ({ page }) => {
    // Setup, a reload or relock and three restores: each unlock derives the key again
    test.slow();
    const synced = await syncResults(page);
    await seedLabData(page, { labResults: MORE_LAB_RESULTS });
    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(synced);
    const beforeLastChange = await folder.read(FOLDER_COPY);
    const beforeLastChangeRevision = await revisionOf(page, FOLDER_COPY);

    // Unlocking syncs at once; with nothing changed it must not write
    await lockApp(page);
    await unlockApp(page);
    await seedLabData(page, { labResults: EVEN_MORE_LAB_RESULTS });

    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(beforeLastChange);
    expect(await revisionOf(page, PREVIOUS_FOLDER_COPY)).toBe(beforeLastChangeRevision);
  });

  test('a folder copy saved with another password is not replaced', async ({ page }) => {
    await folder.write(FOLDER_COPY, 'sealed with a different password');
    const foreign = await folder.read(FOLDER_COPY);

    await seedLabData(page);

    await expect(skippedSyncNotice(page)).toBeVisible();
    await expect(skippedSyncNotice(page)).toContainText('cannot be read');
    await expect(skippedSyncNotice(page)).toContainText('choose another folder, or replace the folder copy');
    const notice = new SkippedSyncNotice(page);
    await expect(notice.chooseFolder).toBeVisible();
    await expect(notice.replace).toBeVisible();
    expect(await folder.read(FOLDER_COPY)).toBe(foreign);
  });

  test('a folder copy that cannot be read is replaced from the notice, kept first as a sealed backup', async ({
    page,
  }) => {
    // Scenario: Replace a folder copy that cannot be read, from the notice
    await folder.write(FOLDER_COPY, 'sealed with a different password');
    await seedLabData(page);
    const notice = new SkippedSyncNotice(page);
    await expect(notice.notice).toBeVisible();

    await notice.replace.click();
    const confirm = new ReplaceFolderCopyDialog(page);
    await expect(confirm.dialog).toContainText('kept as a dated backup first');
    await expect(confirm.dialog).toContainText(
      "If the copy was made with another password or by someone else's HemoIO setup, it will no longer sync from this folder. It is kept in hemoio-backups as it was, and can still be restored there with that password."
    );
    await expect(confirm.back).toBeFocused();
    await confirm.confirm.click();
    await expect(confirm.dialog).toHaveCount(0);

    await expect(skippedSyncNotice(page)).toHaveCount(0);
    const names = await folderBackupNames(page);
    expect(names).toEqual([expect.stringMatching(/^hemoio-backup-\d{8}T\d{9}Z\.encrypted$/)]);
    // No envelope, so no lock: kept exactly as it was, for the setup that made it to restore
    expect(await readFolderFile(page, folder.name, `${FOLDER_BACKUPS}/${names[0]}`)).toBe('sealed with a different password');
    const copy = await folderFileBody(page, FOLDER_COPY, TEST_PASSWORD);
    expect(copy.data.labResults.map((r) => r.labName).sort()).toEqual(SEED_LAB_RESULTS.map((r) => r.labName).sort());
  });

  test('"Back" from replacing in the notice leaves the copy and the notice as they were', async ({ page }) => {
    // Scenario: Change my mind about replacing from the notice
    await folder.write(FOLDER_COPY, 'sealed with a different password');
    const foreign = await folder.read(FOLDER_COPY);
    await seedLabData(page);
    const notice = new SkippedSyncNotice(page);

    await notice.replace.click();
    const confirm = new ReplaceFolderCopyDialog(page);
    await confirm.back.click();

    await expect(confirm.dialog).toHaveCount(0);
    await expect(notice.notice).toBeVisible();
    expect(await folderBackupNames(page)).toEqual([]);
    expect(await folder.read(FOLDER_COPY)).toBe(foreign);
  });

  test('a folder copy that cannot be read is replaced from Settings once the notice is dismissed', async ({ page }) => {
    // Scenario: Replace a folder copy that cannot be read from Settings, after dismissing the notice
    await folder.write(FOLDER_COPY, 'sealed with a different password');
    await seedLabData(page);
    const notice = new SkippedSyncNotice(page);
    await expect(notice.notice).toContainText('(also in Settings > Data)');

    await notice.dismiss.click();
    await expect(notice.notice).toHaveCount(0);
    await openSettingsTab(page, 'Data');
    const status = page.getByText("The folder copy can't be read.", { exact: true });
    await expect(status).toBeVisible();
    await page.getByRole('button', { name: 'Replace folder copy…' }).click();
    const confirm = new ReplaceFolderCopyDialog(page);
    await expect(confirm.dialog).toContainText('another password');
    await confirm.confirm.click();
    await expect(confirm.dialog).toHaveCount(0);

    await expect
      .poll(async () => (await folderFileBody(page, FOLDER_COPY, TEST_PASSWORD).catch(() => null))?.data.labResults.length)
      .toBe(SEED_LAB_RESULTS.length);
    await expect(status).toHaveCount(0);
  });

  test("the notice's buttons stay in view on a narrow screen with large text", async ({ page }) => {
    // Scenario: The notice's buttons stay in view on a narrow screen with large text
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => (document.documentElement.style.fontSize = '20px'));
    await folder.write(FOLDER_COPY, 'sealed with a different password');

    await seedLabData(page);

    const notice = new SkippedSyncNotice(page);
    await expect(notice.notice).toBeVisible();
    await expect(notice.chooseFolder).toBeInViewport({ ratio: 1 });
    await expect(notice.replace).toBeInViewport({ ratio: 1 });
    await notice.chooseFolder.click({ trial: true });
    await notice.replace.click();
    await expect(new ReplaceFolderCopyDialog(page).dialog).toBeVisible();
  });

  test('"Choose another folder" in the notice lets the sync start again there', async ({ page }) => {
    // Scenario: Choose another folder from the notice
    await folder.write(FOLDER_COPY, 'sealed with a different password');
    const foreign = await folder.read(FOLDER_COPY);
    await seedLabData(page);
    const notice = new SkippedSyncNotice(page);
    await expect(notice.notice).toBeVisible();

    const otherFolder = new TestFolder(page, 'Other Folder');
    await pickNextFolder(page, otherFolder);
    await notice.chooseFolder.click();

    await expect(skippedSyncNotice(page)).toHaveCount(0);
    await expect.poll(() => otherFolder.read(FOLDER_COPY)).not.toBeNull();
    await expectCurrentFolder(page, otherFolder.name);
    expect(await folder.read(FOLDER_COPY)).toBe(foreign);
  });

  test('choosing a different folder lets the sync start again', async ({ page }) => {
    await folder.write(FOLDER_COPY, 'sealed with a different password');
    const foreign = await folder.read(FOLDER_COPY);
    await seedLabData(page);
    await expect(skippedSyncNotice(page)).toBeVisible();

    const otherFolder = new TestFolder(page, 'Other Folder');
    await changeFolder(page, otherFolder);
    await seedLabData(page, { labResults: MORE_LAB_RESULTS });

    await expect(skippedSyncNotice(page)).toHaveCount(0);
    await expect.poll(() => otherFolder.read(FOLDER_COPY)).not.toBeNull();
    expect(await folder.read(FOLDER_COPY)).toBe(foreign);
  });

  test('the first sync to an empty folder writes a copy', async ({ page }) => {
    // Written when the folder was chosen, before there were any results
    const first = await folder.read(FOLDER_COPY);

    await seedLabData(page);

    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(first);
    expect(await folder.read(PREVIOUS_FOLDER_COPY)).toBeNull();
    await expect(skippedSyncNotice(page)).toHaveCount(0);
  });

  test('records that cannot be opened pause the folder sync', async ({ page }) => {
    // Scenario: Records that cannot be opened pause the folder sync
    // A save picker, so the download counts as saved without a question
    await withSavePicker(page, 'save');
    await page.reload();
    await unlockApp(page);
    const synced = await syncResults(page);
    await seedUnreadableRecords(page, { labResults: 1, testValues: 2 });
    await expect(setAsideBanner(page)).toContainText('Folder sync is paused');

    const attempts = await syncAttempts(page);

    await seedLabData(page, { labResults: MORE_LAB_RESULTS });

    // The sync the added result starts has run, and held back
    await expect.poll(() => syncAttempts(page)).toBeGreaterThan(attempts);
    await expect(skippedSyncNotice(page)).toBeVisible();
    await expect(skippedSyncNotice(page)).toContainText("Some stored records can't be opened");
    expect(await folder.read(FOLDER_COPY)).toBe(synced);

    await setAsideBanner(page).getByRole('button', { name: 'Download sealed file' }).click();

    await expect.poll(() => setAsideSavedFlags(page)).toEqual([1, 1, 1]);
    await expect(skippedSyncNotice(page)).toHaveCount(0);
    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(synced);
  });

  test('the folder copy keeps the password lock beside the data', async ({ page }) => {
    // Scenario: The folder copy keeps the password lock beside the data
    await syncResults(page);

    const text = await readFolderCopyText(page);
    const file = JSON.parse(text);
    expect(file.format).toBe('hemoio-folder-copy');
    expect(typeof file.lock.wrappedKey).toBe('string');
    expect(Object.keys(file).sort()).toEqual(['format', 'lock', 'sealed', 'version']);
    expect(text).not.toContain('Hemoglobin');
    expect(text).not.toContain('718-7');
  });

  test('a password change reaches the folder', async ({ page }) => {
    // Scenario: A password change reaches the folder
    await syncResults(page);
    const before = (await readFolderEnvelope(page)).header.lock?.changedAt;

    await new SecuritySettingsPage(page).change(TEST_PASSWORD, NEW_PASSWORD);

    await expect
      .poll(async () => (await readFolderEnvelope(page)).header.lock?.changedAt)
      .not.toBe(before);
    const after = (await readFolderEnvelope(page)).header.lock?.changedAt as string;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before as string).getTime());
    expect(after).toBe(await storedLockChangedAt(page));
  });

  test('a password changed on another computer is picked up at the next sync', async ({ page }) => {
    // Scenario: A password changed on another computer is picked up at the next sync
    test.slow();
    await syncResults(page);
    const later = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    // Its sync saves the data it had from the folder again, with the new lock
    await saveCopyAsAnotherComputer(page, {
      password: TEST_PASSWORD,
      data: await currentFolderData(page, TEST_PASSWORD),
      newPassword: NEW_PASSWORD,
      changedAt: later,
    });

    // I keep working: adding results syncs, and the sync finds the later lock
    await seedLabData(page, { labResults: MORE_LAB_RESULTS });
    await expect.poll(() => storedLockChangedAt(page)).toBe(later);
    await expect(page.getByPlaceholder('Search by lab name')).toBeVisible();
    const notice = page.getByRole('alert').filter({ hasText: 'Password changed on another computer' });
    await expect(notice).toContainText('Use the new password the next time you unlock HemoIO.');
    // It stays until dismissed
    await notice.getByRole('button').click();
    await expect(notice).toHaveCount(0);

    await lockApp(page);
    await expectPasswordRejected(page, TEST_PASSWORD);
    await unlockApp(page, NEW_PASSWORD);
  });

  test('when both computers change the password, the later change wins', async ({ page }) => {
    // Scenario: When both computers change the password, the later change wins
    test.slow();
    await syncResults(page);
    const otherChange = new Date(Date.now() - 60 * 1000).toISOString();
    await new SecuritySettingsPage(page).change(TEST_PASSWORD, NEW_PASSWORD);
    const ours = await storedLockChangedAt(page);
    await expect.poll(async () => (await readFolderEnvelope(page)).header.lock?.changedAt).toBe(ours);

    // The other computer's change was made earlier, and reached the folder only now
    await saveCopyAsAnotherComputer(page, {
      password: NEW_PASSWORD,
      data: await currentFolderData(page, NEW_PASSWORD),
      newPassword: OTHER_PASSWORD,
      changedAt: otherChange,
    });
    await seedLabData(page, { labResults: MORE_LAB_RESULTS });

    await expect.poll(async () => (await readFolderEnvelope(page)).header.lock?.changedAt).toBe(ours);
    expect(await storedLockChangedAt(page)).toBe(ours);
    await lockApp(page);
    await expectPasswordRejected(page, OTHER_PASSWORD);
    await unlockApp(page, NEW_PASSWORD);
  });

  test('a folder from another setup is explained', async ({ page }) => {
    // Scenario: A folder from another setup is explained
    await writeForeignFolderCopy(page, 'another-setup', folder.name);
    const foreign = await folderCopyHash(page, folder.name);

    await seedLabData(page);

    await expect(skippedSyncNotice(page)).toBeVisible();
    await expect(skippedSyncNotice(page)).toContainText("another HemoIO setup's copy");
    await expect(skippedSyncNotice(page)).toContainText(
      'Choose another folder, or use Start over in Settings > Security to set up from that copy.'
    );
    const notice = new SkippedSyncNotice(page);
    await expect(notice.chooseFolder).toBeVisible();
    // Other computers may still sync from it
    await expect(notice.replace).toHaveCount(0);
    expect(await folderCopyHash(page, folder.name)).toBe(foreign);
  });
});
