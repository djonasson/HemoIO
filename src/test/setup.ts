import '@testing-library/jest-dom';
import { afterAll, beforeEach, afterEach } from 'vitest';

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

// A timer or animation frame left pending when a file's tests end would run
// once the page is gone and fail the run ("window is not defined"). Mantine's
// transitions start one through two animation frames, which unmounting does
// not cancel. Each one still pending is cancelled when the file's tests end.
const pendingTimeouts = new Set<number>();
const pendingFrames = new Set<number>();
const { setTimeout: startTimeout, clearTimeout: stopTimeout } = window;
window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
  const id = startTimeout(
    (...callArgs: unknown[]) => {
      pendingTimeouts.delete(id);
      if (typeof handler === 'function') (handler as (...values: unknown[]) => void)(...callArgs);
    },
    delay,
    ...args
  );
  pendingTimeouts.add(id);
  return id;
}) as typeof window.setTimeout;
window.clearTimeout = ((id?: number) => {
  if (id !== undefined) pendingTimeouts.delete(id);
  stopTimeout(id);
}) as typeof window.clearTimeout;
if (window.requestAnimationFrame) {
  const { requestAnimationFrame: requestFrame, cancelAnimationFrame: cancelFrame } = window;
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    const id = requestFrame((time) => {
      pendingFrames.delete(id);
      callback(time);
    });
    pendingFrames.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id: number) => {
    pendingFrames.delete(id);
    cancelFrame(id);
  };
}
afterAll(() => {
  for (const id of pendingFrames) window.cancelAnimationFrame(id);
  for (const id of pendingTimeouts) stopTimeout(id);
  pendingFrames.clear();
  pendingTimeouts.clear();
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
