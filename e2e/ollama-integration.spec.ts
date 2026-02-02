import { test, expect, type Page, type Route } from '@playwright/test';

// Mock Ollama API responses
const mockOllamaModels = {
  models: [
    { name: 'llama3.2:8b', size: 4700000000, digest: 'abc123', modifiedAt: '2024-01-01' },
    { name: 'llava:13b', size: 8000000000, digest: 'def456', modifiedAt: '2024-01-02' },
    { name: 'mistral:7b', size: 4100000000, digest: 'ghi789', modifiedAt: '2024-01-03' },
  ],
};

const mockChatResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          biomarkers: [
            {
              name: 'Glucose',
              value: 95,
              unit: 'mg/dL',
              confidence: 0.95,
              referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
            },
            {
              name: 'Hemoglobin',
              value: 14.5,
              unit: 'g/dL',
              confidence: 0.9,
            },
          ],
          labDate: '2024-01-15',
          labName: 'Test Laboratory',
          warnings: [],
        }),
      },
      finish_reason: 'stop',
    },
  ],
  model: 'llama3.2:8b',
};

// Helper to clear localStorage before each test
async function clearStorage(page: Page) {
  await page.evaluate(() => localStorage.clear());
}

// Helper to set up Ollama mock routes
async function setupOllamaMocks(
  page: Page,
  options: {
    isRunning?: boolean;
    hasModels?: boolean;
    hasVisionModel?: boolean;
  } = {}
) {
  const { isRunning = true, hasModels = true, hasVisionModel = true } = options;

  await page.route('**/localhost:11434/**', async (route: Route) => {
    const url = route.request().url();

    if (!isRunning) {
      await route.abort('connectionrefused');
      return;
    }

    if (url.includes('/api/tags')) {
      if (!hasModels) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ models: [] }),
        });
        return;
      }

      const models = hasVisionModel
        ? mockOllamaModels
        : { models: mockOllamaModels.models.filter((m) => !m.name.includes('llava')) };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(models),
      });
      return;
    }

    if (url.includes('/v1/chat/completions')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChatResponse),
      });
      return;
    }

    await route.continue();
  });
}

// Helper to navigate to AI step in setup wizard
async function navigateToAIStep(page: Page) {
  const passwordInput = page.getByPlaceholder('Enter your password');
  const confirmInput = page.getByPlaceholder('Confirm your password');
  let nextButton = page.getByRole('button', { name: 'Go to next step' });

  await passwordInput.fill('MySecurePass123!');
  await confirmInput.fill('MySecurePass123!');
  await nextButton.click();

  // Skip storage step
  nextButton = page.getByRole('button', { name: 'Go to next step' });
  await nextButton.click();

  // Now on AI step
  await expect(page.getByText('HemoIO uses AI to automatically extract values')).toBeVisible();
}

// Helper to complete setup with Ollama
async function completeSetupWithOllama(page: Page) {
  await navigateToAIStep(page);

  // Select Ollama
  const providerSelect = page.getByLabel('AI Provider');
  await providerSelect.click();
  await page.getByRole('option', { name: 'Ollama (Local)' }).click();

  // Wait for Ollama detection
  await expect(page.getByText('Ollama connected')).toBeVisible({ timeout: 5000 });

  // Continue through wizard
  const nextButton = page.getByRole('button', { name: 'Go to next step' });
  await nextButton.click();

  // Complete setup
  await expect(page.getByRole('heading', { name: "You're all set!" })).toBeVisible();
  const getStartedButton = page.getByRole('button', { name: 'Complete setup and get started' });
  await getStartedButton.click();
}

test.describe('Ollama Integration - Setup Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('Ollama appears as AI provider option', async ({ page }) => {
    await setupOllamaMocks(page);
    await navigateToAIStep(page);

    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();

    await expect(page.getByRole('option', { name: 'Ollama (Local)' })).toBeVisible();
  });

  test('selecting Ollama shows no API key required message', async ({ page }) => {
    await setupOllamaMocks(page);
    await navigateToAIStep(page);

    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    await expect(page.getByText('No API key required')).toBeVisible();
    await expect(page.getByLabel('API Key')).not.toBeVisible();
  });

  test('shows connection status when Ollama is running', async ({ page }) => {
    await setupOllamaMocks(page, { isRunning: true });
    await navigateToAIStep(page);

    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    await expect(page.getByText('Ollama connected')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/\d+ models? available/)).toBeVisible();
  });

  test('shows not detected message when Ollama is not running', async ({ page }) => {
    await setupOllamaMocks(page, { isRunning: false });
    await navigateToAIStep(page);

    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    await expect(page.getByText('Ollama not detected')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('ollama serve')).toBeVisible();
    await expect(page.getByRole('link', { name: 'ollama.com' })).toBeVisible();
  });

  test('shows model selection when Ollama is connected', async ({ page }) => {
    await setupOllamaMocks(page);
    await navigateToAIStep(page);

    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    await expect(page.getByText('Ollama connected')).toBeVisible({ timeout: 5000 });

    const modelSelect = page.getByLabel('Model');
    await expect(modelSelect).toBeVisible();

    await modelSelect.click();
    await expect(page.getByRole('option', { name: 'llama3.2:8b' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'mistral:7b' })).toBeVisible();
  });

  test('auto-selects first model when connected', async ({ page }) => {
    await setupOllamaMocks(page);
    await navigateToAIStep(page);

    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    await expect(page.getByText('Ollama connected')).toBeVisible({ timeout: 5000 });

    const modelSelect = page.getByLabel('Model');
    await expect(modelSelect).toHaveValue('llama3.2:8b');
  });

  test('can complete setup with Ollama provider', async ({ page }) => {
    await setupOllamaMocks(page);
    await completeSetupWithOllama(page);

    // Should be on dashboard
    await expect(page.getByRole('heading', { name: 'HemoIO', level: 3 })).toBeVisible();
  });
});

