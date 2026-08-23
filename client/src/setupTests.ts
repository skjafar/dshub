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

/**
 * jsdom implements no `DragEvent` at all (a known gap — jsdom/jsdom#2913).
 * dockview's own drag-out signal (`onWillDragPanel`'s `nativeEvent`) narrows
 * with `instanceof DragEvent` before reading any of its fields
 * (`useMoveToNewDaughterWindow.ts`'s drag-out listener) — without a
 * stand-in, `DragEvent` is `undefined` in every jsdom test, and `x
 * instanceof undefined` throws rather than returning false. A thin
 * `MouseEvent` subclass is enough: every reader here only ever uses the
 * `MouseEvent` fields it already carries (`screenX`/`screenY`, `target`),
 * never `dataTransfer`. Guarded on `MouseEvent` existing at all, matching
 * this file's other stubs: a plain `node`-environment test file has no DOM
 * globals to extend in the first place.
 */
if (typeof globalThis.MouseEvent !== 'undefined' && typeof globalThis.DragEvent === 'undefined') {
  globalThis.DragEvent = class DragEvent extends MouseEvent {} as unknown as typeof globalThis.DragEvent;
}
