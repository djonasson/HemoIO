import { useMemo } from 'react';
import { Box, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useCatalog } from '@contexts/useCatalog';
import { testOptionsFor } from '@services/analysis/testOptions';
import { TestOptionCards } from './TestOptionCards';
import { TestOptionTable } from './TestOptionTable';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

/** Where the tests no longer fit side by side, and the list takes the whole screen */
export const PHONE_QUERY = '(max-width: 48em)';

interface TestOptionListProps {
  biomarker: MatchedBiomarker;
  /** The search, as far as the list has caught up with it */
  query: string;
  onChoose: (code: string | null) => void;
}

/**
 * The tests to choose for a value, side by side or, on a phone, as cards.
 * Rendered only while its dialog is open, so a closed one costs nothing.
 */
export function TestOptionList({ biomarker, query, onChoose }: TestOptionListProps) {
  const catalog = useCatalog();
  const isPhone = useMediaQuery(PHONE_QUERY) ?? false;
  const options = useMemo(() => testOptionsFor(catalog, biomarker, query), [catalog, biomarker, query]);
  const layout = {
    options,
    current: biomarker.loincCode,
    notLoinc: biomarker.savedAsUnknown === true && !biomarker.loincCode,
    unit: biomarker.unit,
    onChoose,
  };

  return (
    <Box mt="sm" mah={isPhone ? undefined : '60vh'} style={{ overflowY: 'auto' }}>
      {isPhone ? <TestOptionCards {...layout} /> : <TestOptionTable {...layout} />}
      {query.trim() && options.length === 0 && (
        <Text size="sm" c="dimmed" role="status" mt="xs">
          No test found
        </Text>
      )}
    </Box>
  );
}
