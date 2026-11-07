/**
 * E2E Tests for setting HemoIO up from a folder copy
 *
 * See features/setup-from-folder.feature
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { TEST_PASSWORD, completeSetup, setupOrUnlock, storedCredentials, unlockApp } from './steps/app.steps';
import { lockApp } from './steps/changePassword.steps';
import { SEED_LAB_RESULTS, SEED_TEST_VALUES, seedLabData } from './steps/data.steps';
import {
  FOLDER_NAME,
  folderCopyHash,
  folderPermissionQueries,
  installFolderPicker,
  switchToFolderStorage,
  writeForeignFolderCopy,
} from './steps/folderRestore.steps';
import { existingDataStep, keepExistingDataAside } from './steps/setup.steps';
import {
  LOCK_FILE,
  damageFolderCopy,
  folderFileText,
  folderRecoveryStep,
  forgetHemoIO,
  openFolderRecovery,
  putFolderCopy,
  recoverFromFolder,
  recoveryPassword,
} from './steps/setupFromFolder.steps';
import { setAsideBanner, writeUnreadableRecords } from './steps/unreadableRecords.steps';
import { PREVIOUS_FOLDER_COPY, skippedSyncNotice } from './steps/folderSync.steps';
import { FOLDER_BACKUPS, folderBackupNames, readFolderCopyText } from './steps/otherComputer.steps';
import { goToTimeline, labResultCards } from './steps/timeline.steps';

const LATER_RESULT = {
  id: 3,
  date: '2024-06-06T09:00:00.000Z',
  labName: 'New Clinic',
  createdAt: '2024-06-06T09:00:00.000Z',
  updatedAt: '2024-06-06T09:00:00.000Z',
};

/**
 * Background: my data is kept in a folder, which holds a copy of two lab
 * results saved with my password. Returns the copy's fingerprint.
 */
async function folderWithCopy(page: Page): Promise<string> {
  await installFolderPicker(page);
  await page.goto('/');
  await setupOrUnlock(page);
  await seedLabData(page);
  await switchToFolderStorage(page);
  await expect.poll(() => folderCopyHash(page)).not.toBeNull();
  return (await folderCopyHash(page))!;
}

/** Then HemoIO should be open with the folder copy's two lab results on the timeline */
async function expectBothResults(page: Page): Promise<void> {
  await expect(page.locator('nav').getByText('Settings', { exact: true })).toBeVisible();
  await goToTimeline(page);
  await expect(labResultCards(page)).toHaveCount(2);
}

/** Wait until the sync that starts at unlock has asked about the folder, and is done */
async function settledSync(page: Page): Promise<void> {
  let queries = -1;
  await expect
    .poll(async () => {
      const before = queries;
      queries = await folderPermissionQueries(page);
      return queries > 0 && queries === before;
    })
    .toBe(true);
}

/** Then the alert says this, and nothing was stored */
async function expectRefused(page: Page, message: string | RegExp): Promise<void> {
  await expect(folderRecoveryStep(page).getByRole('alert')).toContainText(message);
  expect(await storedCredentials(page)).toBeNull();
}

