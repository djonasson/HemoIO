import { Anchor, Text, Tooltip } from '@mantine/core';

export interface BiomarkerNameProps {
  name: string;
  /** Shown in a tooltip on hover and keyboard focus */
  description: string | null;
  /** Open the test's trend; the name becomes a link when given */
  onOpen?: () => void;
}

/**
 * A test's name: a link to its trend when it has one, with its description
 * in a tooltip that keyboard users reach too
 */
export function BiomarkerName({ name, description, onOpen }: BiomarkerNameProps): React.ReactNode {
  const label = onOpen ? (
    <Anchor
      component="button"
      type="button"
      size="sm"
      fw={500}
      onClick={onOpen}
      aria-label={`${name}, open trend`}
    >
      {name}
    </Anchor>
  ) : (
    <Text
      size="sm"
      fw={500}
      // Focusable when it has a description, so keyboard users reach the tooltip
      tabIndex={description ? 0 : undefined}
      style={description ? { cursor: 'help', textDecoration: 'underline dotted' } : undefined}
    >
      {name}
    </Text>
  );

  if (!description) return label;
  return (
    <Tooltip label={description} multiline w={300} withArrow events={{ hover: true, focus: true, touch: false }}>
      {label}
    </Tooltip>
  );
}
