import { useDSHub } from '../../contexts/DSHubContext';
import { resolveConnectedDevice } from '../linkState';
import { useUptime } from '../useUptime';
import { Overview } from './Overview';

/** How many log entries the Overview shows. Enough to see what just happened. */
const RECENT_ACTIVITY_COUNT = 12;

/**
 * Binds the Overview to application state.
 *
 * Device identity comes from `resolveConnectedDevice` rather than being
 * re-derived here — see its doc comment for why a discovery record is never
 * assumed. Where there is no matching record the Overview shows what the link
 * itself knows and says nothing it cannot support.
 */
export function OverviewPane(): React.JSX.Element {
  const { state } = useDSHub();
  const uptimeSeconds = useUptime(state.connection?.connected ?? false);

  const device = resolveConnectedDevice(state.connection, state.discoveredDevices);

  return (
    <Overview
      device={device}
      connection={state.connection}
      uptimeSeconds={uptimeSeconds}
      recentActivity={state.logs.slice(-RECENT_ACTIVITY_COUNT)}
    />
  );
}
