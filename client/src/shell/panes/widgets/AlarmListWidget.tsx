import { useCallback, useEffect, useState } from 'react';
import { cx } from '../../../ui';
import { evaluateThresholds } from '../../widgets/threshold';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import type { AlarmListEntry, AlarmListWidgetConfig } from '../../widgets/widgetConfig';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { roleClassMap } from './statusRoleClass';
import { rowStatusText } from './rowStatusText';
import styles from './AlarmListWidget.module.css';

const ROLE_CLASS = roleClassMap(styles);

/**
 * One condition is "active" whenever its evaluated threshold role is `warn`
 * or `error` — the two roles that mean a departure from nominal. `ok` and
 * the absence of any rule both read as clear; `idle` (a state a threshold
 * rule can name, per `threshold.ts`) reads as clear too, matching State
 * LED's own use of it for a meaningfully neutral state rather than a fault.
 */
function isActive(role: ReturnType<typeof evaluateThresholds>): boolean {
  return role === 'warn' || role === 'error';
}

/**
 * One alarm entry — its own binding, its own reading, its own evaluated
 * condition. Always mounted regardless of `showInactive`, and rendering
 * `null` itself when hidden, rather than the parent filtering the array
 * before mounting: a hidden entry still has to keep polling and evaluating
 * its own threshold so it can reappear the moment it goes active, which it
 * could never do if mounting were gated on an activity state only mounting
 * itself can discover.
 */
function AlarmRow({
  entry,
  index,
  showInactive,
  onActiveChange,
}: {
  readonly entry: AlarmListEntry;
  readonly index: number;
  readonly showInactive: boolean;
  readonly onActiveChange: (index: number, active: boolean) => void;
}): React.JSX.Element | null {
  const reading = useWidgetReading(entry.binding, entry.format);
  const role =
    reading.status === 'ready' && reading.value !== null ? evaluateThresholds(reading.value, entry.thresholds) : null;
  const active = isActive(role);

  useEffect(() => {
    onActiveChange(index, active);
  }, [index, active, onActiveChange]);

  if (!active && !showInactive) return null;

  const valueText = reading.status === 'ready' ? reading.formatted : rowStatusText(reading.status);

  return (
    <li className={cx(styles.row, active && styles.rowActive)}>
      <span
        className={cx(styles.dot, role !== null && ROLE_CLASS[role])}
        title={role !== null ? `Status: ${role}` : undefined}
      />
      <span className={styles.label}>{entry.label}</span>
      <span className={styles.value}>{valueText}</span>
    </li>
  );
}

/**
 * Bound conditions shown active or clear by status colour — the legacy
 * Widget's own severity/min-max rule shape replaced by the shared
 * `thresholds`, so "active" is judged by exactly the same evaluator every
 * other bound kind uses rather than a second, alarm-specific one.
 */
export function AlarmListWidget({ config }: WidgetProps): React.JSX.Element {
  const { alarms, showInactive } = config as AlarmListWidgetConfig;
  const [activeMap, setActiveMap] = useState<ReadonlyMap<number, boolean>>(new Map());

  const handleActiveChange = useCallback((index: number, active: boolean) => {
    setActiveMap(previous => (previous.get(index) === active ? previous : new Map(previous).set(index, active)));
  }, []);

  if (alarms.length === 0) {
    return <p className={styles.notice}>No alarms configured — add rows from the gear icon.</p>;
  }

  const activeCount = [...activeMap.values()].filter(Boolean).length;

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={cx(styles.count, activeCount > 0 ? styles.countActive : styles.countOk)}>
          {activeCount > 0 ? `${activeCount} ACTIVE` : 'OK'}
        </span>
      </div>
      <ul className={styles.list}>
        {alarms.map((entry, index) => (
          <AlarmRow key={index} entry={entry} index={index} showInactive={showInactive} onActiveChange={handleActiveChange} />
        ))}
      </ul>
    </div>
  );
}
