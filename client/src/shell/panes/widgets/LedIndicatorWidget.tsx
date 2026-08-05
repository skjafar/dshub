import { cx } from '../../../ui';
import { evaluateThresholds } from '../../widgets/threshold';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import type { LedIndicatorWidgetConfig } from '../../widgets/widgetConfig';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { roleClassMap } from './statusRoleClass';
import { WidgetStatusNotice } from './WidgetStatusNotice';
import styles from './LedIndicatorWidget.module.css';

const ROLE_CLASS = roleClassMap(styles);

/**
 * A bound value read as on or off.
 *
 * Weight carries on/off (filled dot vs outline), colour carries condition —
 * the "icon weight may encode active versus idle, but must never encode
 * severity" rule made literal. Without an explicit threshold rule, "on" reads
 * as ok and "off" as idle, which is right for the common enabled/disabled
 * case; a rule such as `== onValue → error` overrides it for an alarm LED,
 * where being on is the bad state.
 */
export function LedIndicatorWidget({ config }: WidgetProps): React.JSX.Element {
  const { onValue, onLabel = 'On', offLabel = 'Off' } = config as LedIndicatorWidgetConfig;
  const reading = useWidgetReading(config.binding, config.format);
  if (reading.status !== 'ready') return <WidgetStatusNotice status={reading.status} />;

  const value = reading.value ?? 0;
  const on = value === onValue;
  const role = evaluateThresholds(value, config.thresholds) ?? (on ? 'ok' : 'idle');
  const stateLabel = on ? onLabel : offLabel;

  return (
    <div className={styles.widget}>
      <span
        className={cx(styles.dot, on && styles.on, ROLE_CLASS[role])}
        title={`${stateLabel} — Status: ${role}`}
      />
      <span className={styles.state}>{stateLabel}</span>
    </div>
  );
}
