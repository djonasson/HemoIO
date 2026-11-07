import { Box, Stack, Text, UnstyledButton } from '@mantine/core';
import { NOT_A_LOINC_TEST } from './notLoincTest';
import { TestNotes } from './TestNotes';
import { TestOptionName } from './TestOptionName';
import { UnitsText } from './UnitsText';
import type { TestOptionLayoutProps } from './testOptionLayout';

/** A card's frame, as a bordered Paper's */
const CARD = {
  border: '1px solid var(--mantine-color-default-border)',
  borderRadius: 'var(--mantine-radius-sm)',
};

/** The tests on a phone: one card each, its parts as labelled lines, the whole card a button */
export function TestOptionCards({ options, current, notLoinc, unit, onChoose }: TestOptionLayoutProps) {
  return (
    <Stack gap="xs" role="group" aria-label="Tests">
      <UnstyledButton p="sm" style={CARD} aria-current={notLoinc ? 'true' : undefined} onClick={() => onChoose(null)}>
        <TestOptionName current={notLoinc} label={NOT_A_LOINC_TEST} />
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
            <TestOptionName current={isCurrent} option={option} />
            {/* Spans only: a button holds phrasing content */}
            <Box component="span" display="block" mt={4} pl={20}>
              <Text span size="xs" display="block">
                Sample: {option.sample}
              </Text>
              <Text span size="xs" display="block">
                Method: {option.method || '—'}
              </Text>
              <Text span size="xs">
                Units:
              </Text>
              <UnitsText option={option} unit={unit} />
              <Text span size="xs" display="block">
                Code: {option.code}
              </Text>
              <TestNotes option={option} />
            </Box>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
