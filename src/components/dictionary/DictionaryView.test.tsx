import { beforeAll, describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DictionaryView } from './DictionaryView';
import { SaveError } from '@data/db/saveError';
import { loadCatalog, type Catalog } from '@data/loinc/catalog';
import { CatalogContext } from '@contexts/useCatalog';

// The list, its search and each detail come from the catalog, loaded as in the unlocked app
let catalog: Catalog;
beforeAll(async () => {
  catalog = await loadCatalog();
});

const GLUCOSE = '2345-7';

const mockSetPersonalTarget = vi.fn();
let mockTargets: Record<string, { low?: number; high?: number }> = {};
vi.mock('@hooks/usePreferences', () => ({
  usePreferences: () => ({
    unitPreferences: {},
    personalTargets: mockTargets,
    isLoaded: true,
    setPreferredUnit: vi.fn(),
    setPersonalTarget: (...args: unknown[]) => mockSetPersonalTarget(...args),
    reload: vi.fn(),
  }),
}));

vi.mock('@hooks/useLabResults', () => ({
  useLabResults: () => ({
    results: [
      {
        id: 1,
        date: new Date('2024-02-20T12:00:00Z'),
        labName: 'Lab',
        testValues: [
          {
            id: 1,
            labResultId: 1,
            // Glucose in mmol/L: one test with glucose in mg/dL
            biomarkerKey: '14749-6',
            value: 7,
            unit: 'mmol/L',
            status: 'high',
          },
        ],
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

const mockShowNotification = vi.fn();
vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => mockShowNotification(...args) },
}));

const scrollTo = vi.fn();

function renderView(initialBiomarkerKey?: string) {
  const onOpenTrend = vi.fn();
  const { container } = render(
    <MantineProvider env="test">
      <CatalogContext.Provider value={catalog}>
        <DictionaryView onOpenTrend={onOpenTrend} initialBiomarkerKey={initialBiomarkerKey} />
      </CatalogContext.Provider>
    </MantineProvider>
  );
  return { onOpenTrend, container };
}

async function openFromSearch(term: string, name: string) {
  await userEvent.type(screen.getByRole('textbox', { name: 'Search biomarkers' }), term);
  await userEvent.click(screen.getByRole('button', { name: `View details for ${name}` }));
}

describe('DictionaryView', () => {
  beforeEach(() => {
    mockTargets = {};
    mockSetPersonalTarget.mockReset().mockResolvedValue(undefined);
    mockShowNotification.mockReset();
    // jsdom does not implement scrolling
    scrollTo.mockReset();
    vi.spyOn(window, 'scrollTo').mockImplementation(scrollTo);
    Object.defineProperty(window, 'scrollY', { value: 240, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('replaces the list with the detail, and Back restores the list', async () => {
    renderView();
    await openFromSearch('gluc', 'Glucose');

    expect(screen.getByRole('heading', { level: 3, name: 'Glucose' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Search biomarkers' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back to biomarker list' }));

    expect(screen.getByRole('textbox', { name: 'Search biomarkers' })).toHaveValue('gluc');
    expect(screen.getByRole('button', { name: 'View details for Glucose' })).toHaveFocus();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 240);
  });

  it('summarises your results and opens the trend', async () => {
    const { onOpenTrend } = renderView();
    await openFromSearch('gluc', 'Glucose');
    const yours = screen.getByRole('region', { name: 'Your results' });
    // 7 mmol/L, in glucose's standard unit
    expect(within(yours).getByText('126 mg/dL')).toBeInTheDocument();

    await userEvent.click(within(yours).getByRole('button', { name: 'View trend' }));
    expect(onOpenTrend).toHaveBeenCalledWith(GLUCOSE);
  });

  it('opens on the requested biomarker, by any code of its trend group', () => {
    renderView('14749-6');

    expect(screen.getByRole('heading', { level: 3, name: 'Glucose' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Search biomarkers' })).not.toBeInTheDocument();
  });

  it('builds the list only when Back asks for it, then focuses its search', async () => {
    const { container } = renderView(GLUCOSE);
    expect(container.querySelector('[data-biomarker-key]')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Back to biomarker list' }));

    const search = screen.getByRole('textbox', { name: 'Search biomarkers' });
    expect(search).toHaveValue('');
    // Never shown before, the list has no item of its own to return focus to
    expect(search).toHaveFocus();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('shows the list for a value that is not a LOINC test', () => {
    renderView('unknown:zorblatin');

    expect(screen.getByRole('textbox', { name: 'Search biomarkers' })).toBeInTheDocument();
  });

  it('says when a biomarker has no recorded values', async () => {
    renderView();
    await openFromSearch('ferritin', 'Ferritin');
    expect(screen.getByText('You have no recorded values for Ferritin')).toBeInTheDocument();
  });

  it('saves a personal target edited from the detail', async () => {
    renderView();
    await openFromSearch('gluc', 'Glucose');
    await userEvent.click(screen.getByRole('button', { name: 'Edit personal target' }));
    await userEvent.type(screen.getByLabelText('Personal target low value'), '70');
    await userEvent.type(screen.getByLabelText('Personal target high value'), '90');
    await userEvent.click(screen.getByRole('button', { name: 'Save Target' }));

    expect(mockSetPersonalTarget).toHaveBeenCalledWith(GLUCOSE, { low: 70, high: 90 });
  });

  it('tells the user when the target could not be saved', async () => {
    mockSetPersonalTarget.mockRejectedValueOnce(new SaveError('quota'));
    renderView();
    await openFromSearch('gluc', 'Glucose');
    await userEvent.click(screen.getByRole('button', { name: 'Edit personal target' }));
    await userEvent.type(screen.getByLabelText('Personal target high value'), '90');
    await userEvent.click(screen.getByRole('button', { name: 'Save Target' }));

    await vi.waitFor(() =>
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Personal target not saved',
          message: expect.stringMatching(/no room left/),
          color: 'red',
        })
      )
    );
  });
});
