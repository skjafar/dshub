/**
 * Threshold evaluation, shared by every bound Widget kind.
 *
 * Each of the sixteen Widget kinds used to carry its own colour-ranges or
 * alarm-rule shape, evaluated by its own bespoke switch. One rule shape and one
 * evaluator is what "learning one Widget teaches you the others" actually
 * requires underneath the shared configuration surface.
 */

import type { StatusRole } from '../../design/status';

/**
 * `==` exists for a discrete state code (a machine-state register, a mode
 * byte) rather than a numeric band — State LED's whole configuration is nothing
 * but a list of `== value` rules, one per named state, which is what lets it
 * reuse this module instead of carrying its own state-to-colour map.
 */
export type ThresholdComparator = '<' | '<=' | '>' | '>=' | '==';

export interface ThresholdRule {
  readonly id: string;
  readonly comparator: ThresholdComparator;
  readonly value: number;
  /**
   * Never 'info' — a threshold judges a reading, and 'info' names no
   * condition one can be in. 'idle' is here for a discrete state that is
   * meaningfully neutral (a machine's own "not yet started" state, say)
   * rather than a numeric band with nothing below it.
   */
  readonly role: Extract<StatusRole, 'ok' | 'warn' | 'error' | 'idle'>;
  /**
   * The name of the state this rule matches — "Running", "E-Stop". Read by
   * State LED, which shows it in place of the raw formatted value; every
   * other kind ignores it, since colour alone is how they carry condition.
   */
  readonly label?: string;
}

function matches(value: number, comparator: ThresholdComparator, bound: number): boolean {
  switch (comparator) {
    case '<':
      return value < bound;
    case '<=':
      return value <= bound;
    case '>':
      return value > bound;
    case '>=':
      return value >= bound;
    case '==':
      return value === bound;
  }
}

/**
 * The condition a reading is in, judged by the first rule (in listed order)
 * whose comparison it satisfies.
 *
 * Returns `null` when no rules are configured at all — a Widget nobody has set
 * a threshold on has no condition to report, which is a different thing from
 * reporting a good one. Once rules exist, a value none of them catches reads as
 * `'ok'`: thresholds are authored as "warn past here, error past there", and
 * everything below the lowest bound is implicitly fine.
 */
export function evaluateThresholds(value: number, rules: readonly ThresholdRule[]): StatusRole | null {
  for (const rule of rules) {
    if (matches(value, rule.comparator, rule.value)) return rule.role;
  }
  return rules.length > 0 ? 'ok' : null;
}

/**
 * The first rule (in listed order) whose comparison a reading satisfies, or
 * `null` when none does.
 *
 * Distinct from {@link evaluateThresholds}: that function's `'ok'` fallback
 * has no particular rule behind it, so it has no label to offer. State LED
 * calls this instead, to show the matched rule's own name rather than a
 * formatted number.
 */
export function matchingThresholdRule(
  value: number,
  rules: readonly ThresholdRule[]
): ThresholdRule | null {
  for (const rule of rules) {
    if (matches(value, rule.comparator, rule.value)) return rule;
  }
  return null;
}
