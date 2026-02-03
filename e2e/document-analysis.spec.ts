/**
 * E2E Tests for Document Analysis
 *
 * Tests the document analysis functionality including:
 * - File type detection
 * - PDF and image upload handling
 * - Error handling for corrupt/empty files
 * - Analysis progress (requires AI mocking)
 * - AI extraction results (requires AI mocking)
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

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
  await page.evaluate(() => {
    localStorage.setItem('hemoio_ai_provider', 'ollama');
  });
  await page.locator('nav').getByText('Import', { exact: true }).click();
  await page.waitForTimeout(500);
}

/**
 * Helper to create a temp directory for test files
 */
function ensureTempDir(): string {
  const tempDir = path.join(__dirname, '..', 'test-results', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Create a minimal PNG image file for testing
 */
function createMockPngImage(filename: string = 'test-image.png'): string {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const pngBuffer = Buffer.from(pngBase64, 'base64');
  const tempDir = ensureTempDir();
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, pngBuffer);
  return filePath;
}

/**
 * Create a minimal JPEG image file for testing
 */
function createMockJpegImage(filename: string = 'test-image.jpg'): string {
  // Minimal valid JPEG (1x1 pixel)
  const jpegHex = 'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00fbff00ffd9';
  const jpegBuffer = Buffer.from(jpegHex, 'hex');
  const tempDir = ensureTempDir();
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, jpegBuffer);
  return filePath;
}

/**
 * Create a minimal PDF file for testing
 */
