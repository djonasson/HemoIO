import '@testing-library/jest-dom';
import { beforeEach, afterEach } from 'vitest';

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

// jsdom does not implement scrollIntoView; Mantine Select calls it when
// opening its dropdown
Element.prototype.scrollIntoView = () => {};

// Mock ResizeObserver
window.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Test output must be clean: any console output (including React act()
// warnings, which React reports through console.error) fails the test.
// Tests that exercise an expected log must capture it explicitly, e.g.
// `vi.spyOn(console, 'error').mockImplementation(() => {})`, and should
// assert on it.
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
type ConsoleMethod = (typeof CONSOLE_METHODS)[number];
const originalConsole = Object.fromEntries(
  CONSOLE_METHODS.map((method) => [method, console[method]])
) as Record<ConsoleMethod, (...args: unknown[]) => void>;
let unexpectedOutput: string[] = [];

// jsdom reports what it cannot do (e.g. "Not implemented: navigation") on its
// own virtual console, which bypasses the console methods patched below
interface VirtualConsole {
  on(event: 'jsdomError', listener: (error: Error) => void): void;
}
const { jsdom } = globalThis as unknown as { jsdom?: { virtualConsole?: VirtualConsole } };
jsdom?.virtualConsole?.on('jsdomError', (error) => {
  unexpectedOutput.push(`jsdom: ${error.message}`);
});

beforeEach(() => {
  unexpectedOutput = [];
  for (const method of CONSOLE_METHODS) {
    console[method] = (...args: unknown[]) => {
      unexpectedOutput.push(
        `console.${method}: ${args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ')}`
      );
    };
  }
});

afterEach(() => {
  for (const method of CONSOLE_METHODS) {
    console[method] = originalConsole[method];
  }
  if (unexpectedOutput.length > 0) {
    const output = unexpectedOutput.map((line) => line.split('\n')[0]).join('\n');
    unexpectedOutput = [];
    throw new Error(`Unexpected console output during test:\n${output}`);
  }
});
