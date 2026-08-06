import { useDSHub } from '../contexts/DSHubContext';
import { cx } from '../ui';
import { controlHolderOf, controlLabel, linkStateOf } from './linkState';
import type { LinkState } from './linkState';
import styles from './LinkStatus.module.css';

const LED_CLASS: Readonly<Record<LinkState, string>> = {
  online: styles.ledOnline,
  connecting: styles.ledConnecting,
  reconnecting: styles.ledReconnecting,
  disconnected: styles.ledDown,
  'no device': '',
};

const LINK_LABEL: Readonly<Record<LinkState, string>> = {
  online: 'Online',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  disconnected: 'Offline',
  'no device': 'No device',
};

/**
 * The link LED, state and — once connected — the Device's own name and
 * address.
 *
 * Shared by the full chrome and Focus Mode's minimised strip (ticket 18) so
 * the two can never read Control differently: both derive from the exact
 * same `state.connection`, through the exact same `linkStateOf`, rather than
 * two components independently agreeing to draw the same conclusion.
 */
export function LinkStatus(): React.JSX.Element {
  const { state } = useDSHub();
  const link = linkStateOf(state.connection, state.connecting);

  return (
    <div className={styles.link} role="status" aria-label="Device link">
      <span className={cx(styles.led, LED_CLASS[link])} aria-hidden />
      {/* The state is always shown, never replaced by the Device's name. A
          drop that is signalled only by an LED colour is a drop an Operator
          can look straight at and miss. */}
      <span className={cx(styles.linkLabel, link !== 'online' && styles.linkLabelAlert)}>
        {LINK_LABEL[link]}
      </span>
      {state.connection ? (
        <>
          <span className={styles.deviceName}>{state.connection.deviceName}</span>
          <span className={styles.address}>
            {state.connection.ip}:{state.connection.port}
          </span>
        </>
      ) : null}
    </div>
  );
}

/** Who holds Control, coloured by whether it is this session's own claim. */
export function ControlBadge(): React.JSX.Element {
  const { state } = useDSHub();
  const control = controlHolderOf(state.connection);

  return (
    <span
      className={cx(
        styles.control,
        control.kind === 'ours' && styles.controlHeld,
        control.kind === 'elsewhere' && styles.controlElsewhere
      )}
    >
      {controlLabel(control)}
    </span>
  );
}
