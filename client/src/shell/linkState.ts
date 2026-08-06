/**
 * How the link and Control read, in one place.
 *
 * The chrome and the Overview both answer "is what I am looking at current?"
 * and they must never answer it differently. Keeping the derivation here rather
 * than in each surface is what stops the two drifting into separate vocabularies
 * for the same machine state.
 */

import { ControlInterfaceState, InterfaceType } from '../types/shared';
import type { DeviceConnection, DiscoveredDevice } from '../types/shared';

export type LinkState = 'online' | 'connecting' | 'reconnecting' | 'disconnected' | 'no device';

/**
 * The discovery record for the Device on the other end of the link, or null
 * when there is none — connected by address, or not connected at all.
 *
 * Never falls back to "some device found earlier": connecting by address to a
 * board a scan never reached would otherwise put another board's name, MAC
 * and firmware under a banner reading online, which is the stale-read-as-
 * current failure this module exists to prevent everywhere identity is read.
 * `Overview`, `DeviceInfoWidget` and `AboutDialog` all answer "what Device is
 * this" from here rather than each re-deriving it, so the three cannot drift.
 */
export function resolveConnectedDevice(
  connection: DeviceConnection | null,
  discoveredDevices: readonly DiscoveredDevice[]
): DiscoveredDevice | null {
  const connectedIp = connection?.ip;
  if (connectedIp === undefined) return null;
  return discoveredDevices.find(d => d.ip_address === connectedIp) ?? null;
}

export function linkStateOf(
  connection: DeviceConnection | null,
  connecting = false
): LinkState {
  if (connecting) return 'connecting';
  if (!connection) return 'no device';
  if (connection.connected) return 'online';
  // An unresponsive Device that is being retried is a different state from a
  // link someone closed, and an Operator needs to tell them apart.
  return connection.reconnecting ? 'reconnecting' : 'disconnected';
}

/** True while readings are not being refreshed, whatever the reason. */
export function isStale(link: LinkState): boolean {
  return link === 'reconnecting' || link === 'disconnected';
}

/**
 * True while the Device will answer.
 *
 * Not the negation of {@link isStale}: connecting is neither — nothing has gone
 * stale yet and nothing can be asked for either. Surfaces gate their read
 * controls on this rather than comparing against `'online'` themselves, so
 * "can I ask the Device something" has one answer in one place.
 */
export function isLive(link: LinkState): boolean {
  return link === 'online';
}

/**
 * Who holds Control.
 *
 * A discriminated union rather than a pair of booleans: "held", "held by someone
 * else" and "unclaimed" are three states, and two flags can express a fourth
 * that does not exist.
 */
/** The interfaces the Device can report as holding Control, as it names them. */
export type ControlTransport =
  | 'TCP'
  | 'UDP'
  | 'TCP datastream'
  | 'UDP datastream'
  | 'TCP CLI'
  | 'USB';

export type ControlHolder =
  | { readonly kind: 'unclaimed' }
  | { readonly kind: 'ours'; readonly transport: Extract<ControlTransport, 'TCP' | 'UDP'> }
  | {
      readonly kind: 'elsewhere';
      readonly transport: Exclude<ControlTransport, 'TCP' | 'UDP'>;
    };

/**
 * Who holds Control.
 *
 * The Device reports which *interface type* holds its control interface, not
 * which session — so a datastream claim is only ours if it is on the transport
 * this session is connected over. Without that comparison, connecting over TCP
 * to a board whose Control is held by a UDP session reads as "this session",
 * and every write affordance that answer governs is offered for a write the
 * board will refuse.
 *
 * Two sessions on the *same* transport still cannot be told apart; the protocol
 * carries nothing that would distinguish them.
 */
export function controlHolderOf(connection: DeviceConnection | null): ControlHolder {
  if (!connection?.connected) return { kind: 'unclaimed' };
  switch (connection.controlState) {
    case ControlInterfaceState.TCP_DATASTREAM:
      return connection.interface === InterfaceType.TCP
        ? { kind: 'ours', transport: 'TCP' }
        : { kind: 'elsewhere', transport: 'TCP datastream' };
    case ControlInterfaceState.UDP_DATASTREAM:
      return connection.interface === InterfaceType.UDP
        ? { kind: 'ours', transport: 'UDP' }
        : { kind: 'elsewhere', transport: 'UDP datastream' };
    case ControlInterfaceState.TCP_CLI:
      return { kind: 'elsewhere', transport: 'TCP CLI' };
    case ControlInterfaceState.USB:
      return { kind: 'elsewhere', transport: 'USB' };
    default:
      return { kind: 'unclaimed' };
  }
}

/**
 * Whether this session may write.
 *
 * The one gate every write affordance is drawn from. It agrees with
 * `canWriteToDevice`, which the old view layer wrote through and which
 * `__tests__/linkState.test.ts` pins it against — two answers to "may I write"
 * is how an affordance appears for a write the Device will refuse.
 */
export function holdsControl(connection: DeviceConnection | null): boolean {
  return controlHolderOf(connection).kind === 'ours';
}

/** Short form, for the chrome. */
export function controlLabel(holder: ControlHolder): string {
  switch (holder.kind) {
    case 'ours':
      return `${holder.transport} control`;
    case 'elsewhere':
      return `${holder.transport} holds control`;
    default:
      return 'No control';
  }
}

/** Long form, for the Overview, where there is room to be unambiguous. */
export function controlDescription(holder: ControlHolder): string {
  switch (holder.kind) {
    case 'ours':
      return `this session — ${holder.transport} datastream`;
    case 'elsewhere':
      return `another interface — ${holder.transport}`;
    default:
      return 'unclaimed';
  }
}
