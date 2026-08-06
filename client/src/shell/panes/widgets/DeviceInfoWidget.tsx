import { useDSHub } from '../../../contexts/DSHubContext';
import type { StatusRole } from '../../../design/status';
import { cx } from '../../../ui';
import { linkStateOf } from '../../linkState';
import type { LinkState } from '../../linkState';
import { useUptime } from '../../useUptime';
import { formatFirmware } from '../Overview';
import { roleClassMap } from './statusRoleClass';
import styles from './DeviceInfoWidget.module.css';

const ROLE_CLASS = roleClassMap(styles);

const LINK_ROLE: Readonly<Record<LinkState, StatusRole>> = {
  online: 'ok',
  connecting: 'idle',
  reconnecting: 'warn',
  disconnected: 'error',
  'no device': 'idle',
};

/** `HH:MM:SS`, zero-padded so the column does not jump as it counts — matches `Overview.tsx`'s own formatting. */
function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

/**
 * The connected Device's own identity and link health, at Widget scale.
 *
 * Carries no binding of its own — every field here comes from the connection
 * itself, the same source `Overview.tsx`'s Identity and Link uptime cards
 * read from, reused rather than re-derived so a Widget's answer to "what
 * Device is this" can never disagree with the Pane's.
 */
export function DeviceInfoWidget(): React.JSX.Element {
  const { state } = useDSHub();
  const uptimeSeconds = useUptime(state.connection?.connected ?? false);

  const link = linkStateOf(state.connection, state.connecting);
  const role = LINK_ROLE[link];

  const connectedIp = state.connection?.ip;
  const device =
    (connectedIp !== undefined
      ? state.discoveredDevices.find(d => d.ip_address === connectedIp)
      : undefined) ?? null;

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={cx(styles.linkDot, ROLE_CLASS[role])} title={`Link: ${link}`} />
        <span className={cx(styles.linkState, ROLE_CLASS[role])}>{link}</span>
        {uptimeSeconds !== null ? <span className={styles.uptime}>{formatUptime(uptimeSeconds)}</span> : null}
      </div>

      {device ? (
        <>
          <p className={styles.name}>{device.board_name}</p>
          <dl className={styles.rows}>
            <dt>Address</dt>
            <dd className={styles.mono}>
              {device.ip_address}:{state.connection?.port ?? device.tcp_port}
            </dd>
            <dt>Board type</dt>
            <dd>{device.board_type}</dd>
            <dt>Firmware</dt>
            <dd className={styles.mono}>{formatFirmware(device.firmware_version)}</dd>
            <dt>MAC</dt>
            <dd className={styles.mono}>{device.mac_address}</dd>
          </dl>
        </>
      ) : state.connection ? (
        // Connected by address, so no discovery record exists for this Device
        // — inventing a board type, firmware or MAC here would be another
        // board's, the same reasoning `Overview.tsx`'s Identity card follows.
        <>
          <p className={styles.name}>{state.connection.deviceName ?? 'Unidentified device'}</p>
          <dl className={styles.rows}>
            <dt>Address</dt>
            <dd className={styles.mono}>
              {state.connection.ip}:{state.connection.port}
            </dd>
          </dl>
        </>
      ) : (
        <p className={styles.empty}>Nothing discovered yet.</p>
      )}
    </div>
  );
}
