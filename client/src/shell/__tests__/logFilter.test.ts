import { describe, it, expect } from 'vitest';
import type { LogEntry } from '../../types/shared';
import { filterLogEntries } from '../logFilter';

const ENTRIES: readonly LogEntry[] = [
  { level: 'info', category: 'connection', message: 'DSHub started', timestamp: 0 },
  { level: 'success', category: 'connection', message: 'Connected to device', timestamp: 1 },
  { level: 'warning', category: 'register', message: 'Invalid data for SPINDLE_RPM', timestamp: 2 },
  { level: 'error', category: 'connection', message: 'Device unresponsive', timestamp: 3 },
  {
    level: 'packet',
    category: 'packet',
    message: 'TX 24 bytes',
    timestamp: 4,
    packetData: {
      direction: 'SENT',
      size: 24,
      hexData: '00 01 02',
      analysis: 'Read request',
      interface: 'TCP',
      destination: '192.168.1.42',
    },
  },
];

const messages = (entries: readonly LogEntry[]): string[] => entries.map(e => e.message);

describe('filterLogEntries', () => {
  it('shows everything when both filters are left at "all"', () => {
    expect(filterLogEntries(ENTRIES, 'all', 'all')).toHaveLength(ENTRIES.length);
  });

  it('narrows by category alone', () => {
    expect(messages(filterLogEntries(ENTRIES, 'connection', 'all'))).toEqual([
      'DSHub started',
      'Connected to device',
      'Device unresponsive',
    ]);
  });

  it('narrows by level alone', () => {
    expect(messages(filterLogEntries(ENTRIES, 'all', 'error'))).toEqual(['Device unresponsive']);
  });

  it('applies both filters together, not either', () => {
    // 'connection' matches three entries and 'success' matches one — the
    // intersection is the single entry that satisfies both, not the union.
    expect(messages(filterLogEntries(ENTRIES, 'connection', 'success'))).toEqual([
      'Connected to device',
    ]);
  });

  it('reaches packet traffic as a level rather than a separate surface', () => {
    expect(messages(filterLogEntries(ENTRIES, 'all', 'packet'))).toEqual(['TX 24 bytes']);
  });

  it('returns nothing when no entry satisfies both filters', () => {
    expect(filterLogEntries(ENTRIES, 'parameter', 'error')).toHaveLength(0);
  });
});
