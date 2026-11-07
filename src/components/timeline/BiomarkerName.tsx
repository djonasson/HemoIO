import { Anchor, Text, Tooltip } from '@mantine/core';

export interface BiomarkerNameProps {
  name: string;
  /** Shown in a tooltip on hover and keyboard focus */
  description: string | null;
  /**
   * An element holding the description for screen readers, which do not read
   * the tooltip; kept outside the table cell so the cell's text is the name
   */
  descriptionId?: string;
  /** Open the test's trend; the name becomes a link when given */
  onOpen?: () => void;
}

/**
 * A test's name: a link to its trend when it has one, with its description
 * in a tooltip that keyboard users reach too
 */
export function BiomarkerName({
  name,
  description,
  descriptionId,
  onOpen,
}: BiomarkerNameProps): React.ReactNode {
  const describedBy = description ? descriptionId : undefined;
  const label = onOpen ? (
    <Anchor
      component="button"
      type="button"
      size="sm"
      fw={500}
      onClick={onOpen}
      aria-label={`${name}, open trend`}
      aria-describedby={describedBy}
    >
      {name}
    </Anchor>
  ) : (
    <Text
      size="sm"
      fw={500}
      // Focusable when it has a description, so keyboard users reach the tooltip
      tabIndex={description ? 0 : undefined}
      aria-describedby={describedBy}
      style={description ? { cursor: 'help', textDecoration: 'underline dotted' } : undefined}
    >
      {name}
    </Text>
  );

  if (!description) return label;
  return (
    <Tooltip
      label={description}
      multiline
      w={300}
      withArrow
      // Each part of the description (LOINC's name, HemoIO's text) on a line of its own
      styles={{ tooltip: { whiteSpace: 'pre-line' } }}
      events={{ hover: true, focus: true, touch: false }}
    >
      {label}
    </Tooltip>
  );
}
