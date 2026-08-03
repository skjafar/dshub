import { useEffect, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { InterfaceType, DEFAULT_TCP_PORT, DEFAULT_UDP_PORT } from '../types/shared';
import type { DiscoveredDevice } from '../types/shared';
import { Button, Dialog, Select, TextField } from '../ui';
import styles from './ConnectDialog.module.css';

export interface ConnectDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * The connect flow.
 *
 * A flow rather than a destination: it is opened from the chrome, it closes once
 * the link is up, and nobody navigates back to it. Discovery is offered first
 * because an address is something the Device can be asked for rather than
 * something a person should have to type, but the manual entry stays for the
 * boards a scan cannot reach.
 */
export function ConnectDialog({ open, onOpenChange }: ConnectDialogProps): React.JSX.Element {
  const { state, actions } = useDSHub();
  const { settings } = useSettings();
  const [manualIp, setManualIp] = useState('');
  const [manualInterface, setManualInterface] = useState<InterfaceType>(
    settings.lastInterfaceType === 'UDP' ? InterfaceType.UDP : InterfaceType.TCP
  );

  // Opening the dialog starts a scan: the list is stale the moment it is closed,
  // and asking someone to press Scan before anything appears is a step that
  // never has a different answer.
  useEffect(() => {
    if (open && !state.isScanning) actions.startScan();
    // Only on open — rescanning whenever `isScanning` settles would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The link came up. Nothing more to do here.
  useEffect(() => {
    if (state.connection?.connected) onOpenChange(false);
  }, [state.connection?.connected, onOpenChange]);

  const connectTo = (device: DiscoveredDevice): void => {
    actions.connectDevice(device.ip_address, manualInterface, device.board_name);
  };

  const connectManually = (): void => {
    if (!manualIp.trim()) return;
    actions.connectDevice(manualIp.trim(), manualInterface);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Connect to a device"
      description="Pick a discovered device, or enter an address the scan cannot reach."
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      }
    >
      <div className={styles.body}>
        <div className={styles.scanRow}>
          <Button variant="secondary" size="sm" onClick={() => actions.startScan()} disabled={state.isScanning}>
            <MagnifyingGlass size={14} />
            {state.isScanning ? 'Scanning…' : 'Scan again'}
          </Button>
          <span className={styles.scanNote}>
            {state.isScanning
              ? 'Looking for devices…'
              : `${state.discoveredDevices.length} found`}
          </span>
        </div>

        {state.discoveredDevices.length === 0 ? (
          <p className={styles.empty}>
            {state.isScanning
              ? 'Scanning the network…'
              : 'No devices answered. Enter an address below if you know it.'}
          </p>
        ) : (
          <div className={styles.devices}>
            {state.discoveredDevices.map(device => (
              <button
                key={device.ip_address}
                type="button"
                className={styles.device}
                onClick={() => connectTo(device)}
              >
                <span className={styles.deviceName}>{device.board_name}</span>
                <span className={styles.deviceAddress}>{device.ip_address}</span>
                <span className={styles.deviceMeta}>
                  ID {device.device_id} · type {device.board_type} · ports{' '}
                  {device.tcp_port}/{device.udp_port}
                </span>
              </button>
            ))}
          </div>
        )}

        <div>
          <p className={styles.sectionTitle}>By address</p>
          <div className={styles.manual}>
            <TextField
              label="IP address"
              mono
              placeholder="192.168.1.42"
              value={manualIp}
              onChange={e => setManualIp(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') connectManually();
              }}
            />
            <Select
              value={manualInterface}
              onValueChange={setManualInterface}
              aria-label="Interface"
              options={[
                { value: InterfaceType.TCP, label: `TCP · ${DEFAULT_TCP_PORT}` },
                { value: InterfaceType.UDP, label: `UDP · ${DEFAULT_UDP_PORT}` },
              ]}
            />
            <Button variant="primary" onClick={connectManually} disabled={!manualIp.trim()}>
              Connect
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
