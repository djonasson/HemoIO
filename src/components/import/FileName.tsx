/**
 * A file's name as the import wizard shows it
 */

import { Text, type TextProps } from '@mantine/core';

export interface FileNameProps extends TextProps {
  /** The file's name */
  name: string;
}

/**
 * A file's name, which may wrap anywhere: names often have no spaces
 * ("Referto_Laboratorio_2024.pdf") and would otherwise widen a phone's page.
 * Its row must let it shrink (min-width 0 on the box around it).
 */
export function FileName({ name, ...textProps }: FileNameProps): React.JSX.Element {
  return (
    <Text fw={500} {...textProps} style={{ overflowWrap: 'anywhere' }}>
      {name}
    </Text>
  );
}
