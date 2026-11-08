import { Group, Text } from '@mantine/core';
import { CurrentMark } from './CurrentMark';
import { shownName } from './testOptionLayout';
import type { TestOptionDetails } from '@services/analysis/testOptions';

interface TestOptionNameProps {
  current: boolean;
  /** The test, shown as what it measures and its kind; none for "Not a LOINC test" */
  option?: TestOptionDetails;
  /** The text for a choice that is no test */
  label?: string;
}

/** A choice's name with the current one marked, as both layouts show it */
export function TestOptionName({ current, option, label }: TestOptionNameProps): React.ReactElement {
  return (
    // Spans only: it sits in a button, which holds phrasing content
    <Group component="span" gap={6} wrap="nowrap" align="flex-start">
      <CurrentMark current={current} />
      <Text span size="sm" fw={current ? 600 : option ? 500 : undefined}>
        {option ? option.title : label}
        {option?.kind && (
          <Text span size="xs" c="dimmed" fw={400}>
            {shownName(option).slice(option.title.length)}
          </Text>
        )}
      </Text>
    </Group>
  );
}
