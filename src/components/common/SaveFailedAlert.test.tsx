import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SaveError } from '@data/db/saveError';
import { SaveFailedAlert } from './SaveFailedAlert';

function renderAlert(error: unknown) {
  render(
    <MantineProvider env="test">
      <SaveFailedAlert title="Note not saved" error={error} />
    </MantineProvider>
  );
}

describe('SaveFailedAlert', () => {
  it('says what was not saved and why, as an alert', () => {
    renderAlert(new SaveError('quota'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Note not saved');
    expect(alert).toHaveTextContent(/no room left/);
  });

  it('never shows the text of the error, which can quote stored data', () => {
    renderAlert(new DOMException('Key already exists: Glucose 125 mg/dL', 'ConstraintError'));

    expect(screen.getByRole('alert')).not.toHaveTextContent(/Glucose|125/);
  });
});
