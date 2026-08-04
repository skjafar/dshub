/**
 * Narrowing the Activity Log down to what someone is looking for.
 *
 * A live session accumulates thousands of entries, most of them irrelevant to
 * whatever is being chased at the moment — the category says which subsystem
 * produced an entry, the level says how urgent it is, and packet traffic is
 * reached as a `level`, not a separate surface, since a hex dump is still a
 * kind of urgency reading rather than something outside this vocabulary.
 */

import type { LogCategory, LogEntry } from '../types/shared';

export type LogLevel = LogEntry['level'];

export const LOG_CATEGORIES: readonly LogCategory[] = [
  'connection',
  'register',
  'parameter',
  'packet',
  'autoRefresh',
  'plotting',
];

export const LOG_CATEGORY_LABEL: Readonly<Record<LogCategory, string>> = {
  connection: 'Connection',
  register: 'Register',
  parameter: 'Parameter',
  packet: 'Packet',
  autoRefresh: 'Auto-refresh',
  plotting: 'Plotting',
};

export const LOG_LEVELS: readonly LogLevel[] = ['info', 'success', 'warning', 'error', 'packet'];

export const LOG_LEVEL_LABEL: Readonly<Record<LogLevel, string>> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  packet: 'Packet',
};

/** The entries answering a category and a level, in the log's own order. */
export function filterLogEntries(
  entries: readonly LogEntry[],
  category: LogCategory | 'all',
  level: LogLevel | 'all'
): readonly LogEntry[] {
  if (category === 'all' && level === 'all') return entries;
  return entries.filter(
    entry =>
      (category === 'all' || entry.category === category) &&
      (level === 'all' || entry.level === level)
  );
}
