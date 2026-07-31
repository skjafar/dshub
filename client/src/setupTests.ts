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
