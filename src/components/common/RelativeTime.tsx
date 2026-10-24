/**
 * A relative time ("5 minutes ago") whose full date is shown in a tooltip.
 * The time element is focusable so keyboard and touch users reach the date too.
 */
import { Text, Tooltip } from '@mantine/core';
import { formatRelativeDateTime, formatRelativeTime } from '@/utils/relativeTime';

const FULL_DATE_TIME = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export interface RelativeTimeProps {
  date: Date;
  /** 'day' for dates without a meaningful time of day, such as lab dates */
  precision?: 'day' | 'minute';
  /** Wraps the relative text, e.g. (r) => `(edited ${r})` */
  template?: (relative: string) => string;
}

export function RelativeTime({
  date,
  precision = 'minute',
  template,
}: RelativeTimeProps): React.ReactNode {
  // A date restored from an old or edited backup may not be readable
  if (Number.isNaN(date.getTime())) {
    return (
      <Text component="span" size="xs" c="dimmed">
        {template ? template('unknown date') : 'unknown date'}
      </Text>
    );
  }

  const relative = precision === 'day' ? formatRelativeTime(date) : formatRelativeDateTime(date);
  const full = precision === 'day' ? date.toLocaleDateString() : FULL_DATE_TIME.format(date);

  return (
    <Tooltip label={full} events={{ hover: true, focus: true, touch: true }}>
      <Text
        component="time"
        dateTime={date.toISOString()}
        tabIndex={0}
        size="xs"
        c="dimmed"
        // Inside clickable cards, reading the date must not activate the card
        onClick={(event) => event.stopPropagation()}
      >
        {template ? template(relative) : relative}
      </Text>
    </Tooltip>
  );
}
