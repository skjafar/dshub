/**
 * Joins CSS Module class names, dropping anything falsy.
 *
 * Every primitive composes a base class with conditional modifiers and an
 * optional caller-supplied `className`. Doing that inline meant the same
 * `.filter(Boolean).join(' ')` in six components, each an opportunity to leave
 * an `undefined` in the attribute.
 */
export function cx(...classes: readonly (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
