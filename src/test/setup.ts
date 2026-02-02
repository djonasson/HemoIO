import '@testing-library/jest-dom';

// Mock window.matchMedia for Mantine
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver
window.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock crypto.subtle for Web Crypto API
// Note: jsdom provides a basic crypto implementation, but we need to ensure
// the subtle API is available for our encryption tests
if (!window.crypto.subtle) {
  // In case subtle is not available, we'll skip encryption tests
  // Real encryption tests should run in a browser environment
  console.warn('crypto.subtle not available in test environment');
}
