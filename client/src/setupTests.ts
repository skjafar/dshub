import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements neither of these, and the floating primitives need both:
 * Radix measures triggers and content with `ResizeObserver` to position them,
 * and scrolls the active option into view when a Select is opened by keyboard.
 *
 * Stubbing them is not pretending the behaviour works — positioning and
 * scrolling are visual, and are judged in a real browser. It only stops a
 * missing DOM API from failing tests that are about keyboard operation.
 */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

/**
 * jsdom implements no `matchMedia` either, and uPlot calls it unconditionally
 * at module load — to track devicePixelRatio changes — so importing it at all
 * (not only constructing a chart) throws in every test file that pulls in
 * `paneRegistry.ts`, whether or not that file's own suite has anything to do
 * with plotting. The stub is inert, matching the two above: it exists only so
 * a missing DOM API does not fail tests that are not about it.
 */
if (typeof globalThis.matchMedia !== 'function') {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof matchMedia;
}
