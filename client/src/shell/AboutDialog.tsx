import { useDSHub } from '../contexts/DSHubContext';
import { Button, Dialog } from '../ui';
import { resolveConnectedDevice } from './linkState';
import { formatFirmware } from './panes/Overview';
import styles from './AboutDialog.module.css';

export interface AboutDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOpenGuide: () => void;
}

/** Tracks `client/package.json`'s own `version` field — bump both together. */
const APP_VERSION = '0.2.4';

/**
 * The application's own identity, and a brief read of the connected Device's.
 *
 * Deliberately brief on the Device: the Overview Pane is the full, live
 * picture — link state, uptime, recent activity — and this dialog does not
 * duplicate it, only enough to answer "what am I talking to" from an About
 * box. Identity itself comes from `resolveConnectedDevice`, the same
 * resolution `OverviewPane` and `DeviceInfoWidget` use, so an address
 * connected without a matching scan record reads as unidentified in every
 * one of them rather than one inventing an identity the link cannot support.
 */
export function AboutDialog({ open, onOpenChange, onOpenGuide }: AboutDialogProps): React.JSX.Element {
  const { state } = useDSHub();
  const connection = state.connection;
  const device = resolveConnectedDevice(connection, state.discoveredDevices);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="About DSHub"
      footer={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            onOpenChange(false);
            onOpenGuide();
          }}
        >
          Open the Guide
        </Button>
      }
    >
      <div className={styles.body}>
        <div className={styles.appRow}>
          <span className={styles.brand}>DSHUB</span>
          <span className={styles.version}>v{APP_VERSION}</span>
        </div>
        <p className={styles.tagline}>
          A calm, precise interface for reading, writing and monitoring a DataStream device.
        </p>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Connected device</h3>
          {connection?.connected && device ? (
            <dl className={styles.rows}>
              <dt className={styles.rowLabel}>Board</dt>
              <dd className={styles.rowValue}>{device.board_name}</dd>
              <dt className={styles.rowLabel}>Address</dt>
              <dd className={styles.mono}>
                {connection.ip}:{connection.port}
              </dd>
              <dt className={styles.rowLabel}>Firmware</dt>
              <dd className={styles.mono}>{formatFirmware(device.firmware_version)}</dd>
            </dl>
          ) : connection?.connected ? (
            // Connected by address with no matching discovery record — see
            // the doc comment above for why no identity is invented here.
            <p className={styles.empty}>
              Connected to {connection.deviceName ?? 'an unidentified device'} at {connection.ip}:{connection.port}.
            </p>
          ) : (
            <p className={styles.empty}>
              Not connected. Connect from the chrome to see its identity here, or open the Overview Pane for the
              full picture, including link uptime and recent activity.
            </p>
          )}
        </section>
      </div>
    </Dialog>
  );
}
