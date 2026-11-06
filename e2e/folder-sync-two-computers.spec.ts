/**
 * E2E tests for features/folder-sync-two-computers.feature
 *
 * A newer folder copy saved on another computer loads when this one changed
 * nothing; when both changed, the user chooses, and the side not chosen is
 * kept as a dated backup. The other computer is played in the page: it holds
 * the same data key and writes the folder copy as HemoIO does.
 */

import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { TEST_PASSWORD, openFromMenu, openSettingsTab, setupOrUnlock, unlockApp } from './steps/app.steps';
import { lockApp } from './steps/changePassword.steps';
import { SEED_LAB_RESULTS, SEED_TEST_VALUES, seedLabData } from './steps/data.steps';
import {
  FOLDER_COPY,
  TEST_FOLDER_NAME,
  TestFolder,
  storeDataInFolder,
  syncAttempts,
  useTestFolder,
} from './steps/folderSync.steps';
import { folderCopyHash } from './steps/folderRestore.steps';
import {
  FOLDER_BACKUPS,
  ancestryOfFolderCopy,
  corruptFolderBackup,
  currentFolderData,
  folderBackupNames,
  folderFileBody,
  folderFileHeader,
  folderFileRevision,
  holdFolderSyncs,
  putFolderBackups,
  readFolderCopyText,
  saveCopyAsAnotherComputer,
} from './steps/otherComputer.steps';
import { seedUnreadableRecords, setAsideBanner, setAsideSavedFlags, withSavePicker } from './steps/unreadableRecords.steps';

const BACKUP_NAME = /^hemoio-backup-\d{8}T\d{9}Z\.encrypted$/;
const AUTOBACKUP_NAME = /^hemoio-autobackup-\d{8}T\d{9}Z\.encrypted$/;

const result = (id: number, labName: string, day: string) => ({
  id,
  date: `${day}T09:00:00.000Z`,
  labName,
  createdAt: `${day}T09:00:00.000Z`,
  updatedAt: `${day}T09:00:00.000Z`,
});

/** What the other computer adds */
const OTHER_RESULT = result(3, 'Other Computer Clinic', '2024-03-12');
const LATER_OTHER_RESULT = result(4, 'Second Visit Clinic', '2024-04-02');
/** What this computer adds */
const THIS_RESULTS = [result(3, 'This Computer Clinic', '2024-05-06'), result(4, 'This Computer Clinic', '2024-06-06')];

const SYNC_STATE = 'hemoio_folder_sync_state';

/**
 * When my other computer saves a copy with these lab results (and the seeded
 * test values), built on the folder copy it read: the one there now
 */
async function otherComputerSaves(page: Page, labResults: unknown[]): Promise<void> {
  await saveCopyAsAnotherComputer(page, {
    password: TEST_PASSWORD,
    data: { labResults },
    folderName: TEST_FOLDER_NAME,
    ancestors: await ancestryOfFolderCopy(page, TEST_PASSWORD),
  });
}

/** The notice that a newer folder copy was loaded */
function updatedNotice(page: Page): Locator {
  return page.getByRole('alert').filter({ hasText: 'Updated from the folder' });
}

function conflictDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Your folder copy changed on another computer' });
}

/** And the periodic folder sync runs — waits until it has begun */
async function periodicSync(page: Page): Promise<void> {
  const before = await syncAttempts(page);
  await page.clock.fastForward('00:31');
  await expect.poll(() => syncAttempts(page)).toBeGreaterThan(before);
}

