/**
 * What stops an import from continuing: the first few problems, and the
 * rest a click away
 */

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, List, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

/** Problems shown before the user asks for the rest */
const PROBLEMS_SHOWN_FIRST = 5;

interface ContinueProblemsProps {
  /** Each problem, as a sentence that says how to fix it */
  problems: string[];
  onClose: () => void;
}

/**
 * The "Cannot Continue" alert: the first problems, and a button that shows
 * the rest and moves focus to the first of them, as the button goes
 */
export function ContinueProblems({ problems, onClose }: ContinueProblemsProps): React.ReactNode {
  const [showAll, setShowAll] = useState(false);
  const firstRevealed = useRef<HTMLLIElement>(null);
  const hidden = problems.length - PROBLEMS_SHOWN_FIRST;
  const shown = showAll ? problems : problems.slice(0, PROBLEMS_SHOWN_FIRST);

  useEffect(() => {
    if (showAll) firstRevealed.current?.focus();
  }, [showAll]);

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
          <List.Item
            key={index}
            ref={index === PROBLEMS_SHOWN_FIRST ? firstRevealed : undefined}
            tabIndex={index === PROBLEMS_SHOWN_FIRST ? -1 : undefined}
            // A file name has no spaces to wrap at, and the alert clips
            style={{ overflowWrap: 'anywhere' }}
          >
            {problem}
          </List.Item>
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
