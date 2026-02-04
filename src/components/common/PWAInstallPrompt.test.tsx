import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PWAInstallPrompt } from './PWAInstallPrompt';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function renderPWAInstallPrompt() {
  return render(
    <MantineProvider>
      <PWAInstallPrompt />
    </MantineProvider>
  );
}

function createMockInstallPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted'): BeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('PWAInstallPrompt', () => {
  let originalMatchMedia: typeof window.matchMedia;
  let originalLocalStorage: Storage;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock matchMedia to return not standalone
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)' ? false : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    // Mock localStorage
    originalLocalStorage = window.localStorage;
    const mockStorage: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => mockStorage[key] || null),
        setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
        removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
        clear: vi.fn(() => { Object.keys(mockStorage).forEach(key => delete mockStorage[key]); }),
      },
      writable: true,
    });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, 'localStorage', { value: originalLocalStorage, writable: true });
  });

  describe('Rendering', () => {
    it('does not render initially without beforeinstallprompt event', () => {
      renderPWAInstallPrompt();

      expect(screen.queryByText('Install HemoIO')).not.toBeInTheDocument();
    });

    it('renders install prompt when beforeinstallprompt event fires', () => {
      renderPWAInstallPrompt();

      const event = createMockInstallPromptEvent();
      fireEvent(window, event);

      expect(screen.getByText('Install HemoIO')).toBeInTheDocument();
    });

    it('renders install button', () => {
      renderPWAInstallPrompt();

      const event = createMockInstallPromptEvent();
      fireEvent(window, event);

      expect(screen.getByRole('button', { name: /Install App/i })).toBeInTheDocument();
    });

    it('does not render when app is in standalone mode', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      renderPWAInstallPrompt();

      const event = createMockInstallPromptEvent();
      fireEvent(window, event);

      expect(screen.queryByText('Install HemoIO')).not.toBeInTheDocument();
    });
  });

  describe('Install button', () => {
    it('calls prompt when install button is clicked', async () => {
      renderPWAInstallPrompt();

      const event = createMockInstallPromptEvent();
      fireEvent(window, event);

      fireEvent.click(screen.getByRole('button', { name: /Install App/i }));

      expect(event.prompt).toHaveBeenCalled();
    });
  });

  describe('Dismiss', () => {
    it('hides prompt when dismiss button is clicked', () => {
      renderPWAInstallPrompt();

      const event = createMockInstallPromptEvent();
      fireEvent(window, event);

      expect(screen.getByText('Install HemoIO')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));

      expect(screen.queryByText('Install HemoIO')).not.toBeInTheDocument();
    });

    it('stores dismiss timestamp in localStorage', () => {
      renderPWAInstallPrompt();

      const event = createMockInstallPromptEvent();
      fireEvent(window, event);

      fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'pwa-install-dismissed',
        expect.any(String)
      );
    });
  });
});
