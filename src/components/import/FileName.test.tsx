import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { FileName } from './FileName';

describe('FileName', () => {
  it('shows the name, free to wrap anywhere', () => {
    render(
      <MantineProvider env="test">
        <FileName name="Referto_Laboratorio_2024.pdf" size="sm" />
      </MantineProvider>
    );

    expect(screen.getByText('Referto_Laboratorio_2024.pdf')).toHaveStyle({ overflowWrap: 'anywhere' });
  });
});
