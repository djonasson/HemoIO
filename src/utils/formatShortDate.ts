const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** A date as results, notes and the dictionary show it: "Jan 15, 2024" */
export function formatShortDate(date: Date): string {
  return SHORT_DATE.format(date);
}
