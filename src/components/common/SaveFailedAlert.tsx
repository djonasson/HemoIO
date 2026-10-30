/**
 * SaveFailedAlert Component
 *
 * What was not saved and why, announced to screen readers as it appears.
 * The reason comes from the error's kind only: the error's own text, which
 * can quote stored data, is never shown.
 */

import { Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { saveErrorMessage } from '@data/db/saveError';

export interface SaveFailedAlertProps {
  /** What was not saved, e.g. "Note not saved" */
  title: string;
  /** The error the save failed with */
  error: unknown;
}

export function SaveFailedAlert({ title, error }: SaveFailedAlertProps): React.ReactNode {
  return (
    <Alert role="alert" color="red" variant="light" title={title} icon={<IconAlertCircle size={16} />}>
      {saveErrorMessage(error)}
    </Alert>
  );
}
