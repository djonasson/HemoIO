/**
 * What stops an import from continuing: the first few problems, and the
 * rest a click away
 */

import { useState } from 'react';
import { Alert, Button, List, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

/** Problems shown before the user asks for the rest */
const PROBLEMS_SHOWN_FIRST = 5;

interface ContinueProblemsProps {
  /** Each problem, as a sentence that says how to fix it */
  problems: string[];
  onClose: () => void;
}

export function ContinueProblems({ problems, onClose }: ContinueProblemsProps) {
  const [showAll, setShowAll] = useState(false);
  const hidden = problems.length - PROBLEMS_SHOWN_FIRST;
  const shown = showAll ? problems : problems.slice(0, PROBLEMS_SHOWN_FIRST);

  return (
    <Alert
      icon={<IconAlertTriangle size={16} />}
      title="Cannot Continue"
      color="red"
      withCloseButton
      closeButtonLabel="Dismiss"
      onClose={onClose}
    >
      <Text size="sm">Please fix the following issues:</Text>
      <List size="sm" mt={4}>
        {shown.map((problem, index) => (
          <List.Item key={index}>{problem}</List.Item>
        ))}
      </List>
      {!showAll && hidden > 0 && (
        <Button variant="subtle" color="red" size="compact-sm" mt="xs" onClick={() => setShowAll(true)}>
          Show {hidden} more
        </Button>
      )}
    </Alert>
  );
}
