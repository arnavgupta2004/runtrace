/**
 * vitest.setup.ts
 *
 * Global test setup for React Testing Library.
 * Provides @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
 * augmented for Vitest's assertion interface.
 *
 * Also installs browser API stubs that jsdom does not provide but that
 * Recharts and other UI libraries depend on.
 */
import "@testing-library/jest-dom/vitest";

// ---------------------------------------------------------------------------
// ResizeObserver stub — Recharts uses this internally.
// ---------------------------------------------------------------------------
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ---------------------------------------------------------------------------
// matchMedia stub — some Recharts internals query this.
// ---------------------------------------------------------------------------
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
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
}
