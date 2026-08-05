import { describe, it, expect } from 'vitest';
import { evaluateThresholds, matchingThresholdRule } from '../threshold';
import type { ThresholdRule } from '../threshold';

function rule(overrides: Partial<ThresholdRule> = {}): ThresholdRule {
  return { id: 'r1', comparator: '>', value: 0, role: 'warn', ...overrides };
}

describe('evaluateThresholds', () => {
  it('reports no status at all when nothing is configured — a Widget with no thresholds has no condition to report', () => {
    expect(evaluateThresholds(42, [])).toBeNull();
  });

  it('reports ok when rules exist but none match', () => {
    const rules = [rule({ comparator: '>', value: 100, role: 'error' })];
    expect(evaluateThresholds(50, rules)).toBe('ok');
  });

  it('reports the matching rule\'s role', () => {
    const rules = [rule({ comparator: '>', value: 100, role: 'error' })];
    expect(evaluateThresholds(150, rules)).toBe('error');
  });

  it('evaluates rules in order and returns the first match', () => {
    const rules = [
      rule({ id: 'warn', comparator: '>', value: 50, role: 'warn' }),
      rule({ id: 'error', comparator: '>', value: 100, role: 'error' }),
    ];
    // 150 satisfies both, but the warn rule is listed first.
    expect(evaluateThresholds(150, rules)).toBe('warn');
  });

  it('reorders to put the more severe rule first when that is the intent', () => {
    const rules = [
      rule({ id: 'error', comparator: '>', value: 100, role: 'error' }),
      rule({ id: 'warn', comparator: '>', value: 50, role: 'warn' }),
    ];
    expect(evaluateThresholds(150, rules)).toBe('error');
    expect(evaluateThresholds(75, rules)).toBe('warn');
  });

  it.each([
    ['<', 5, 4, true],
    ['<', 5, 5, false],
    ['<=', 5, 5, true],
    ['<=', 5, 6, false],
    ['>', 5, 6, true],
    ['>', 5, 5, false],
    ['>=', 5, 5, true],
    ['>=', 5, 4, false],
    ['==', 5, 5, true],
    ['==', 5, 6, false],
  ] as const)('comparator %s against bound %d with value %d matches: %s', (comparator, bound, value, shouldMatch) => {
    const rules = [rule({ comparator, value: bound, role: 'error' })];
    expect(evaluateThresholds(value, rules)).toBe(shouldMatch ? 'error' : 'ok');
  });
});

describe('matchingThresholdRule', () => {
  it('returns null when no rule matches, distinct from the "ok" evaluateThresholds falls back to', () => {
    const rules = [rule({ comparator: '==', value: 1, role: 'ok' })];
    expect(matchingThresholdRule(0, rules)).toBeNull();
  });

  it('returns the first matching rule, label and all, for a discrete state code', () => {
    const rules = [
      rule({ id: 'idle', comparator: '==', value: 0, role: 'idle', label: 'Idle' }),
      rule({ id: 'running', comparator: '==', value: 1, role: 'ok', label: 'Running' }),
    ];
    expect(matchingThresholdRule(1, rules)).toEqual(rules[1]);
  });

  it('a rule need not carry a label — callers fall back to something else when it is absent', () => {
    const rules = [rule({ comparator: '>', value: 0, role: 'warn' })];
    expect(matchingThresholdRule(5, rules)?.label).toBeUndefined();
  });
});