test.describe('Set up from a folder copy', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Folder storage needs the File System Access API, which only Chromium has'
  );

  test('after this browser forgot HemoIO, I restore from my folder with my password', async ({ page }) => {
    // Scenario: After this browser forgot HemoIO, I restore from my folder with my password
    // Scenario: My password stays the same
    const hash = await folderWithCopy(page);
    await forgetHemoIO(page, { keepDatabase: false });

    await expect(page.getByRole('button', { name: 'Set up HemoIO' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'I already have a folder copy' })).toBeVisible();
    await recoverFromFolder(page, TEST_PASSWORD);

    await expectBothResults(page);
    expect(await page.evaluate(() => localStorage.getItem('hemoio_storage_provider'))).toBe('filesystem');
    // The lock is the folder's: the same password
    const lock = JSON.parse((await storedCredentials(page))!) as unknown;
    expect(lock).toEqual((JSON.parse(await readFolderCopyText(page)) as { lock: unknown }).lock);
    await settledSync(page);
    expect(await folderCopyHash(page)).toBe(hash);

    await lockApp(page);
    await unlockApp(page, TEST_PASSWORD);
    await expectBothResults(page);
    expect(await folderCopyHash(page)).toBe(hash);

    // Until a change, which reaches the folder again
    await seedLabData(page, { labResults: [...SEED_LAB_RESULTS, LATER_RESULT] });
    await expect.poll(() => folderCopyHash(page)).not.toBe(hash);
  });

  test('on another computer, I set up from the shared folder', async ({ page }) => {
    // Scenario: On another computer, I set up from the shared folder
    await folderWithCopy(page);
    await forgetHemoIO(page, { keepDatabase: false, forgetFolder: true });

    await recoverFromFolder(page, TEST_PASSWORD);

    await expectBothResults(page);
  });

  test('a wrong password is refused, and I can try again', async ({ page }) => {
    // Scenario: A wrong password is refused, and I can try again
    await folderWithCopy(page);
    await forgetHemoIO(page, { keepDatabase: false });

    await recoverFromFolder(page, 'Not-My-Passw0rd!');

    await expectRefused(page, "That password doesn't open this copy.");
    await expect(recoveryPassword(page)).toBeFocused();
    await expect(recoveryPassword(page)).toHaveValue('');

    await recoveryPassword(page).fill(TEST_PASSWORD);
    await folderRecoveryStep(page).getByRole('button', { name: 'Unlock and restore' }).click();
    await expectBothResults(page);
  });

  test('a folder without a copy is explained', async ({ page }) => {
    // Scenario: A folder without a copy is explained
    await installFolderPicker(page);
    await page.goto('/');

    await recoverFromFolder(page, TEST_PASSWORD);

    await expectRefused(page, 'This folder has no HemoIO copy.');
  });

  test('an old copy without a lock is explained', async ({ page }) => {
    // Scenario: An old copy without a lock is explained
    await installFolderPicker(page);
    await page.goto('/');
    await writeForeignFolderCopy(page, 'legacy-other-key');

    await recoverFromFolder(page, TEST_PASSWORD);

    await expectRefused(
      page,
      'This copy was saved before HemoIO kept the password lock in the folder. Only the browser that saved it can restore it.'
    );
  });

  test('a damaged folder copy is recovered from its previous copy', async ({ page }) => {
    // Scenario: A damaged folder copy is recovered from its previous copy
    await folderWithCopy(page);
    const twoResults = await readFolderCopyText(page);
    // The lock is kept beside the copy too
    expect((JSON.parse((await folderFileText(page, LOCK_FILE))!) as { lock: unknown }).lock).toEqual(
      (JSON.parse(twoResults) as { lock: unknown }).lock
    );
    await seedLabData(page, {
      labResults: [...SEED_LAB_RESULTS, LATER_RESULT],
      testValues: SEED_TEST_VALUES,
    });
    await expect.poll(() => folderFileText(page, PREVIOUS_FOLDER_COPY)).not.toBeNull();
    await expect.poll(() => readFolderCopyText(page)).not.toBe(twoResults);
    await damageFolderCopy(page);
    const damagedCopy = await readFolderCopyText(page);
    await forgetHemoIO(page, { keepDatabase: false });

    await recoverFromFolder(page, TEST_PASSWORD);

    // The previous copy held the two results from before the third
    await expectBothResults(page);
    await expect(page.getByText('Restored from an earlier copy')).toBeVisible();
    await expect(page.getByText(/HemoIO restored the previous copy saved on/)).toBeVisible();
    // The damaged copy is kept as a dated backup, sealed whole under the key, with no lock in plain text
    const backups = await folderBackupNames(page, FOLDER_NAME);
    expect(backups).toHaveLength(1);
    const kept = (await folderFileText(page, `${FOLDER_BACKUPS}/${backups[0]}`))!;
    expect(JSON.parse(kept)).toMatchObject({ format: 'hemoio-damaged-copy', version: 1, lock: null });
    const damagedLock = (JSON.parse(damagedCopy) as { lock: { wrappedKey: string; kekSalt: string } }).lock;
    expect(kept).not.toContain(damagedLock.wrappedKey);
    expect(kept).not.toContain(damagedLock.kekSalt);
    await settledSync(page);
    await expect(skippedSyncNotice(page)).toHaveCount(0);
    // The folder copy opens again, with my lock in it and beside it
    const lock = JSON.parse((await storedCredentials(page))!) as unknown;
    expect((JSON.parse(await readFolderCopyText(page)) as { lock: unknown }).lock).toEqual(lock);
    expect((JSON.parse((await folderFileText(page, LOCK_FILE))!) as { lock: unknown }).lock).toEqual(lock);
    await lockApp(page);
    await unlockApp(page, TEST_PASSWORD);
    await expectBothResults(page);
  });

  test('a damaged copy with nothing earlier to restore stores nothing', async ({ page }) => {
    // Scenario: A damaged copy with nothing earlier to restore stores nothing
    await folderWithCopy(page);
    await damageFolderCopy(page);
    await forgetHemoIO(page, { keepDatabase: false });

    await recoverFromFolder(page, TEST_PASSWORD);

    await expectRefused(page, /can't be opened with your password.*or the file is damaged/);
  });

  test('data still in this browser becomes readable again, and I choose if it differs', async ({ page }) => {
    // Scenario: Data still in this browser becomes readable again, and I choose if it differs
    await folderWithCopy(page);
    const twoResults = await readFolderCopyText(page);
    await seedLabData(page, {
      labResults: [...SEED_LAB_RESULTS, LATER_RESULT],
      testValues: SEED_TEST_VALUES,
    });
    await expect.poll(() => readFolderCopyText(page)).not.toBe(twoResults);
    // The folder copy is the one from before the third result
    await putFolderCopy(page, twoResults);
    await forgetHemoIO(page, { keepDatabase: true });

    await expect(existingDataStep(page)).toBeVisible();
    await recoverFromFolder(page, TEST_PASSWORD);

    await expect(page.getByRole('dialog', { name: 'Your folder copy changed on another computer' })).toBeVisible();
    // Nothing was replaced unasked: the folder copy is still the older one
    expect(await readFolderCopyText(page)).toBe(twoResults);
  });

  test("records set aside earlier come back when the folder's key opens them", async ({ page }) => {
    // Scenario: Records set aside earlier come back when the folder's key opens them
    const hash = await folderWithCopy(page);
    // The lock is lost, and a new setup keeps this setup's records aside
    await forgetHemoIO(page, { keepDatabase: true });
    await keepExistingDataAside(page);
    await completeSetup(page, 'Other-Passw0rd1!');
    await expect(setAsideBanner(page)).toBeVisible();
    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(0);

    // Then that lock is lost too, and I set up from the folder
    await forgetHemoIO(page, { keepDatabase: true });
    await expect(existingDataStep(page)).toBeVisible();
    await recoverFromFolder(page, TEST_PASSWORD);

    await expectBothResults(page);
    await settledSync(page);
    await expect(setAsideBanner(page)).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Your folder copy changed on another computer' })).toHaveCount(0);
    expect(await folderCopyHash(page)).toBe(hash);
  });

  test('leftover data of another setup is kept aside when I restore from my folder', async ({ page }) => {
    // Scenario: Leftover data of another setup is kept aside when I restore from my folder
    await folderWithCopy(page);
    await forgetHemoIO(page, { keepDatabase: false });
    await expect(page.getByRole('button', { name: 'Set up HemoIO' })).toBeVisible();
    await writeUnreadableRecords(page, { labResults: 1, testValues: 2 });
    await page.reload();

    const step = existingDataStep(page);
    await expect(step.getByRole('button', { name: 'Keep it aside and set up anew' })).toBeFocused();
    await recoverFromFolder(page, TEST_PASSWORD);

    await expectBothResults(page);
    await expect(setAsideBanner(page)).toContainText("3 stored records can't be opened");
  });

  test('the recovery step is accessible', async ({ page }) => {
    // Scenario: The recovery step is accessible
    await installFolderPicker(page);
    await page.goto('/');
    await openFolderRecovery(page);
    const step = folderRecoveryStep(page);
    const choose = step.getByRole('button', { name: 'Choose folder' });
    const submit = step.getByRole('button', { name: 'Unlock and restore' });

    // Every field is labelled, and focus starts on the first thing to do
    await expect(recoveryPassword(page)).toBeVisible();
    await expect(choose).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(step.getByText(FOLDER_NAME, { exact: true })).toBeVisible();
    await expect(choose).toBeFocused();

    // Tab runs through the step in order
    await page.keyboard.press('Tab');
    await expect(recoveryPassword(page)).toBeFocused();
    await page.keyboard.type(TEST_PASSWORD);
    const reached: string[] = [];
    for (let i = 0; i < 4 && !(await submit.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
      reached.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''));
    }
    expect(reached.filter((name) => name === 'Back' || name === 'Unlock and restore')).toEqual([
      'Back',
      'Unlock and restore',
    ]);

    // A problem is announced, and focus moves to it
    await page.keyboard.press('Enter');
    const alert = step.getByRole('alert');
    await expect(alert).toContainText('This folder has no HemoIO copy.');
    await expect(alert).toBeFocused();

    // And I can go back to the screen before it
    await step.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('button', { name: 'Set up HemoIO' })).toBeVisible();
  });
});