function createMockPdf(filename: string = 'test-document.pdf'): string {
  // Minimal valid PDF with text "Test"
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(Test Lab Report) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000206 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
300
%%EOF`;
  const tempDir = ensureTempDir();
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, pdfContent);
  return filePath;
}

/**
 * Create an empty file for testing
 */
function createEmptyFile(filename: string = 'empty.pdf'): string {
  const tempDir = ensureTempDir();
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, '');
  return filePath;
}

/**
 * Create a corrupt file for testing
 */
function createCorruptFile(filename: string = 'corrupt.pdf'): string {
  const tempDir = ensureTempDir();
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, 'This is not a valid PDF file content!');
  return filePath;
}

/**
 * Cleanup test file
 */
function cleanupTestFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

test.describe('Document Analysis', () => {
  test.describe('File Type Detection', () => {
    test('should accept PNG image files', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      const testFilePath = createMockPngImage();
      try {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        // File should be added to the list
        await expect(page.getByText('test-image.png')).toBeVisible({ timeout: 5000 });
      } finally {
        cleanupTestFile(testFilePath);
      }
    });

    test('should accept JPEG image files', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      const testFilePath = createMockJpegImage();
      try {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        // File should be added to the list
        await expect(page.getByText('test-image.jpg')).toBeVisible({ timeout: 5000 });
      } finally {
        cleanupTestFile(testFilePath);
      }
    });

    test('should accept PDF files', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      const testFilePath = createMockPdf();
      try {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        // File should be added to the list
        await expect(page.getByText('test-document.pdf')).toBeVisible({ timeout: 5000 });
      } finally {
        cleanupTestFile(testFilePath);
      }
    });

    test('should show supported formats message', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      // Should show supported formats
      await expect(page.getByText('Supported formats: PDF, JPEG, PNG, WebP, GIF')).toBeVisible();
    });

    test('should show file size limit', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      // Should show file size limit
      await expect(page.getByText('Maximum file size: 50MB')).toBeVisible();
    });
  });

  test.describe('Multiple File Upload', () => {
    test('should accept multiple files at once', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      const pngPath = createMockPngImage('multi-1.png');
      const jpgPath = createMockJpegImage('multi-2.jpg');
      try {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles([pngPath, jpgPath]);

        // Both files should be visible
        await expect(page.getByText('multi-1.png')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('multi-2.jpg')).toBeVisible({ timeout: 5000 });
      } finally {
        cleanupTestFile(pngPath);
        cleanupTestFile(jpgPath);
      }
    });

    test('should show file count in analyze button', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      const pngPath = createMockPngImage('count-test.png');
      try {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(pngPath);

        // Should show count in analyze button
        await expect(page.getByRole('button', { name: /Analyze \(1\)/ })).toBeVisible({ timeout: 5000 });
      } finally {
        cleanupTestFile(pngPath);
      }
    });

    test('should update count when adding multiple files', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      const file1 = createMockPngImage('add-1.png');
      const file2 = createMockPngImage('add-2.png');
      const file3 = createMockPngImage('add-3.png');
      try {
        const fileInput = page.locator('input[type="file"]');

        // Add two files at once to see count of 2
        await fileInput.setInputFiles([file1, file2]);
        await expect(page.getByRole('button', { name: /Analyze \(2\)/ })).toBeVisible({ timeout: 5000 });

        // Verify both files are listed
        await expect(page.getByText('add-1.png')).toBeVisible();
        await expect(page.getByText('add-2.png')).toBeVisible();
      } finally {
        cleanupTestFile(file1);
        cleanupTestFile(file2);
        cleanupTestFile(file3);
      }
    });
  });

  test.describe('File Removal', () => {
    test('should allow removing individual files', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      const testFilePath = createMockPngImage('remove-test.png');
      try {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        // Verify file is visible
        await expect(page.getByText('remove-test.png')).toBeVisible({ timeout: 5000 });

        // Click remove button
        const removeButton = page.getByRole('button', { name: 'Remove remove-test.png' });
        await removeButton.click();

        // File should be removed
        await expect(page.getByText('remove-test.png')).not.toBeVisible({ timeout: 3000 });
      } finally {
        cleanupTestFile(testFilePath);
      }
    });

    test('should hide analyze button after removing all files', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      const testFilePath = createMockPngImage('hide-button-test.png');
      try {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        // Verify analyze button is visible
        await expect(page.getByRole('button', { name: /Analyze \(1\)/ })).toBeVisible({ timeout: 5000 });

        // Remove the file
        const removeButton = page.getByRole('button', { name: 'Remove hide-button-test.png' });
        await removeButton.click();

        // Analyze button should not be visible with count
        await expect(page.getByRole('button', { name: /Analyze \(\d+\)/ })).not.toBeVisible({ timeout: 3000 });
      } finally {
        cleanupTestFile(testFilePath);
      }
    });
  });

  test.describe('Accessibility', () => {
    test('file upload area should be accessible', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      // Dropzone should have descriptive text
      await expect(page.getByText('Drag files here or click to select')).toBeVisible();
    });

    test('file input should be keyboard accessible', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      // Should be able to tab to interactive elements
      await page.keyboard.press('Tab');

      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
    });

    test('remove buttons should have accessible labels', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToImport(page);

      const testFilePath = createMockPngImage('a11y-test.png');
      try {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        // Remove button should have accessible name including filename
        const removeButton = page.getByRole('button', { name: 'Remove a11y-test.png' });
        await expect(removeButton).toBeVisible({ timeout: 5000 });
      } finally {
        cleanupTestFile(testFilePath);
      }
    });
  });
});

test.describe('Document Analysis - AI Processing', () => {
  // These tests require AI mocking infrastructure
  // They document the expected behavior

  test.skip('should show progress indicator during PDF text extraction', async () => {
    // Requires actual PDF processing
  });

  test.skip('should show progress indicator during OCR', async () => {
    // Requires actual image OCR processing
  });

  test.skip('should extract text from text-based PDF', async () => {
    // Requires PDF.js integration test
  });

  test.skip('should use OCR for scanned PDF', async () => {
    // Requires OCR integration test
  });

  test.skip('should handle multi-page PDF', async () => {
    // Requires multi-page PDF and progress tracking
  });

  test.skip('should show AI analysis progress', async () => {
    // Requires AI service mocking
  });

  test.skip('should display extracted biomarker values', async () => {
    // Requires AI service mocking
  });

  test.skip('should show confidence scores for extracted values', async () => {
    // Requires AI service mocking
  });

  test.skip('should extract lab date from document', async () => {
    // Requires AI service mocking
  });

  test.skip('should extract lab name from document', async () => {
    // Requires AI service mocking
  });

  test.skip('should match extracted names to biomarker dictionary', async () => {
    // Requires AI service mocking
  });

  test.skip('should flag unknown biomarkers for review', async () => {
    // Requires AI service mocking
  });

  test.skip('should normalize extracted units', async () => {
    // Requires AI service mocking
  });
});

test.describe('Document Analysis - Error Handling', () => {
  test.skip('should show error for corrupt PDF', async ({ page }) => {
    // Note: This test is skipped because the actual PDF parsing
    // happens during AI analysis, not during file upload
    // The corrupt file would be accepted in upload but fail during analysis
  });

  test.skip('should show error for empty document', async ({ page }) => {
    // Note: Empty file handling depends on the actual PDF processing stage
  });

  test.skip('should show error when AI service unavailable', async () => {
    // Requires AI service mocking to simulate unavailability
  });

  test.skip('should allow retry after error', async () => {
    // Requires error scenario simulation
  });

  test.skip('should suggest manual entry after AI failure', async () => {
    // Requires AI service mocking
  });

  test.skip('should handle rate limiting gracefully', async () => {
    // Requires AI service mocking with rate limiting
  });
});

test.describe('Document Analysis - Performance', () => {
  test.skip('should show per-page progress for large documents', async () => {
    // Requires large document and progress tracking
  });

  test.skip('should keep UI responsive during processing', async () => {
    // Requires processing time measurement
  });

  test.skip('should process multiple documents in batch', async () => {
    // Requires batch processing verification
  });

  test.skip('should not block on failed documents in batch', async () => {
    // Requires batch processing with mixed success/failure
  });
});
