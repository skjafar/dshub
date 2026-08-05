import { evaluateThresholds } from '../../widgets/threshold';
import { rangeFraction } from '../../widgets/numberRange';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import type { GaugeWidgetConfig } from '../../widgets/widgetConfig';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { roleCssVar } from './statusRoleClass';
import { WidgetStatusNotice } from './WidgetStatusNotice';
import styles from './GaugeWidget.module.css';

/** A 270° sweep, leaving a gap at the bottom that reads as "this is a gauge", not a full ring. */
const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_LENGTH = CIRCUMFERENCE * 0.75;

/** A value read against a min/max range, as an arc — Gauge's own reason to exist beyond a plain Value Readout. */
export function GaugeWidget({ config }: WidgetProps): React.JSX.Element {
  const bound = config as GaugeWidgetConfig;
  const { min, max, unit } = bound;
  const reading = useWidgetReading(bound.binding, bound.format);
  if (reading.status !== 'ready') return <WidgetStatusNotice status={reading.status} />;

  const value = reading.value ?? min;
  const role = evaluateThresholds(value, bound.thresholds);
  const color = role !== null ? roleCssVar(role) : 'var(--on-surface)';
  const offset = ARC_LENGTH * (1 - rangeFraction(value, min, max));

  return (
    <div className={styles.gauge}>
      <svg viewBox="0 0 120 120" className={styles.arc} role="presentation">
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          className={styles.track}
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
        />
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          className={styles.fill}
          style={{ stroke: color, strokeDasharray: `${ARC_LENGTH} ${CIRCUMFERENCE}`, strokeDashoffset: offset }}
        />
      </svg>
      <div className={styles.readout}>
        <span className={styles.number} style={{ color }} title={role !== null ? `Status: ${role}` : undefined}>
          {reading.formatted}
        </span>
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </div>
    </div>
  );
}
