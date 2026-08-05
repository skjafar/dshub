import { cx } from '../../../ui';
import { evaluateThresholds, matchingThresholdRule } from '../../widgets/threshold';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { roleClassMap } from './statusRoleClass';
import { WidgetStatusNotice } from './WidgetStatusNotice';
import styles from './StateLedWidget.module.css';

const ROLE_CLASS = roleClassMap(styles);

/**
 * A bound value read as one of several named states.
 *
 * The whole "state machine" — code, name, condition — is nothing but this
 * Widget's `thresholds`, each an `==` rule carrying a `label`: no separate
 * states array to configure or keep in step with the shared surface. The
 * matched rule's label replaces the formatted number; its role colours the
 * dot exactly as it would colour a Value Readout.
 */
export function StateLedWidget({ config }: WidgetProps): React.JSX.Element {
  const reading = useWidgetReading(config.binding, config.format);
  if (reading.status !== 'ready') return <WidgetStatusNotice status={reading.status} />;

  const value = reading.value ?? 0;
  const role = evaluateThresholds(value, config.thresholds);
  const matched = matchingThresholdRule(value, config.thresholds);
  // A code no rule names shows as the reading it actually is rather than a
  // generic "Unknown" — more useful to an Engineer diagnosing an unmapped
  // state than a label that throws the value away.
  const label = matched?.label ?? reading.formatted;

  return (
    <div className={styles.widget}>
      <span
        className={cx(styles.dot, role !== null && ROLE_CLASS[role])}
        title={role !== null ? `Status: ${role}` : undefined}
      />
      <span className={cx(styles.label, role !== null && ROLE_CLASS[role])}>{label}</span>
    </div>
  );
}
