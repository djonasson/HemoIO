import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PWAUpdatePrompt } from './PWAUpdatePrompt';

// Mock the virtual PWA register module
const mockUpdateServiceWorker = vi.fn();
const mockSetNeedRefresh = vi.fn();
let mockNeedRefresh = true;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: vi.fn(() => ({
    needRefresh: [mockNeedRefresh, mockSetNeedRefresh],
    updateServiceWorker: mockUpdateServiceWorker,
    offlineReady: [false, vi.fn()],
  })),
}));

function renderPWAUpdatePrompt() {
  return render(
    <MantineProvider>
      <PWAUpdatePrompt />
    </MantineProvider>
  );
}

describe('PWAUpdatePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNeedRefresh = true;
  });

  describe('Rendering', () => {
    it('renders alert when update is needed', () => {
      mockNeedRefresh = true;
      renderPWAUpdatePrompt();

      expect(screen.getByText('Update Available')).toBeInTheDocument();
    });

    it('shows update message', () => {
      mockNeedRefresh = true;
      renderPWAUpdatePrompt();

      expect(screen.getByText(/A new version of HemoIO is available/)).toBeInTheDocument();
    });

    it('renders Update Now button', () => {
      mockNeedRefresh = true;
      renderPWAUpdatePrompt();

      expect(screen.getByRole('button', { name: /Update Now/i })).toBeInTheDocument();
    });

    it('renders Later button', () => {
      mockNeedRefresh = true;
      renderPWAUpdatePrompt();

      expect(screen.getByRole('button', { name: /Later/i })).toBeInTheDocument();
    });

    it('does not render when update is not needed', () => {
      mockNeedRefresh = false;
      renderPWAUpdatePrompt();

      expect(screen.queryByText('Update Available')).not.toBeInTheDocument();
    });
  });

  describe('Update button', () => {
    it('calls updateServiceWorker when clicked', () => {
      mockNeedRefresh = true;
      renderPWAUpdatePrompt();

      fireEvent.click(screen.getByRole('button', { name: /Update Now/i }));

      expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);
    });
  });

  describe('Dismiss button', () => {
    it('hides prompt when Later button is clicked', () => {
      mockNeedRefresh = true;
      renderPWAUpdatePrompt();

      fireEvent.click(screen.getByRole('button', { name: /Later/i }));

      expect(mockSetNeedRefresh).toHaveBeenCalledWith(false);
    });

    it('hides prompt when close button is clicked', () => {
      mockNeedRefresh = true;
      renderPWAUpdatePrompt();

      // Mantine Alert close button has aria-label "Dismiss"
      const closeButton = screen.getByRole('button', { name: /Dismiss/i });
      fireEvent.click(closeButton);

      expect(mockSetNeedRefresh).toHaveBeenCalledWith(false);
    });
  });
});