test.describe('Two computers on one folder', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Folder storage needs the File System Access API, which only Chromium has'
  );

  let folder: TestFolder;

  /**
   * Background: logged in, with the seeded lab results synced to a folder
   * that another computer, set up with the same password, syncs too
   */
  test.beforeEach(async ({ page }) => {
    // The test's own clock, so it can skip ahead to the periodic sync
    await page.clock.install();
    await useTestFolder(page);
    folder = new TestFolder(page);
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page);
    await storeDataInFolder(page);
    // The first sync writes the copy and records what this computer saw
    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBeNull();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), SYNC_STATE)).not.toBeNull();
    await openFromMenu(page, 'Timeline');
  });

  /**
   * Given I was asked which data to keep: the other computer saved a copy
   * with another result, and this one gained two results before it synced
   */
  async function askedWhichToKeep(
    page: Page
  ): Promise<{ otherRevision: string | null; lastSeenRevision: string | null }> {
    // The copy this computer last saw: the one written in the background
    const lastSeenRevision = await folderFileRevision(page, FOLDER_COPY, TEST_PASSWORD);
    // Both change before the next sync looks
    const release = await holdFolderSyncs(page);
    await otherComputerSaves(page, [...SEED_LAB_RESULTS, OTHER_RESULT]);
    const otherRevision = await folderFileRevision(page, FOLDER_COPY, TEST_PASSWORD);
    await seedLabData(page, { labResults: [...SEED_LAB_RESULTS, ...THIS_RESULTS] });
    await release();
    await expect(conflictDialog(page)).toBeVisible();
    return { otherRevision, lastSeenRevision };
  }

  test('a newer folder copy loads when I have no changes', async ({ page }) => {
    // Scenario: A newer folder copy loads when I have no changes
    await lockApp(page);
    await otherComputerSaves(page, [...SEED_LAB_RESULTS, OTHER_RESULT]);
    const { exportedAt } = await folderFileBody(page, FOLDER_COPY, TEST_PASSWORD);
    await unlockApp(page);

    await expect(page.getByText('Other Computer Clinic')).toBeVisible();
    await expect(updatedNotice(page)).toBeVisible();
    // The date the copy was saved, as the app writes dates
    const saved = await page.evaluate(
      (iso) =>
        new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)),
      exportedAt!
    );
    await expect(updatedNotice(page)).toContainText(`Saved on ${saved}`);
  });

  test('a newer folder copy is also noticed during a session', async ({ page }) => {
    // Scenario: A newer folder copy is also noticed during a session
    await otherComputerSaves(page, [...SEED_LAB_RESULTS, OTHER_RESULT]);

    await periodicSync(page);

    await expect(page.getByText('Other Computer Clinic')).toBeVisible();
    await expect(updatedNotice(page)).toBeVisible();
  });

  test("loading a newer folder copy first keeps my computer's data as an autobackup", async ({ page }) => {
    // Scenario: Loading a newer folder copy first keeps my computer's data as an autobackup
    await otherComputerSaves(page, [...SEED_LAB_RESULTS, OTHER_RESULT]);

    await periodicSync(page);
    await expect(updatedNotice(page)).toBeVisible();

    const names = await folderBackupNames(page);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(AUTOBACKUP_NAME);
    const backup = await folderFileBody(page, `${FOLDER_BACKUPS}/${names[0]}`, TEST_PASSWORD);
    expect(backup.data.labResults.map((r) => r.labName)).not.toContain('Other Computer Clinic');
    expect(backup.data.labResults).toHaveLength(SEED_LAB_RESULTS.length);
    expect(await folderFileHeader(page, `${FOLDER_BACKUPS}/${names[0]}`)).toMatchObject({ lock: null });
  });

  test('an older folder copy put back is asked about, never loaded', async ({ page }) => {
    // Scenario: An older folder copy put back is asked about, never loaded
    const older = await readFolderCopyText(page);
    await otherComputerSaves(page, [...SEED_LAB_RESULTS, OTHER_RESULT]);
    await periodicSync(page);
    await expect(page.getByText('Other Computer Clinic')).toBeVisible();

    // The copy from before, put back in the folder as it was
    await folder.write(FOLDER_COPY, older);
    await periodicSync(page);

    await expect(conflictDialog(page)).toContainText(
      "The folder copy is not a newer version of the one this computer last saw. It may be an older copy put back, one saved at the same time as this computer's, or one this computer has not seen the steps to."
    );
    await expect(page.getByText('Other Computer Clinic')).toBeVisible();
    expect(await readFolderCopyText(page)).toBe(older);
  });

  test('with changes on both sides I choose, and see counts and dates only', async ({ page }) => {
    // Scenario: With changes on both sides I choose, and see counts and dates only
    const { otherRevision } = await askedWhichToKeep(page);

    const dialog = conflictDialog(page);
    const inFolder = dialog.getByRole('region', { name: 'In the folder' });
    const onThisComputer = dialog.getByRole('region', { name: 'On this computer' });
    await expect(inFolder).toContainText('3 lab results');
    await expect(inFolder).toContainText(`${SEED_TEST_VALUES.length} test values`);
    await expect(inFolder).toContainText('0 notes');
    await expect(inFolder).toContainText('Saved ');
    await expect(onThisComputer).toContainText('4 lab results');
    await expect(onThisComputer).toContainText('Last changed ');
    const text = (await dialog.textContent()) ?? '';
    for (const name of ['Hemoglobin', 'Glucose', '14.5', 'Quest', 'LabCorp', 'Clinic']) {
      expect(text).not.toContain(name);
    }
    // Nothing has changed yet: the folder copy is the other computer's, and this one keeps its own
    expect(await folderFileRevision(page, FOLDER_COPY, TEST_PASSWORD)).toBe(otherRevision);
    expect(await folderBackupNames(page)).toEqual([]);
    await expect(page.getByText('This Computer Clinic').first()).toBeVisible();
  });

  test("loading the folder copy keeps my computer's data as a dated backup", async ({ page }) => {
    // Scenario: Loading the folder copy keeps my computer's data as a dated backup
    await askedWhichToKeep(page);

    await conflictDialog(page).getByRole('button', { name: 'Load the folder copy' }).click();

    await expect(conflictDialog(page)).toHaveCount(0);
    await expect(page.getByText('Other Computer Clinic')).toBeVisible();
    await expect(page.getByText('This Computer Clinic')).toHaveCount(0);
    const names = await folderBackupNames(page);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(BACKUP_NAME);
    const backup = await folderFileBody(page, `${FOLDER_BACKUPS}/${names[0]}`, TEST_PASSWORD);
    expect(backup.data.labResults.map((r) => r.labName)).toContain('This Computer Clinic');
    expect(await folderFileHeader(page, `${FOLDER_BACKUPS}/${names[0]}`)).toMatchObject({ lock: null });
  });

  test("keeping my computer's data keeps the folder copy as a dated backup", async ({ page }) => {
    // Scenario: Keeping my computer's data keeps the folder copy as a dated backup
    const { otherRevision, lastSeenRevision } = await askedWhichToKeep(page);

    await conflictDialog(page).getByRole('button', { name: "Keep this computer's data" }).click();

    await expect(conflictDialog(page)).toHaveCount(0);
    await expect
      .poll(async () =>
        (await folderFileBody(page, FOLDER_COPY, TEST_PASSWORD)).data.labResults.map((r) => r.labName)
      )
      .toContain('This Computer Clinic');
    await expect(page.getByText('This Computer Clinic').first()).toBeVisible();
    const { ancestors } = await folderFileBody(page, FOLDER_COPY, TEST_PASSWORD);
    expect(ancestors?.slice(0, 2)).toEqual([otherRevision, lastSeenRevision]);
    const names = await folderBackupNames(page);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(BACKUP_NAME);
    const backup = await folderFileBody(page, `${FOLDER_BACKUPS}/${names[0]}`, TEST_PASSWORD);
    // The folder copy as it was, sealed again without the lock
    expect(backup.revision).toBe(otherRevision);
    expect(backup.data.labResults.map((r) => r.labName)).toContain('Other Computer Clinic');
    expect(await folderFileHeader(page, `${FOLDER_BACKUPS}/${names[0]}`)).toMatchObject({ lock: null });
  });

  test("keeping my computer's data asks again when the folder copy changed meanwhile", async ({ page }) => {
    // Scenario: Keeping my computer's data asks again when the folder copy changed meanwhile
    await askedWhichToKeep(page);
    await otherComputerSaves(page, [...SEED_LAB_RESULTS, OTHER_RESULT, LATER_OTHER_RESULT]);
    const latest = await folderFileRevision(page, FOLDER_COPY, TEST_PASSWORD);

    await conflictDialog(page).getByRole('button', { name: "Keep this computer's data" }).click();

    await expect(conflictDialog(page).getByRole('region', { name: 'In the folder' })).toContainText(
      '4 lab results'
    );
    expect(await folderFileRevision(page, FOLDER_COPY, TEST_PASSWORD)).toBe(latest);
  });

  test('a copy saved again elsewhere with nothing new is no conflict', async ({ page }) => {
    // Scenario: A copy saved again elsewhere with nothing new is no conflict
    const release = await holdFolderSyncs(page);
    await saveCopyAsAnotherComputer(page, {
      password: TEST_PASSWORD,
      data: await currentFolderData(page, TEST_PASSWORD),
      folderName: TEST_FOLDER_NAME,
    });
    const savedAgain = await folderFileRevision(page, FOLDER_COPY, TEST_PASSWORD);
    await seedLabData(page, { labResults: [...SEED_LAB_RESULTS, ...THIS_RESULTS] });
    await release();

    await expect
      .poll(async () => folderFileRevision(page, FOLDER_COPY, TEST_PASSWORD))
      .not.toBe(savedAgain);
    expect(
      (await folderFileBody(page, FOLDER_COPY, TEST_PASSWORD)).data.labResults.map((r) => r.labName)
    ).toContain('This Computer Clinic');
    await expect(conflictDialog(page)).toHaveCount(0);
    expect(await folderBackupNames(page)).toEqual([]);
  });

  test('deciding later writes nothing', async ({ page }) => {
    // Scenario: Deciding later writes nothing
    await askedWhichToKeep(page);
    const folderCopy = await folderCopyHash(page, TEST_FOLDER_NAME);

    await conflictDialog(page).getByRole('button', { name: 'Decide later' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Folder Sync Paused' })).toBeVisible();
    await expect(conflictDialog(page)).toHaveCount(0);
    const attempts = await syncAttempts(page);
    await page.clock.fastForward('00:31');
    // A held sync stops before it looks at the folder
    expect(await syncAttempts(page)).toBe(attempts);
    expect(await folderCopyHash(page, TEST_FOLDER_NAME)).toBe(folderCopy);
    expect(await folderBackupNames(page)).toEqual([]);
    await expect(page.getByText('This Computer Clinic').first()).toBeVisible();
    await expect(page.getByText('Other Computer Clinic')).toHaveCount(0);

    await lockApp(page);
    await unlockApp(page);
    await expect(conflictDialog(page)).toBeVisible();
    // The sync that asked again wrote nothing either
    expect(await folderCopyHash(page, TEST_FOLDER_NAME)).toBe(folderCopy);
    expect(await folderBackupNames(page)).toEqual([]);
  });

  test('a copy loaded from the folder is not written back unchanged', async ({ page }) => {
    // Scenario: A copy loaded from the folder is not written back unchanged
    await otherComputerSaves(page, [...SEED_LAB_RESULTS, OTHER_RESULT]);
    const saved = await folderCopyHash(page, TEST_FOLDER_NAME);
    await periodicSync(page);
    await expect(updatedNotice(page)).toBeVisible();

    // Each sync begins only once the one before has ended: after the third
    // has begun, two have run in full
    await periodicSync(page);
    await periodicSync(page);
    await periodicSync(page);

    expect(await folderCopyHash(page, TEST_FOLDER_NAME)).toBe(saved);
  });

  test('only the 10 newest backups are kept', async ({ page }) => {
    // Scenario: Only the 10 newest backups are kept
    const older = Array.from(
      { length: 10 },
      (_, i) => `hemoio-backup-202001${String(i + 1).padStart(2, '0')}T090000000Z.encrypted`
    );
    await putFolderBackups(page, older);
    await askedWhichToKeep(page);

    await conflictDialog(page).getByRole('button', { name: 'Load the folder copy' }).click();

    await expect.poll(() => folderBackupNames(page)).not.toContain(older[0]);
    const names = await folderBackupNames(page);
    expect(names).toHaveLength(10);
    expect(names).toEqual([...older.slice(1), expect.stringMatching(BACKUP_NAME)]);
  });

  test('a newer folder copy waits while set-aside records are unsaved', async ({ page }) => {
    // Scenario: A newer folder copy waits while set-aside records are unsaved
    // A save picker, so the download counts as saved without a question
    await withSavePicker(page, 'save');
    await seedUnreadableRecords(page, { labResults: 1, testValues: 2 });
    await expect(setAsideBanner(page)).toContainText('Folder sync is paused');
    await otherComputerSaves(page, [...SEED_LAB_RESULTS, OTHER_RESULT]);

    await periodicSync(page);
    await periodicSync(page);

    await expect(updatedNotice(page)).toHaveCount(0);
    await expect(page.getByText('Other Computer Clinic')).toHaveCount(0);

    await setAsideBanner(page).getByRole('button', { name: 'Download sealed file' }).click();
    await expect.poll(() => setAsideSavedFlags(page)).toEqual([1, 1, 1]);
    await expect(updatedNotice(page)).toBeVisible();
    await expect(page.getByText('Other Computer Clinic')).toBeVisible();
  });

  test('the conflict dialog is accessible', async ({ page }) => {
    // Scenario: The conflict dialog is accessible
    await askedWhichToKeep(page);
    const dialog = conflictDialog(page);

    await expect(dialog.getByRole('button', { name: 'Decide later' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: 'Folder Sync Paused' })).toBeVisible();

    // Asked again at the next unlock; this time the backup cannot be saved
    await lockApp(page);
    await unlockApp(page);
    await expect(dialog).toBeVisible();
    const folderCopy = await folderCopyHash(page, TEST_FOLDER_NAME);
    // A file where the backups folder would be: nothing can be saved into it
    await folder.write(FOLDER_BACKUPS, 'not a folder');
    await dialog.getByRole('button', { name: 'Load the folder copy' }).click();

    await expect(dialog.getByRole('alert')).toHaveText(
      'Nothing was changed: the backup could not be saved to your folder.'
    );
    await expect(dialog).toBeVisible();
    expect(await folderCopyHash(page, TEST_FOLDER_NAME)).toBe(folderCopy);
    await expect(page.getByText('Other Computer Clinic')).toHaveCount(0);
  });

  test('I can restore a dated folder backup from Settings', async ({ page }) => {
    // Scenario: I can restore a dated folder backup from Settings, after confirming, and the current folder copy is kept as a backup first
    await askedWhichToKeep(page);
    await conflictDialog(page).getByRole('button', { name: "Keep this computer's data" }).click();
    await expect(conflictDialog(page)).toHaveCount(0);
    await expect.poll(() => folderBackupNames(page)).toHaveLength(1);

    await openSettingsTab(page, 'Data');
    const section = page.getByRole('region', { name: 'Folder backups' });
    await expect(section.getByRole('listitem')).toHaveCount(1);
    await expect(section.getByRole('listitem')).toContainText('kept from a choice');
    const restore = section.getByRole('button', { name: /^Restore the backup saved .*, kept from a choice$/ });
    await restore.click();

    const dialog = page.getByRole('dialog', { name: 'Restore folder backup' });
    await expect(dialog).toContainText('Your current folder copy is kept as a dated backup first.');
    await dialog.getByRole('button', { name: 'Restore', exact: true }).click();

    await expect(dialog).toHaveCount(0);
    await expect.poll(() => folderBackupNames(page)).toHaveLength(2);
    await openFromMenu(page, 'Timeline');
    await expect(page.getByText('Other Computer Clinic')).toBeVisible();
    await expect(page.getByText('This Computer Clinic')).toHaveCount(0);
  });

  test("a backup that can't be read is explained, and nothing changes", async ({ page }) => {
    // Scenario: A backup that can't be read is explained, and nothing changes
    await askedWhichToKeep(page);
    await conflictDialog(page).getByRole('button', { name: "Keep this computer's data" }).click();
    await expect.poll(() => folderBackupNames(page)).toHaveLength(1);
    const [name] = await folderBackupNames(page);
    await corruptFolderBackup(page, name);
    const folderCopy = await folderCopyHash(page, TEST_FOLDER_NAME);

    await openSettingsTab(page, 'Data');
    await page
      .getByRole('region', { name: 'Folder backups' })
      .getByRole('button', { name: /^Restore the backup saved / })
      .click();

    await expect(page.getByRole('alert').filter({ hasText: "This backup is damaged or was made with a different key, and can't be opened." })).toBeVisible();
    expect(await folderBackupNames(page)).toEqual([name]);
    expect(await folderCopyHash(page, TEST_FOLDER_NAME)).toBe(folderCopy);
    await openFromMenu(page, 'Timeline');
    await expect(page.getByText('This Computer Clinic').first()).toBeVisible();
  });

  test("a current folder copy that can't be opened is left as it is", async ({ page }) => {
    // Scenario: A current folder copy that can't be opened is left as it is
    await askedWhichToKeep(page);
    await conflictDialog(page).getByRole('button', { name: "Keep this computer's data" }).click();
    await expect.poll(() => folderBackupNames(page)).toHaveLength(1);
    const [name] = await folderBackupNames(page);
    // Damaged after this computer last saw it
    await folder.write(FOLDER_COPY, 'not a folder copy');
    const folderCopy = await folderCopyHash(page, TEST_FOLDER_NAME);

    await openSettingsTab(page, 'Data');
    await page
      .getByRole('region', { name: 'Folder backups' })
      .getByRole('button', { name: /^Restore the backup saved / })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Restore folder backup' });
    await expect(dialog).toContainText("Your current folder copy can't be opened, so HemoIO leaves it as it is.");
    await dialog.getByRole('button', { name: 'Restore', exact: true }).click();

    await expect(dialog).toHaveCount(0);
    await openFromMenu(page, 'Timeline');
    await expect(page.getByText('Other Computer Clinic')).toBeVisible();
    await periodicSync(page);
    await periodicSync(page);
    expect(await folderBackupNames(page)).toEqual([name]);
    expect(await folderCopyHash(page, TEST_FOLDER_NAME)).toBe(folderCopy);
  });
});
