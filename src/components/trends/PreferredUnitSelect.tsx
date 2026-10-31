/**
 * PreferredUnitSelect Component
 *
 * Searchable select for the unit a biomarker is shown in. Typed text that
 * matches no offered unit shows an error; the current unit stays until an
 * offered one is chosen.
 */

import { useState } from 'react';
import { Box, Group, Select, type ComboboxItem, type OptionsFilter } from '@mantine/core';
import { unitsMatch } from '@services/units';

export interface PreferredUnitSelectProps {
  /** Biomarker display name, for the error message */
  biomarkerName: string;
  /** Units the biomarker can be shown in */
  units: string[];
  /** The unit shown now */
  value: string;
  onChange: (unit: string) => void;
  /** Shown beside the input, in its row: an error below never moves it */
  aside?: React.ReactNode;
}

/** Whether a unit is what the user is typing: part of it, or the whole unit in another spelling */
function offers(unit: string, search: string): boolean {
  return unit.toLowerCase().includes(search.trim().toLowerCase()) || unitsMatch(unit, search);
}

const filterUnits: OptionsFilter = ({ options, search }) =>
  options.filter((option) => offers((option as ComboboxItem).label, search));

export function PreferredUnitSelect({
  biomarkerName,
  units,
  value,
  onChange,
  aside,
}: PreferredUnitSelectProps): React.ReactNode {
  // Search stays uncontrolled so Mantine keeps it in step with the value;
  // this copy only decides whether to show the error
  const [search, setSearch] = useState(value);
  const unsupported = search.trim() !== '' && !units.some((unit) => offers(unit, search));

  return (
    <Select
      label="Preferred unit"
      data={units}
      value={value}
      onChange={(unit) => {
        if (unit) onChange(unit);
      }}
      onSearchChange={setSearch}
      filter={filterUnits}
      // Typing after focusing replaces the shown unit instead of appending
      onFocus={(event) => event.currentTarget.select()}
      searchable
      allowDeselect={false}
      error={unsupported ? `Unit not supported for ${biomarkerName}` : undefined}
      // One line, the input giving way on narrow screens: wrapped, the aside
      // would come between the input and its error
      inputContainer={(input) => (
        <Group gap="sm" wrap="nowrap">
          <Box style={{ flex: '0 1 180px', minWidth: 0 }}>{input}</Box>
          {aside && <Box style={{ display: 'flex', flexShrink: 0 }}>{aside}</Box>}
        </Group>
      )}
    />
  );
}
