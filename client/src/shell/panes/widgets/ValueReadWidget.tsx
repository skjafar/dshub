import { cx } from '../../../ui';
import { evaluateThresholds } from '../../widgets/threshold';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { roleClassMap } from './statusRoleClass';
import { WidgetStatusNotice } from './WidgetStatusNotice';
import styles from './ValueReadWidget.module.css';

const ROLE_CLASS = roleClassMap(styles);

/**
 * One bound value, formatted per the shared surface and coloured by its
 * threshold rules — the single Widget kind ticket 14 delivered end to end,
 * proof that binding, formatting, threshold evaluation and the stale state all
 * work through the shared configuration surface rather than a kind-specific
 * reimplementation of any of the four.
 */
export function ValueReadWidget({ config }: WidgetProps): React.JSX.Element {
  const reading = useWidgetReading(config.binding, config.format);
  if (reading.status !== 'ready') return <WidgetStatusNotice status={reading.status} />;

  const role = reading.value !== null ? evaluateThresholds(reading.value, config.thresholds) : null;

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
