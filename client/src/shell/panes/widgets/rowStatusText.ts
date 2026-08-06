import type { WidgetReadingStatus } from '../../widgets/useWidgetReading';

/**
 * `WidgetStatusNotice`'s vocabulary, condensed to a word for a table cell or
 * list row — Data Table and Alarm List both hold many bound entries at once,
 * so a full-block notice per row would overwhelm the surface a single-value
 * kind uses it on. Shared so a stale or unbound row reads the same short way
 * in both.
 */
const ROW_STATUS_TEXT: Readonly<Record<Exclude<WidgetReadingStatus, 'ready'>, string>> = {
  unbound: 'Not configured',
  'not-found': 'Not in Map',
  stale: 'Stale',
  pending: '—',
  invalid: 'Invalid',
};

export function rowStatusText(status: Exclude<WidgetReadingStatus, 'ready'>): string {
  return ROW_STATUS_TEXT[status];
}
