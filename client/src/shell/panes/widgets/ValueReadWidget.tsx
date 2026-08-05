import type { StatusRole } from '../../../design/status';
import { cx } from '../../../ui';
import { evaluateThresholds } from '../../widgets/threshold';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import styles from './ValueReadWidget.module.css';

const ROLE_CLASS: Readonly<Record<StatusRole, string>> = {
  ok: styles.roleOk,
  warn: styles.roleWarn,
  error: styles.roleError,
  info: styles.roleInfo,
  idle: styles.roleIdle,
};

/**
 * One bound value, formatted per the shared surface and coloured by its
 * threshold rules — the single Widget kind this ticket delivers end to end,
 * proof that binding, formatting, threshold evaluation and the stale state all
 * work through the shared configuration surface rather than a kind-specific
 * reimplementation of any of the four.
 */
export function ValueReadWidget({ config }: WidgetProps): React.JSX.Element {
  const reading = useWidgetReading(config.binding, config.format);
  const role: StatusRole | null =
    reading.status === 'ready' && reading.value !== null
      ? evaluateThresholds(reading.value, config.thresholds)
      : null;

  switch (reading.status) {
    case 'unbound':
      return <p className={styles.notice}>Not configured — pick an address to bind.</p>;
    case 'not-found':
      return <p className={styles.notice}>Bound address is not in the active Map.</p>;
    case 'stale':
      return (
        <p className={styles.stale} role="status">
          Stale — the Device stopped answering.
        </p>
      );
    case 'pending':
      return <p className={styles.pending}>—</p>;
    case 'invalid':
      return <p className={styles.notice}>invalid</p>;
    case 'ready':
      // The design language carries condition by colour alone — see status.ts —
      // so the role is not repeated as visible text. `title` supplements it for
      // whoever cannot read colour, the same role `PlotPane`'s legend swatch
      // gives a conflict state alongside its own colour change.
      return (
        <p
          className={cx(styles.value, role !== null && ROLE_CLASS[role])}
          title={role !== null ? `Status: ${role}` : undefined}
        >
          {reading.formatted}
        </p>
      );
  }
}
