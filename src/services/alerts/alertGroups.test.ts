import { describe, it, expect } from 'vitest';
import { groupAlerts, type GroupableAlert } from './alertGroups';

const d = (iso: string) => new Date(`${iso}T10:00:00Z`);

interface TestAlert extends GroupableAlert {
  id: string;
}

function alert(
  id: string,
  date: string,
  options: Partial<Omit<TestAlert, 'id' | 'date'>> = {}
): TestAlert {
  return {
    id,
    biomarkerKey: 'glucose',
    type: 'out_of_range',
    severity: 'warning',
    date: d(date),
    ...options,
  };
}

describe('groupAlerts', () => {
  it('makes one card per test, headed by its latest result', () => {
    const { groups } = groupAlerts(
      [
        alert('g1', '2024-01-15'),
        alert('g2', '2024-03-10'),
        alert('h1', '2024-02-01', { biomarkerKey: 'hemoglobin' }),
      ],
      {},
      {}
    );

    expect(groups.map((g) => g.biomarkerKey)).toEqual(['glucose', 'hemoglobin']);
    const glucose = groups[0];
    expect(glucose.headline.id).toBe('g2');
    expect(glucose.resultCount).toBe(2);
    expect(glucose.newCount).toBe(2);
    expect(glucose.earlier.map((r) => r.alert.id)).toEqual(['g1']);
  });

  it('lists earlier results most recent first', () => {
    const { groups } = groupAlerts(
      [alert('a', '2024-01-15'), alert('c', '2024-05-20'), alert('b', '2024-03-10')],
      {},
      {}
    );

    expect(groups[0].headline.id).toBe('c');
    expect(groups[0].earlier.map((r) => r.alert.id)).toEqual(['b', 'a']);
  });

  it('attaches a trend to its card rather than heading it', () => {
    const { groups } = groupAlerts(
      [alert('r', '2024-03-10'), alert('t', '2024-03-10', { type: 'trend' })],
      {},
      {}
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].headline.id).toBe('r');
    expect(groups[0].trend?.id).toBe('t');
    expect(groups[0].resultCount).toBe(1);
  });

  it('heads a card with its improvement, every out-of-range result being earlier', () => {
    const { groups } = groupAlerts(
      [
        alert('r', '2024-01-15'),
        alert('i', '2024-03-10', { type: 'improvement', severity: 'positive' }),
      ],
      {},
      {}
    );

    expect(groups[0].headline.id).toBe('i');
    expect(groups[0].earlier.map((r) => r.alert.id)).toEqual(['r']);
    expect(groups[0].resultCount).toBe(1);
  });

  it('counts acknowledged results but only new ones as new', () => {
    const { groups } = groupAlerts(
      [alert('a', '2024-01-15'), alert('b', '2024-03-10'), alert('c', '2024-05-20')],
      { glucose: d('2024-03-10') },
      {}
    );

    expect(groups[0].resultCount).toBe(3);
    expect(groups[0].newCount).toBe(1);
    expect(groups[0].earlier.map((r) => r.isNew)).toEqual([false, false]);
  });

  it('hides a card with nothing new, and counts it as hidden', () => {
    const result = groupAlerts(
      [alert('a', '2024-01-15'), alert('b', '2024-03-10')],
      { glucose: d('2024-03-10') },
      {}
    );

    expect(result.groups).toEqual([]);
    expect(result.hiddenCount).toBe(1);
  });

  it('shows an acknowledged test again for a later improvement, with no new results', () => {
    const { groups } = groupAlerts(
      [
        alert('r', '2024-01-15'),
        alert('i', '2024-03-10', { type: 'improvement', severity: 'positive' }),
      ],
      { glucose: d('2024-01-15') },
      {}
    );

    expect(groups[0].headline.id).toBe('i');
    expect(groups[0].newCount).toBe(0);
  });

  it('hides a dismissed card until a later alert arrives', () => {
    const alerts = [alert('a', '2024-01-15'), alert('b', '2024-03-10')];

    const dismissed = groupAlerts(alerts, {}, { glucose: d('2024-03-10') });
    expect(dismissed.groups).toEqual([]);
    expect(dismissed.hiddenCount).toBe(1);

    const later = groupAlerts([...alerts, alert('c', '2024-05-20')], {}, { glucose: d('2024-03-10') });
    expect(later.groups[0].newCount).toBe(3);
  });

  it('orders cards by their most severe new alert, then by latest date', () => {
    const { groups } = groupAlerts(
      [
        // An old critical result already acknowledged does not lift the card
        alert('g-old', '2024-01-01', { severity: 'critical' }),
        alert('g-new', '2024-06-01'),
        alert('h', '2024-02-01', { biomarkerKey: 'hemoglobin', severity: 'critical' }),
        alert('l', '2024-05-01', { biomarkerKey: 'ldl' }),
      ],
      { glucose: d('2024-01-01') },
      {}
    );

    expect(groups.map((g) => g.biomarkerKey)).toEqual(['hemoglobin', 'glucose', 'ldl']);
    expect(groups[1].severity).toBe('warning');
  });

  it('dates a card by its latest alert, for acknowledging or dismissing it', () => {
    const { groups } = groupAlerts(
      [alert('a', '2024-01-15'), alert('b', '2024-03-10')],
      {},
      {}
    );

    expect(groups[0].latestDate).toEqual(d('2024-03-10'));
  });
});
