const FULL_DATE_TIME = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** A moment as the app shows it in full: "Oct 29, 2026, 8:30 AM" */
export function formatDateTime(date: Date): string {
  return FULL_DATE_TIME.format(date);
}
