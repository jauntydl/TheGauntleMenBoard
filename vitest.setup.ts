import '@testing-library/jest-dom/vitest';

// jsdom ships no ResizeObserver; MUI X DataGrid constructs one on mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom reports every element as 0x0, so DataGrid virtualises all rows away.
// Give layout a non-zero viewport so rows actually render.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  value: 1024,
});
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  value: 768,
});
Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => ({
    width: 1024, height: 768, top: 0, left: 0, bottom: 768, right: 1024,
    x: 0, y: 0, toJSON: () => {},
  }),
});

// jsdom implements no matchMedia; MUI's useMediaQuery needs one. Defaults to
// the desktop branch (matches: false) so component tests see all columns.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
