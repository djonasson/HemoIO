/**
 * E2E Tests for AI Model Selection
 *
 * See features/ai-model-selection.feature
 */

import { test, expect } from './fixtures';
import {
  MOCK_MODELS,
  analyzeLabReport,
  completeFreshSetup,
  configureAnthropic,
  mockAnthropicApi,
  modelSelect,
  selectModel,
  unlock,
} from './steps/aiModelSelection.steps';
import { openFromMenu, openSettingsTab } from './steps/app.steps';

test.describe('AI Model Selection', () => {
  test('models are loaded from my account and none is preselected', async ({ page }) => {
    await mockAnthropicApi(page);
    await completeFreshSetup(page);
    await configureAnthropic(page);

    await expect(page.getByText(`${MOCK_MODELS.length} models available from your account`)).toBeVisible();
    await expect(modelSelect(page)).toHaveValue('');
  });

  test('the chosen model is used for the next import without reloading', async ({ page }) => {
    const mock = await mockAnthropicApi(page);
    await completeFreshSetup(page);
    await configureAnthropic(page);
    await selectModel(page, 'claude-sonnet-5-5');

    await analyzeLabReport(page);

    expect(mock.requestedModels).toEqual(['claude-sonnet-5-5']);
  });

  test('changing the model applies to the following import', async ({ page }) => {
    const mock = await mockAnthropicApi(page);
    await completeFreshSetup(page);
    await configureAnthropic(page);
    await selectModel(page, 'claude-sonnet-5-5');
    await analyzeLabReport(page);

    await selectModel(page, 'claude-opus-5-5');
    await analyzeLabReport(page);

    expect(mock.requestedModels).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5']);
  });

  test('the chosen model is remembered after reloading', async ({ page }) => {
    await mockAnthropicApi(page);
    await completeFreshSetup(page);
    await configureAnthropic(page);
    await selectModel(page, 'claude-sonnet-5-5');

    await page.reload();
    await unlock(page);
    await openSettingsTab(page, 'AI Configuration');

    await expect(modelSelect(page)).toHaveValue('claude-sonnet-5-5');
  });

  test('import asks me to choose a model when none is selected', async ({ page }) => {
    const mock = await mockAnthropicApi(page);
    await completeFreshSetup(page);
    await configureAnthropic(page);

    // Not goToImport: without a model the Import heading is replaced by the notice
    await openFromMenu(page, 'Import');

    await expect(page.getByRole('heading', { name: 'Model Selection Required' })).toBeVisible();
    await expect(page.getByText(/select a model in Settings/i)).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    expect(mock.requestedModels).toEqual([]);
  });
});
