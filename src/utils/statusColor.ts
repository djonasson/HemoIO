/**
 * The colour of a test value's status, everywhere a status is shown. Colour
 * never carries the status alone: callers show a word or icon with it.
 */
const STATUS_COLORS: Record<string, string> = {
  high: 'red',
  low: 'orange',
  normal: 'green',
};

export function statusColor(status: string | undefined): string {
  return (status && STATUS_COLORS[status]) || 'gray';
}
