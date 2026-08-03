import { useDSHub } from '../../contexts/DSHubContext';
import { useUptime } from '../useUptime';
import { Overview } from './Overview';

/** How many log entries the Overview shows. Enough to see what just happened. */
const RECENT_ACTIVITY_COUNT = 12;

/**
 * Binds the Overview to application state.
 *
 * The discovery record is only used when its address matches the link. There is
 * no fallback to "some device we found earlier": connecting by address to a
 * board a scan never reached would then put another board's name, MAC and
 * firmware under a banner reading Online, which is precisely the stale-read-as-
 * current failure this surface exists to prevent. Where there is no matching
 * record the Overview shows what the link itself knows and says nothing it
 * cannot support.
 */
export function OverviewPane(): React.JSX.Element {
  const { state } = useDSHub();
  const uptimeSeconds = useUptime(state.connection?.connected ?? false);

  const connectedIp = state.connection?.ip;
  const device =
    (connectedIp !== undefined
      ? state.discoveredDevices.find(d => d.ip_address === connectedIp)
      : undefined) ?? null;

  return (
    <Overview
      device={device}
      connection={state.connection}
      uptimeSeconds={uptimeSeconds}
      recentActivity={state.logs.slice(-RECENT_ACTIVITY_COUNT)}
    />
  );
}
