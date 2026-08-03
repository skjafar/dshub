/**
 * How the link and Control read, in one place.
 *
 * The chrome and the Overview both answer "is what I am looking at current?"
 * and they must never answer it differently. Keeping the derivation here rather
 * than in each surface is what stops the two drifting into separate vocabularies
 * for the same machine state.
 */

import { ControlInterfaceState } from '../types/shared';
import type { DeviceConnection } from '../types/shared';

export type LinkState = 'online' | 'connecting' | 'reconnecting' | 'disconnected' | 'no device';

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
 * Who holds Control.
 *
 * A discriminated union rather than a pair of booleans: "held", "held by someone
 * else" and "unclaimed" are three states, and two flags can express a fourth
 * that does not exist.
 */
export type ControlHolder =
  | { readonly kind: 'unclaimed' }
  | { readonly kind: 'ours'; readonly transport: 'TCP' | 'UDP' }
  | { readonly kind: 'elsewhere'; readonly transport: 'TCP CLI' | 'USB' };

export function controlHolderOf(connection: DeviceConnection | null): ControlHolder {
  if (!connection?.connected) return { kind: 'unclaimed' };
  switch (connection.controlState) {
    case ControlInterfaceState.TCP_DATASTREAM:
      return { kind: 'ours', transport: 'TCP' };
    case ControlInterfaceState.UDP_DATASTREAM:
      return { kind: 'ours', transport: 'UDP' };
    case ControlInterfaceState.TCP_CLI:
      return { kind: 'elsewhere', transport: 'TCP CLI' };
    case ControlInterfaceState.USB:
      return { kind: 'elsewhere', transport: 'USB' };
    default:
      return { kind: 'unclaimed' };
  }
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
