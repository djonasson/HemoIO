/**
 * E2E Tests for Import Wizard
 *
 * Tests the import wizard flow including:
 * - Upload step (file selection, validation)
 * - Analysis step (progress, errors)
 * - Review step (editing, validation)
 * - Confirm step (save, navigation)
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test data constants
const TEST_PASSWORD = 'TestPassword123!';

/**
 * Helper to complete first-run setup
 */
async function completeSetup(page: Page, password: string = TEST_PASSWORD) {
  await page.getByPlaceholder(/enter your password/i).fill(password);
  await page.getByPlaceholder(/confirm your password/i).fill(password);
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Complete setup and get started' }).click();
}

/**
 * Helper to unlock the application
 */
async function unlockApp(page: Page, password: string = TEST_PASSWORD) {
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await page.getByRole('button', { name: /unlock/i }).click();
}

/**
 * Helper to detect if app needs setup or just unlock
 */
async function isSetupNeeded(page: Page): Promise<boolean> {
  const hasSetupStepper = await page
    .locator('.mantine-Stepper-root')
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  const hasSetupText = await page
    .getByText(/set up your password|create.*password/i)
    .isVisible({ timeout: 500 })
    .catch(() => false);
  return hasSetupStepper || hasSetupText;
}

/**
 * Helper to setup or unlock as needed
 */
async function setupOrUnlock(page: Page, password: string = TEST_PASSWORD) {
  const needsSetup = await isSetupNeeded(page);
  if (needsSetup) {
    await completeSetup(page, password);
  } else {
    await unlockApp(page, password);
  }

  // Set AI provider to Ollama (doesn't require API key) to allow import tests
  await page.evaluate(() => {
    localStorage.setItem('hemoio_ai_provider', 'ollama');
  });
}

/**
 * Helper to navigate to import page
 */
async function navigateToImport(page: Page) {
  // Ensure AI provider is set to Ollama before navigating (handles refresh scenario)
  await page.evaluate(() => {
    localStorage.setItem('hemoio_ai_provider', 'ollama');
  });
  await page.locator('nav').getByText('Import', { exact: true }).click();
  // Wait for upload interface to load (handles state changes)
  await page.waitForTimeout(500);
}

/**
 * Helper to create a test file
 */
