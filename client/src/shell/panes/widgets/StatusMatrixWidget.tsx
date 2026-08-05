import { cx } from '../../../ui';
import { bitsOf } from '../../widgets/bitfield';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { WidgetStatusNotice } from './WidgetStatusNotice';
import styles from './StatusMatrixWidget.module.css';

/**
 * Every asserted bit reads as the same condition — one bit set in a fault-
 * flags word is a fault regardless of which — so all thirty-two share this
 * one role rather than each carrying its own configurable threshold. Named
 * rather than a bare string so `.module.css`'s `.set` rule (which hardcodes
 * `var(--status-warn)` for the same reason) and this title can't drift apart
 * silently were this ever revisited.
 */
const SET_BIT_ROLE = 'warn';

/**
 * A bound value read bit by bit, as a grid of thirty-two indicators.
 *
 * The legacy widget bound a separate address per cell — sixteen items each
 * with its own binding, format and thresholds, precisely the duplication the
 * shared surface exists to remove. A fault-flags register already packs one
 * condition per bit, so reading the single bound address bit by bit gives
 * the same at-a-glance grid through the shared surface's one binding. This
 * is also why `config.thresholds` goes unread here — judging thirty-two
 * independent bits against one rule list has no coherent meaning, so
 * `WidgetConfigDialog` hides the Thresholds section for this kind rather
 * than offer configuration with no effect.
 *
 * Reads bits from the decoded reading, which only differs from the raw wire
 * word for a float-typed entry — not a register anyone binds a bitmask to.
 */
export function StatusMatrixWidget({ config }: WidgetProps): React.JSX.Element {
  const reading = useWidgetReading(config.binding, config.format);
  if (reading.status !== 'ready') return <WidgetStatusNotice status={reading.status} />;

  const bits = bitsOf(reading.value ?? 0);

  return (
    <div className={styles.grid}>
      {bits.map((set, index) => (
        <div key={index} className={styles.cell}>
          <span
            className={cx(styles.dot, set && styles.set)}
            title={`Bit ${index}: ${set ? `set — Status: ${SET_BIT_ROLE}` : 'clear'}`}
          />
          <span className={styles.bitLabel}>B{index}</span>
        </div>
      ))}
    </div>
  );
}
