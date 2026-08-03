import type { DeviceConnection, DiscoveredDevice, LogEntry } from '../../types/shared';
import { statusRoleForLogLevel } from '../../design/status';
import type { StatusRole } from '../../design/status';
import { cx } from '../../ui';
import { controlDescription, controlHolderOf, linkStateOf } from '../linkState';
import type { LinkState } from '../linkState';
import styles from './Overview.module.css';

export interface OverviewProps {
  /**
   * The discovery record for the Device on the other end of the link, or null
   * when there is none — connected by address, or not connected at all. Never
   * some other Device that happened to answer an earlier scan.
   */
  readonly device: DiscoveredDevice | null;
  readonly connection: DeviceConnection | null;
  /** Seconds since the link came up, or null when it is not up. */
  readonly uptimeSeconds: number | null;
  /** Newest last, as the log holds it. Rendered newest first. */
  readonly recentActivity: readonly LogEntry[];
}

/** `HH:MM:SS`, zero-padded so the column does not jump as it counts. */
function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

/** `1.4.7` from the packed firmware word the Device reports. */
function formatFirmware(version: number): string {
  return `${(version >> 16) & 0xff}.${(version >> 8) & 0xff}.${version & 0xff}`;
}

const ROLE_CLASS: Readonly<Record<StatusRole, string>> = {
  ok: styles.roleOk,
  warn: styles.roleWarn,
  error: styles.roleError,
  info: styles.roleInfo,
  idle: styles.roleIdle,
};

const LINK_CLASS: Readonly<Record<LinkState, string>> = {
  online: styles.linkOnline,
  connecting: styles.linkIdle,
  reconnecting: styles.linkReconnecting,
  disconnected: styles.linkDown,
  'no device': styles.linkIdle,
};

/**
 * The Device's own health — identity, uptime, link state and recent activity.
 *
 * Nobody composes this: unlike a Dashboard it is the same for every Device, and
 * it is what an Operator looks at to decide whether what they are seeing is
 * live. That is why the link banner says in words that readings have stopped
 * updating rather than only changing colour — a colour change is a thing you can
 * fail to notice, and a stale number read as a current one is the failure this
 * surface exists to prevent.
 */
export function Overview({
  device,
  connection,
  uptimeSeconds,
  recentActivity,
}: OverviewProps): React.JSX.Element {
  const link = linkStateOf(connection);
  const control = controlHolderOf(connection);

  return (
    <div className={styles.pane}>
      <div className={cx(styles.link, LINK_CLASS[link])} role="status">
        <span className={styles.linkState}>{link}</span>

        {link === 'online' && connection ? (
          <>
            <span className={styles.linkNote}>
              {connection.ip}:{connection.port} over {connection.interface}
            </span>
            <span className={styles.linkNote}>
              Control: {controlDescription(control)}
            </span>
          </>
        ) : null}

        {link === 'reconnecting' ? (
          <span className={styles.staleNote}>
            The Device stopped answering. Every reading below is from before the
            link dropped and is no longer current.
          </span>
        ) : null}

        {link === 'disconnected' ? (
          <span className={styles.staleNoteDown}>
            Disconnected. Nothing on screen is being updated.
          </span>
        ) : null}

        {link === 'no device' ? (
          <span className={styles.linkNote}>
            No device. Connect from the chrome above to begin.
          </span>
        ) : null}
      </div>

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="overview-identity">
          <h3 className={styles.cardTitle} id="overview-identity">Identity</h3>
          {device ? (
            <>
              <p className={styles.deviceName}>{device.board_name}</p>
              <dl className={styles.rows}>
                <dt className={styles.rowLabel}>Address</dt>
                <dd className={styles.mono}>
                  {device.ip_address}:{connection?.port ?? device.tcp_port}
                </dd>
                <dt className={styles.rowLabel}>Device ID</dt>
                <dd className={styles.rowValue}>{device.device_id}</dd>
                <dt className={styles.rowLabel}>Board type</dt>
                <dd className={styles.rowValue}>{device.board_type}</dd>
                <dt className={styles.rowLabel}>Firmware</dt>
                <dd className={styles.mono}>{formatFirmware(device.firmware_version)}</dd>
                <dt className={styles.rowLabel}>MAC</dt>
                <dd className={styles.mono}>{device.mac_address}</dd>
              </dl>
            </>
          ) : connection ? (
            // Connected by address, so the Device never answered a scan and
            // there is no discovery record. Report the link and nothing more —
            // an identity invented here would be another board's.
            <>
              <p className={styles.deviceName}>{connection.deviceName ?? 'Unidentified device'}</p>
              <dl className={styles.rows}>
                <dt className={styles.rowLabel}>Address</dt>
                <dd className={styles.mono}>
                  {connection.ip}:{connection.port}
                </dd>
              </dl>
              <p className={styles.empty}>
                Connected by address — this Device has not answered a scan, so
                its board type, firmware and MAC are unknown.
              </p>
            </>
          ) : (
            <p className={styles.empty}>Nothing discovered yet.</p>
          )}
        </section>

        <section className={styles.card} aria-labelledby="overview-uptime">
          {/* The link's duration, not the board's. The protocol offers no
              power-on time, and calling this "uptime" unqualified would claim
              one. */}
          <h3 className={styles.cardTitle} id="overview-uptime">Link uptime</h3>
          {uptimeSeconds === null ? (
            <p className={styles.empty}>Not connected.</p>
          ) : (
            <p className={styles.uptime}>{formatUptime(uptimeSeconds)}</p>
          )}
        </section>

        <section className={styles.card} aria-labelledby="overview-activity">
          <h3 className={styles.cardTitle} id="overview-activity">Recent activity</h3>
          {recentActivity.length === 0 ? (
            <p className={styles.empty}>Nothing logged yet.</p>
          ) : (
            <ul className={styles.activity}>
              {/* Newest first: the entry that matters is the last thing that
                  happened, and it should not be at the bottom of a scroll. */}
              {[...recentActivity].reverse().map((entry, i) => {
                const role = statusRoleForLogLevel(entry.level);
                return (
                  <li key={`${entry.timestamp}-${i}`} className={styles.entry}>
                    <span className={styles.entryTime}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={cx(styles.entryRole, ROLE_CLASS[role])}>{role}</span>
                    <span className={styles.entryMessage}>{entry.message}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
