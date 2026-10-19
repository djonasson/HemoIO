/**
 * Human-readable time since a date: "Today", "3 days ago", "2 months ago"
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffDays = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

/**
 * Like formatRelativeTime, but precise to the minute for the last day:
 * "just now", "5 minutes ago", "3 hours ago", then "Yesterday", "3 days ago"
 */
export function formatRelativeDateTime(date: Date, now: Date = new Date()): string {
  const minutes = Math.floor(Math.max(0, now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return formatRelativeTime(date, now);
}
