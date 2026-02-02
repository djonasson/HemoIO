/**
 * Tests for TimelineFilters component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { TimelineFilters } from './TimelineFilters';
import type { LabResultFilters } from '@hooks/useLabResults';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MantineProvider>
      <DatesProvider settings={{ locale: 'en' }}>{ui}</DatesProvider>
    </MantineProvider>
  );
}

describe('TimelineFilters', () => {
  it('should render search input', () => {
    renderWithProviders(
      <TimelineFilters filters={{}} onFiltersChange={() => {}} />
    );

    expect(screen.getByLabelText(/search by lab name/i)).toBeInTheDocument();
  });

  it('should render date range inputs', () => {
    renderWithProviders(
      <TimelineFilters filters={{}} onFiltersChange={() => {}} />
    );

    expect(screen.getByLabelText(/filter from date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter to date/i)).toBeInTheDocument();
  });

  it('should not show clear button when no filters active', () => {
    renderWithProviders(
      <TimelineFilters filters={{}} onFiltersChange={() => {}} />
    );

    expect(
      screen.queryByRole('button', { name: /clear/i })
    ).not.toBeInTheDocument();
  });

  it('should show clear button when search filter is active', () => {
    const filters: LabResultFilters = { searchTerm: 'Quest' };
    renderWithProviders(
      <TimelineFilters filters={filters} onFiltersChange={() => {}} />
    );

    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('should show clear button when date filter is active', () => {
    const filters: LabResultFilters = { startDate: new Date('2024-01-01') };
    renderWithProviders(
      <TimelineFilters filters={filters} onFiltersChange={() => {}} />
    );

    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('should call onFiltersChange when search changes', () => {
    const handleChange = vi.fn();
    renderWithProviders(
      <TimelineFilters filters={{}} onFiltersChange={handleChange} />
    );

    const searchInput = screen.getByLabelText(/search by lab name/i);
    fireEvent.change(searchInput, { target: { value: 'Quest' } });

    expect(handleChange).toHaveBeenCalledWith({ searchTerm: 'Quest' });
  });

  it('should call onFiltersChange with undefined when search is cleared', () => {
    const handleChange = vi.fn();
    const filters: LabResultFilters = { searchTerm: 'Quest' };
    renderWithProviders(
      <TimelineFilters filters={filters} onFiltersChange={handleChange} />
    );

    const searchInput = screen.getByLabelText(/search by lab name/i);
    fireEvent.change(searchInput, { target: { value: '' } });

    expect(handleChange).toHaveBeenCalledWith({ searchTerm: undefined });
  });

  it('should call onFiltersChange when clear button is clicked', () => {
    const handleChange = vi.fn();
    const filters: LabResultFilters = {
      searchTerm: 'Quest',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
    };
    renderWithProviders(
      <TimelineFilters filters={filters} onFiltersChange={handleChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(handleChange).toHaveBeenCalledWith({});
  });

  it('should display current search term', () => {
    const filters: LabResultFilters = { searchTerm: 'LabCorp' };
    renderWithProviders(
      <TimelineFilters filters={filters} onFiltersChange={() => {}} />
    );

    const searchInput = screen.getByLabelText(
      /search by lab name/i
    ) as HTMLInputElement;
    expect(searchInput.value).toBe('LabCorp');
  });

  it('should have accessible clear button', () => {
    const filters: LabResultFilters = { searchTerm: 'Quest' };
    renderWithProviders(
      <TimelineFilters filters={filters} onFiltersChange={() => {}} />
    );

    expect(
      screen.getByRole('button', { name: /clear all filters/i })
    ).toBeInTheDocument();
  });
});
