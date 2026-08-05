/**
 * Threshold evaluation, shared by every bound Widget kind.
 *
 * Each of the sixteen Widget kinds used to carry its own colour-ranges or
 * alarm-rule shape, evaluated by its own bespoke switch. One rule shape and one
 * evaluator is what "learning one Widget teaches you the others" actually
 * requires underneath the shared configuration surface.
 */

import type { StatusRole } from '../../design/status';

export type ThresholdComparator = '<' | '<=' | '>' | '>=';

export interface ThresholdRule {
  readonly id: string;
  readonly comparator: ThresholdComparator;
  readonly value: number;
  /** Never 'info' or 'idle' — a threshold judges a reading, and only ok/warn/error are conditions of one. */
  readonly role: Extract<StatusRole, 'ok' | 'warn' | 'error'>;
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
