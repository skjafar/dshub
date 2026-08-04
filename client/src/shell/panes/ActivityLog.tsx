import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { Button, Select, cx } from '../../ui';
import type { SelectOption } from '../../ui';
import { ROW_HEIGHT } from '../../design/tokens';
import { statusRoleForLogLevel } from '../../design/status';
import type { StatusRole } from '../../design/status';
import type { LogCategory, LogEntry } from '../../types/shared';
import {
  LOG_CATEGORIES,
  LOG_CATEGORY_LABEL,
  LOG_LEVELS,
  LOG_LEVEL_LABEL,
  filterLogEntries,
} from '../logFilter';
import type { LogLevel } from '../logFilter';
import styles from './ActivityLog.module.css';

const ROW_HEIGHT_PX = Number.parseInt(ROW_HEIGHT, 10);

/** Rows rendered outside the viewport on either side, so a fast scroll never outruns them into a blank frame. */
const OVERSCAN = 6;

export interface ActivityLogProps {
  /** Oldest first, as the log holds it. Rendered newest first — see below. */
  readonly entries: readonly LogEntry[];
  readonly category: LogCategory | 'all';
  readonly onCategoryChange: (category: LogCategory | 'all') => void;
  readonly level: LogLevel | 'all';
  readonly onLevelChange: (level: LogLevel | 'all') => void;
  /**
   * The packet entry currently expanded, identified by reference rather than
   * position. New entries prepend in the newest-first list, which shifts every
   * older entry's index on the very next arrival — a position would point at a
   * different entry within a second of being set.
   */
  readonly selected: LogEntry | null;
  readonly onSelect: (entry: LogEntry) => void;
  readonly onClear: () => void;
}

const ROLE_CLASS: Readonly<Record<StatusRole, string>> = {
  ok: styles.roleOk,
  warn: styles.roleWarn,
  error: styles.roleError,
  info: styles.roleInfo,
  idle: styles.roleIdle,
};

const CATEGORY_OPTIONS: readonly SelectOption<LogCategory | 'all'>[] = [
  { value: 'all', label: 'All categories' },
  ...LOG_CATEGORIES.map(category => ({ value: category, label: LOG_CATEGORY_LABEL[category] })),
];

const LEVEL_OPTIONS: readonly SelectOption<LogLevel | 'all'>[] = [
  { value: 'all', label: 'All levels' },
  ...LOG_LEVELS.map(level => ({ value: level, label: LOG_LEVEL_LABEL[level] })),
];

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * The Device's activity: connection events, reads, writes and protocol
 * traffic, filterable by category and by level.
 *
 * Newest first, matching the Overview's own "recent activity" card — the entry
 * that matters is the one that just happened, and it should not be at the
 * bottom of a scroll. Rows are windowed at one fixed height rather than
 * measured per row: a packet entry's hex dump and analysis, the reason a row
 * would otherwise vary in height, are shown in a panel below the list instead
 * of growing the row in place.
 */
export function ActivityLog({
  entries,
  category,
  onCategoryChange,
  level,
  onLevelChange,
  selected,
  onSelect,
  onClear,
}: ActivityLogProps): React.JSX.Element {
  const filtered = useMemo(
    () => filterLogEntries(entries, category, level),
    [entries, category, level]
  );
  const displayed = useMemo(() => [...filtered].reverse(), [filtered]);
  const hasRows = displayed.length > 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // The scroll container only exists when there are rows to show, so the
  // measuring effect must re-run when that flips.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = (): void => setViewportHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasRows]);

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + OVERSCAN * 2;
  const endIndex = Math.min(displayed.length, startIndex + visibleCount);

  const selectedPacket =
    selected !== null && selected.level === 'packet' && selected.packetData !== undefined
      ? { entry: selected, packet: selected.packetData }
      : null;

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <Select
          value={category}
          onValueChange={onCategoryChange}
          options={CATEGORY_OPTIONS}
          aria-label="Filter by category"
        />
        <Select
          value={level}
          onValueChange={onLevelChange}
          options={LEVEL_OPTIONS}
          aria-label="Filter by level"
        />

        <span className={styles.spacerFlex} />

        <Button size="sm" variant="ghost" onClick={onClear} disabled={entries.length === 0}>
          Clear
        </Button>
      </div>

      <p className={styles.status} role="status">
        {displayed.length} of {entries.length} entries
      </p>

      {!hasRows ? (
        <p className={styles.empty}>
          {entries.length === 0 ? 'Nothing logged yet.' : 'No entries match this filter.'}
        </p>
      ) : (
        <div ref={scrollRef} className={styles.scroll} onScroll={handleScroll}>
          <ul className={styles.spacer} style={{ height: displayed.length * ROW_HEIGHT_PX }}>
            {displayed.slice(startIndex, endIndex).map((entry, i) => {
              const index = startIndex + i;
              const role = statusRoleForLogLevel(entry.level);
              const expandable = entry.level === 'packet' && entry.packetData !== undefined;
              const isSelected = entry === selected;

              const fields = (
                <>
                  <span className={styles.time}>{formatTime(entry.timestamp)}</span>
                  <span className={cx(styles.role, ROLE_CLASS[role])}>{entry.level}</span>
                  <span className={styles.message}>
                    <span className={styles.category}>{LOG_CATEGORY_LABEL[entry.category]}</span>
                    {entry.message}
                  </span>
                </>
              );

              return (
                <li
                  key={`${index}-${entry.timestamp}`}
                  className={styles.row}
                  style={{ top: index * ROW_HEIGHT_PX }}
                >
                  {expandable ? (
                    <button
                      type="button"
                      className={cx(styles.rowContent, styles.expandable, isSelected && styles.selected)}
                      aria-pressed={isSelected}
                      onClick={() => onSelect(entry)}
                    >
                      {fields}
                    </button>
                  ) : (
                    <div className={styles.rowContent}>{fields}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selectedPacket !== null ? (
        <div className={styles.detail} role="region" aria-label="Packet detail">
          <div className={styles.detailHeader}>
            <span className={styles.detailSummary}>
              {selectedPacket.packet.direction} · {selectedPacket.packet.interface} ·{' '}
              {selectedPacket.packet.destination} · {selectedPacket.packet.size} bytes
              {selectedPacket.packet.responseTime !== undefined
                ? ` · ${selectedPacket.packet.responseTime} ms`
                : ''}
            </span>
            <Button size="sm" variant="ghost" onClick={() => onSelect(selectedPacket.entry)}>
              Close
            </Button>
          </div>

          {selectedPacket.packet.hexData ? (
            <div className={styles.detailBlock}>
              <h3 className={styles.detailLabel}>Hex dump</h3>
              <pre className={styles.hexDump}>{selectedPacket.packet.hexData}</pre>
            </div>
          ) : null}

          {selectedPacket.packet.analysis ? (
            <div className={styles.detailBlock}>
              <h3 className={styles.detailLabel}>Analysis</h3>
              <p className={styles.analysis}>{selectedPacket.packet.analysis}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