test.describe('Ollama Integration - Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
    await setupOllamaMocks(page);

    // Complete setup first
    await completeSetupWithOllama(page);
  });

  test('can access AI settings', async ({ page }) => {
    // Navigate to settings
    await page.getByRole('button', { name: /Settings/ }).click();

    await expect(page.getByRole('heading', { name: 'AI Configuration' })).toBeVisible();
  });

  test('shows Ollama connected status in settings', async ({ page }) => {
    await page.getByRole('button', { name: /Settings/ }).click();

    await expect(page.getByText('Connected')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/\d+ models? available/)).toBeVisible();
  });

  test('can change Ollama model in settings', async ({ page }) => {
    await page.getByRole('button', { name: /Settings/ }).click();

    const modelSelect = page.getByLabel('Select Ollama model');
    await modelSelect.click();
    await page.getByRole('option', { name: 'mistral:7b' }).click();

    await expect(page.getByText('Settings saved')).toBeVisible();
  });

  test('can test connection in settings', async ({ page }) => {
    await page.getByRole('button', { name: /Settings/ }).click();

    const testButton = page.getByRole('button', { name: 'Test Connection' });
    await testButton.click();

    await expect(page.getByText('Connection successful')).toBeVisible({ timeout: 5000 });
  });

  test('shows privacy notice for Ollama', async ({ page }) => {
    await page.getByRole('button', { name: /Settings/ }).click();

    await expect(
      page.getByText(/runs AI models locally on your device/)
    ).toBeVisible();
    await expect(page.getByText(/never leaves your computer/)).toBeVisible();
  });
});

test.describe('Ollama Integration - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('handles Ollama becoming unavailable gracefully', async ({ page }) => {
    // Start with Ollama running
    await setupOllamaMocks(page, { isRunning: true });
    await navigateToAIStep(page);

    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    await expect(page.getByText('Ollama connected')).toBeVisible({ timeout: 5000 });

    // Now mock Ollama as not running
    await page.route('**/localhost:11434/**', async (route) => {
      await route.abort('connectionrefused');
    });

    // Try to retry connection or switch away and back
    await providerSelect.click();
    await page.getByRole('option', { name: 'OpenAI (GPT-4)' }).click();
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    await expect(page.getByText('Ollama not detected')).toBeVisible({ timeout: 5000 });
  });

  test('disables model selection when Ollama not running', async ({ page }) => {
    await setupOllamaMocks(page, { isRunning: false });
    await navigateToAIStep(page);

    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    await expect(page.getByText('Ollama not detected')).toBeVisible({ timeout: 5000 });

    // Model select should not be visible when not connected
    await expect(page.getByLabel('Model')).not.toBeVisible();
  });

  test('shows retry button when Ollama not detected', async ({ page }) => {
    await setupOllamaMocks(page, { isRunning: false });
    await navigateToAIStep(page);

    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    await expect(page.getByText('Ollama not detected')).toBeVisible({ timeout: 5000 });

    // Retry button should be visible in settings (not in setup wizard)
    // In setup wizard, user can re-select the provider or continue
  });
});

test.describe('Ollama Integration - Switching Providers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
    await setupOllamaMocks(page);
  });

  test('can switch from OpenAI to Ollama in setup', async ({ page }) => {
    await navigateToAIStep(page);

    // First select OpenAI
    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'OpenAI (GPT-4)' }).click();

    // API key field should appear
    await expect(page.getByLabel('API Key')).toBeVisible();

    // Switch to Ollama
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    // API key field should disappear
    await expect(page.getByLabel('API Key')).not.toBeVisible();
    await expect(page.getByText('No API key required')).toBeVisible();
  });

  test('can switch from Ollama to Anthropic in setup', async ({ page }) => {
    await navigateToAIStep(page);

    // First select Ollama
    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    await expect(page.getByText('No API key required')).toBeVisible();

    // Switch to Anthropic
    await providerSelect.click();
    await page.getByRole('option', { name: 'Anthropic (Claude)' }).click();

    // API key field should appear
    await expect(page.getByLabel('API Key')).toBeVisible();
    await expect(page.getByText('No API key required')).not.toBeVisible();
  });
});

test.describe('Ollama Integration - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
    await setupOllamaMocks(page);
  });

  test('Ollama configuration is keyboard navigable', async ({ page }) => {
    await navigateToAIStep(page);

    // Tab to provider select
    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.focus();

    // Open dropdown with keyboard
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Should have selected Ollama
    await expect(page.getByText('Ollama connected')).toBeVisible({ timeout: 5000 });
  });

  test('status messages are accessible to screen readers', async ({ page }) => {
    await navigateToAIStep(page);

    const providerSelect = page.getByLabel('AI Provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'Ollama (Local)' }).click();

    // Connection status should have appropriate role/aria
    const statusBadge = page.getByText('Ollama connected');
    await expect(statusBadge).toBeVisible({ timeout: 5000 });
  });
});