function createTestFile(content: string, filename: string): string {
  const tempDir = path.join(__dirname, '..', 'test-results', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Helper to cleanup temp file
 */
function cleanupTestFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Create a minimal PNG image file for testing
 * This is a 1x1 transparent PNG
 */
function createMockLabReportImage(): string {
  // Minimal 1x1 transparent PNG in base64
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const pngBuffer = Buffer.from(pngBase64, 'base64');
  const tempDir = path.join(__dirname, '..', 'test-results', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const filePath = path.join(tempDir, 'mock-lab-report.png');
  fs.writeFileSync(filePath, pngBuffer);
  return filePath;
}

test.describe('Import Wizard', () => {
  test.describe('Upload Step', () => {
    test('should display upload interface when navigating to Import', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      // Should see the upload area with the actual text
      await expect(page.getByText('Drag files here or click to select')).toBeVisible();
    });

    test('should show supported file types', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      // Should mention supported file types - actual text in UI
      await expect(page.getByText('Supported formats: PDF, JPEG, PNG, WebP, GIF')).toBeVisible();
    });

    test('should allow selecting files via file input', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      // File input should exist
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeAttached();
    });

    test('should display file after upload', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      // Create and upload a test file
      const testFilePath = createMockLabReportImage();
      try {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        // Should show the file name
        await expect(page.getByText('mock-lab-report.png')).toBeVisible({ timeout: 5000 });
      } finally {
        cleanupTestFile(testFilePath);
      }
    });

    test('should allow removing uploaded file', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      const testFilePath = createMockLabReportImage();
      try {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        // Wait for file to appear
        await expect(page.getByText('mock-lab-report.png')).toBeVisible({ timeout: 5000 });

        // Click remove button - uses aria-label="Remove filename"
        const removeButton = page.getByRole('button', { name: 'Remove mock-lab-report.png' });
        await removeButton.click();

        // File should be removed
        await expect(page.getByText('mock-lab-report.png')).not.toBeVisible({ timeout: 3000 });
      } finally {
        cleanupTestFile(testFilePath);
      }
    });

    test('should show analyze button after file upload', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      const testFilePath = createMockLabReportImage();
      try {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        // Wait for file to be added, then check the analyze button with count
        await expect(page.getByText('mock-lab-report.png')).toBeVisible({ timeout: 5000 });
        // The actual analyze button (not the stepper step) shows count
        await expect(
          page.getByRole('button', { name: /^Analyze \(\d+\)$/ })
        ).toBeVisible({ timeout: 5000 });
      } finally {
        cleanupTestFile(testFilePath);
      }
    });

    test('should reject unsupported file types', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      // Create an unsupported file type (note: .exe may be blocked by accept attribute)
      // Use a text file with wrong extension to test rejection
      const testFilePath = createTestFile('executable content', 'test.exe');
      try {
        const fileInput = page.locator('input[type="file"]');

        // Try to upload - the Dropzone has accept filter, so some files may not upload at all
        // Force the file input to accept the file for testing purposes
        await fileInput.setInputFiles(testFilePath).catch(() => {
          // May fail due to accept attribute filtering
        });

        // Either the file is rejected with an error message or it's simply not added
        // Due to the accept attribute, the file may not trigger an error but just won't be accepted
        const hasError = await page.getByText(/Unsupported file type|Some files were rejected/i).isVisible({ timeout: 2000 }).catch(() => false);
        const fileAdded = await page.getByText('test.exe').isVisible({ timeout: 1000 }).catch(() => false);

        // Either we see an error OR the file was not added - both are acceptable outcomes
        expect(hasError || !fileAdded).toBeTruthy();
      } finally {
        cleanupTestFile(testFilePath);
      }
    });
  });

  test.describe('Analysis Step', () => {
    test.skip('should show progress indicator during analysis', async () => {
      // Skip: Requires AI configuration and actual file processing
      // This would need mocking of the AI provider
    });

    test.skip('should handle analysis failure gracefully', async () => {
      // Skip: Requires mocking AI failure scenarios
    });
  });

  test.describe('Review Step', () => {
    test.skip('should display extracted biomarkers', async () => {
      // Skip: Requires completing analysis step first
    });

    test.skip('should show confidence indicators', async () => {
      // Skip: Requires completing analysis step first
    });

    test.skip('should allow editing extracted values', async () => {
      // Skip: Requires completing analysis step first
    });

    test.skip('should allow adding missing values', async () => {
      // Skip: Requires completing analysis step first
    });

    test.skip('should show date picker for lab date', async () => {
      // Skip: Requires completing analysis step first
    });

    test.skip('should display specimen type column for matched biomarkers', async () => {
      // Skip: Requires completing analysis step first
      // When implemented:
      // 1. Complete analysis with mocked AI response
      // 2. Verify Specimen column header is visible
      // 3. Verify matched biomarkers show specimen type (e.g., "Serum", "Urine")
    });

    test.skip('should extract specimen type from biomarker name when unmatched', async () => {
      // Skip: Requires completing analysis step first
      // When implemented:
      // 1. Complete analysis with mocked AI response including unmatched biomarker like "Albumina/L (urine)"
      // 2. Verify the Specimen column shows "Urine" (extracted from name)
      // 3. Verify the biomarker name is displayed without the "(urine)" suffix
    });

    test.skip('should show LOINC code in tooltip on hover', async () => {
      // Skip: Requires completing analysis step first
      // When implemented:
      // 1. Complete analysis with mocked AI response
      // 2. Hover over a matched biomarker name
      // 3. Verify tooltip shows LOINC code and description
    });
  });

  test.describe('Confirm Step', () => {
    test.skip('should show summary of values to be saved', async () => {
      // Skip: Requires completing review step first
    });

    test.skip('should save results and redirect to timeline', async () => {
      // Skip: Requires completing full flow
    });

    test.skip('should allow going back to make changes', async () => {
      // Skip: Requires completing review step first
    });
  });

  test.describe('Accessibility', () => {
    test('upload area should be keyboard accessible', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      // Should be able to tab to upload area or file input
      await page.keyboard.press('Tab');

      // Check for focusable elements in the upload area
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    });

    test('should have accessible labels on form fields', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      // The Dropzone component should be keyboard accessible and announced
      // The dropzone has text content that serves as the accessible description
      const dropzone = page.getByText('Drag files here or click to select');
      await expect(dropzone).toBeVisible();

      // The dropzone parent should be a button or have role that allows interaction
      // Check that the upload area has visible instructions for screen readers
      await expect(page.getByText('Supported formats: PDF, JPEG, PNG, WebP, GIF')).toBeVisible();
      await expect(page.getByText('Maximum file size: 50MB')).toBeVisible();

      // Verify file input exists (even if hidden)
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeAttached();
    });
  });
});

test.describe('Import Wizard - With AI Mocking', () => {
  // These tests would require mocking the AI provider
  // For now, we document them as skipped pending infrastructure

  test.skip('full import flow with mocked AI', async () => {
    // TODO: Implement with AI mocking
    // 1. Upload file
    // 2. Mock AI response with extracted values
    // 3. Review extracted values
    // 4. Confirm and save
    // 5. Verify redirect to timeline
    // 6. Verify data is saved
  });
});
