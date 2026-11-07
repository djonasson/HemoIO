import { Box, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { CurrentMark } from './CurrentMark';
import { TestNotes } from './TestNotes';
import { UnitsText } from './UnitsText';
import type { TestOptionDetails } from '@services/analysis/testOptions';

/** A card's frame, as a bordered Paper's */
const CARD = {
  border: '1px solid var(--mantine-color-default-border)',
  borderRadius: 'var(--mantine-radius-sm)',
};

interface TestOptionCardsProps {
  options: TestOptionDetails[];
  /** The code the value is saved as, if any */
  current: string | undefined;
  /** Whether the value is saved as "Not a LOINC test" */
  notLoinc: boolean;
  /** The value's own unit */
  unit: string;
  notLoincLabel: string;
  onChoose: (code: string | null) => void;
}

/** The tests on a phone: one card each, its parts as labelled lines, the whole card a button */
export function TestOptionCards({ options, current, notLoinc, unit, notLoincLabel, onChoose }: TestOptionCardsProps) {
  return (
    <Stack gap="xs" role="group" aria-label="Tests">
      <UnstyledButton p="sm" style={CARD} aria-current={notLoinc ? 'true' : undefined} onClick={() => onChoose(null)}>
        <Group component="span" gap={6} wrap="nowrap">
          <CurrentMark current={notLoinc} />
          <Text span size="sm" fw={notLoinc ? 600 : undefined}>
            {notLoincLabel}
          </Text>
        </Group>
      </UnstyledButton>
      {options.map((option) => {
        const isCurrent = current === option.code;
        return (
          <UnstyledButton
            key={option.code}
            p="sm"
            style={CARD}
            aria-current={isCurrent ? 'true' : undefined}
            aria-label={`${option.name} · ${option.code}`}
            onClick={() => onChoose(option.code)}
          >
            {/* Spans only: a button holds phrasing content */}
            <Group component="span" gap={6} wrap="nowrap" align="flex-start">
              <CurrentMark current={isCurrent} />
              <Text span size="sm" fw={isCurrent ? 600 : 500}>
                {option.component}
                <Text span size="xs" c="dimmed" fw={400}>
                  {' · '}
                  {option.kind}
                </Text>
              </Text>
            </Group>
            <Text span size="xs" display="block" mt={4} pl={20}>
              Sample: {option.sample}
            </Text>
            <Text span size="xs" display="block" pl={20}>
              Method: {option.method || '—'}
            </Text>
            <Box component="span" display="block" pl={20}>
              <Text span size="xs">
                Units:
              </Text>
              <UnitsText option={option} unit={unit} />
            </Box>
            <Text span size="xs" display="block" pl={20}>
              Code: {option.code}
            </Text>
            <Box component="span" display="block" pl={20}>
              <TestNotes option={option} />
            </Box>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
