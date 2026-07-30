/**
 * Semantic status colour.
 *
 * These are deliberately **theme-invariant**. Previously status was derived from
 * each theme's accent slots (`success → secondary`, `warning → tertiary`), which
 * meant a warning rendered cyan in one theme and orange in another, and success
 * rendered purple in a third. For an operator judging machine state at a glance
 * that is a failure of communication, not a matter of taste.
 *
 * Theme accents keep owning brand, chrome and the primary call-to-action. Status
 * owns the green/amber/red/blue vocabulary and never changes meaning.
 *
 * Two variants per role:
 *   - `main` — foreground use: text, icons, LEDs, chart series, borders.
 *   - `surface` — a low-alpha wash for backgrounds behind `main` text.
 */

export type StatusRole = 'ok' | 'warn' | 'error' | 'info' | 'idle';

export interface StatusColors {
  readonly ok: string;
  readonly warn: string;
  readonly error: string;
  readonly info: string;
  readonly idle: string;
}

/**
 * Tuned against dark surfaces (#0b0d1a–#1a243c). Every value clears 4.5:1 on the
 * darkest surface in the roster; see `contrast.ts` for the assertion.
 */
export const STATUS_DARK: StatusColors = {
  ok: '#4ade80',
  warn: '#fbbf24',
  error: '#ff6b6b',
  info: '#38bdf8',
  idle: '#8b98a9',
};

/**
 * Tuned against light surfaces. The bar is 4.5:1 on the *darkest* light surface
 * in the roster (`#d1daf2`, Blueprint's table-head and dialog-action background),
 * not just on white — the obvious mid-tone choices fail there.
 */
export const STATUS_LIGHT: StatusColors = {
  ok: '#166534',
  warn: '#854d0e',
  error: '#b91c1c',
  info: '#075985',
  idle: '#475569',
};

export function statusColors(mode: 'dark' | 'light'): StatusColors {
  return mode === 'dark' ? STATUS_DARK : STATUS_LIGHT;
}

/**
 * Maps an activity-log level onto a status role.
 * `packet` is diagnostic traffic rather than a condition, so it reads as info.
 */
export function statusRoleForLogLevel(
  level: 'info' | 'warning' | 'error' | 'success' | 'packet'
): StatusRole {
  switch (level) {
    case 'success': return 'ok';
    case 'warning': return 'warn';
    case 'error':   return 'error';
    case 'packet':  return 'info';
    case 'info':
    default:        return 'idle';
  }
}
