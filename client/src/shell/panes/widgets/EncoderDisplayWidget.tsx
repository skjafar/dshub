import { cx } from '../../../ui';
import { evaluateThresholds } from '../../widgets/threshold';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import type { EncoderDisplayWidgetConfig } from '../../widgets/widgetConfig';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { roleClassMap } from './statusRoleClass';
import { WidgetStatusNotice } from './WidgetStatusNotice';
import styles from './EncoderDisplayWidget.module.css';

const ROLE_CLASS = roleClassMap(styles);

/**
 * A raw reading converted to a physical measurement by a constant factor —
 * an encoder's steps into millimetres, an ADC count into degrees.
 *
 * Thresholds here judge the *converted* value rather than the raw one, unlike
 * every other numeric kind: the physical unit is what this Widget exists to
 * show, and a rule an Operator writes against it ("warn past 50 mm") is
 * written in that unit, not steps.
 */
export function EncoderDisplayWidget({ config }: WidgetProps): React.JSX.Element {
  const { conversionFactor, primaryUnit, secondaryUnit, showRawValue = true, decimals = 2 } =
    config as EncoderDisplayWidgetConfig;
  const reading = useWidgetReading(config.binding, config.format);
  if (reading.status !== 'ready') return <WidgetStatusNotice status={reading.status} />;

  const raw = reading.value ?? 0;
  const converted = conversionFactor !== 0 ? raw / conversionFactor : null;
  const role = converted !== null ? evaluateThresholds(converted, config.thresholds) : null;

  return (
    <div className={styles.widget}>
      {converted !== null ? (
        <div className={styles.readout}>
          <span
            className={cx(styles.value, role !== null && ROLE_CLASS[role])}
            title={role !== null ? `Status: ${role}` : undefined}
          >
            {converted.toFixed(decimals)}
          </span>
          {primaryUnit ? <span className={styles.unit}>{primaryUnit}</span> : null}
        </div>
      ) : null}
      {showRawValue || converted === null ? (
        <span className={styles.raw}>
          [{reading.formatted} {secondaryUnit ?? 'raw'}]
        </span>
      ) : null}
    </div>
  );
}
