import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { NotesView } from './NotesView';
import { useNotes } from '@hooks/useNotes';
import { useLabResults } from '@hooks/useLabResults';
import type { UserNote } from '@/types';

vi.mock('@hooks/useNotes', () => ({ useNotes: vi.fn() }));
vi.mock('@hooks/useLabResults', () => ({ useLabResults: vi.fn() }));
// The fixture LOINC catalog: 2345-7 glucose (mg/dL), 14749-6 glucose (mmol/L)
vi.mock('@contexts/useCatalog', async () => {
  const { fixtureCatalog } = await import('@/test/loincFixture');
  const catalog = fixtureCatalog();
  return { useCatalog: () => catalog };
});

const NOTES: UserNote[] = [
  {
    id: 1,
    labResultId: 1,
    content: 'Felt a headache',
    tags: ['symptoms'],
    createdAt: new Date('2024-01-16T12:00:00Z'),
    updatedAt: new Date('2024-01-16T12:00:00Z'),
  },
  {
    id: 2,
    biomarkerKey: '2345-7',
    testValueId: 2,
    labResultId: 1,
    content: 'Big dinner',
    tags: ['diet'],
    createdAt: new Date('2024-07-05T12:00:00Z'),
    updatedAt: new Date('2024-07-05T12:00:00Z'),
  },
];

function mockNotes(notes: UserNote[], allTags: string[]): void {
  vi.mocked(useNotes).mockReturnValue({
    notes,
    isLoading: false,
    error: null,
    allTags,
  } as unknown as ReturnType<typeof useNotes>);
}

beforeEach(() => {
  mockNotes(NOTES, ['diet', 'symptoms']);
  vi.mocked(useLabResults).mockReturnValue({
    results: [
      {
        id: 1,
        date: new Date('2024-01-15T12:00:00Z'),
        labName: 'Quest Diagnostics',
        createdAt: new Date(),
        updatedAt: new Date(),
        testValues: [
          {
            id: 2,
            labResultId: 1,
            biomarkerKey: '2345-7',
            value: 125,
            unit: 'mg/dL',
            status: 'high',
            rawText: 'Glucose',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        abnormalCount: 1,
        totalCount: 1,
      },
    ],
    undatedResults: [],
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useLabResults>);
});

function renderView() {
  const handlers = { onOpenLabResult: vi.fn(), onOpenTrend: vi.fn() };
  render(
    <MantineProvider env="test">
      <DatesProvider settings={{ locale: 'en' }}>
        <NotesView {...handlers} />
      </DatesProvider>
    </MantineProvider>
  );
  return handlers;
}

describe('NotesView', () => {
  it('lists notes newest first with their attachment', () => {
    renderView();
    const cards = screen.getAllByRole('article');
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Note attached to Glucose · 125 mg/dL · Jan 15, 2024',
      'Note attached to Quest Diagnostics · Jan 15, 2024',
    ]);
  });

  it('navigates to what a note is attached to', async () => {
    const { onOpenLabResult, onOpenTrend } = renderView();

    await userEvent.click(screen.getByRole('button', { name: 'Quest Diagnostics · Jan 15, 2024' }));
    expect(onOpenLabResult).toHaveBeenCalledWith(1);

    await userEvent.click(
      screen.getByRole('button', { name: 'Glucose · 125 mg/dL · Jan 15, 2024' })
    );
    // On the value itself, so Trends opens the line it is on
    expect(onOpenTrend).toHaveBeenCalledWith('2345-7', new Date('2024-01-15T12:00:00Z'), 2);
  });

  it('names a note on an undated result "No date", not a deleted result', () => {
    mockNotes([{ id: 9, content: 'Fasting', tags: [], labResultId: 5, createdAt: new Date(), updatedAt: new Date() }], []);
    vi.mocked(useLabResults).mockReturnValue({
      results: [],
      undatedResults: [
        { id: 5, date: new Date(NaN), labName: 'LabCorp', createdAt: new Date(), updatedAt: new Date(), testValues: [] },
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useLabResults>);

    renderView();

    expect(screen.getByRole('article', { name: 'Note attached to LabCorp · No date' })).toBeInTheDocument();
  });

  it('searches and marks matches', async () => {
    renderView();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search notes' }), 'headache');

    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('headache').tagName).toBe('MARK');
  });

  it('says when no note matches', async () => {
    renderView();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search notes' }), 'zzz');
    expect(screen.getByText('No notes match these filters')).toBeInTheDocument();
  });

  it('explains where notes come from when there are none', () => {
    mockNotes([], []);
    renderView();
    expect(screen.getByText(/No notes yet/)).toBeInTheDocument();
  });

  it('waits for lab results before labelling notes', () => {
    vi.mocked(useLabResults).mockReturnValue({
      results: [],
      undatedResults: [],
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useLabResults>);
    renderView();

    expect(screen.queryByText('Deleted lab result')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByLabelText('Loading notes')).toBeInTheDocument();
  });

  it("files a note under its test, whatever code of the test's trend group it was kept under", async () => {
    mockNotes(
      [
        ...NOTES,
        {
          id: 3,
          biomarkerKey: '14749-6',
          content: 'Fasting',
          tags: [],
          createdAt: new Date('2024-08-01T12:00:00Z'),
          updatedAt: new Date('2024-08-01T12:00:00Z'),
        },
      ],
      ['diet', 'symptoms']
    );
    renderView();

    expect(screen.getByRole('article', { name: 'Note attached to Glucose' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('textbox', { name: 'Filter notes by biomarker' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Glucose']);
    await userEvent.click(options[0]);
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });
});
