import { cx } from '../../../ui';
import { evaluateThresholds } from '../../widgets/threshold';
import { rangeFraction } from '../../widgets/numberRange';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import type { ProgressBarWidgetConfig } from '../../widgets/widgetConfig';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { roleClassMap } from './statusRoleClass';
import { WidgetStatusNotice } from './WidgetStatusNotice';
import styles from './ProgressBarWidget.module.css';

const ROLE_CLASS = roleClassMap(styles);

/** A value read against a min/max range, as a fill — legible at a glance in a strip too short for a Gauge's arc. */
export function ProgressBarWidget({ config }: WidgetProps): React.JSX.Element {
  const bound = config as ProgressBarWidgetConfig;
  const { min, max, unit, orientation = 'horizontal' } = bound;
  const reading = useWidgetReading(bound.binding, bound.format);
  if (reading.status !== 'ready') return <WidgetStatusNotice status={reading.status} />;

  const value = reading.value ?? min;
  const role = evaluateThresholds(value, bound.thresholds);
  const fraction = rangeFraction(value, min, max);
  const vertical = orientation === 'vertical';

  return (
    <div className={cx(styles.widget, vertical && styles.vertical)}>
      <div className={styles.readout}>
        <span
          className={cx(styles.value, role !== null && ROLE_CLASS[role])}
          title={role !== null ? `Status: ${role}` : undefined}
        >
          {reading.formatted}
          {unit ?? ''}
        </span>
      </div>
      <div
        className={cx(styles.track, vertical && styles.vertical)}
        role="progressbar"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div
          className={cx(styles.fill, role !== null && ROLE_CLASS[role])}
          style={vertical ? { height: `${fraction * 100}%` } : { width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}
