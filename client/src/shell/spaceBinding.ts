/**
 * Where one Address Space's values live, and how to ask the Device about them.
 *
 * Three lookups have to agree about which space is being talked about: the Map a
 * surface lists from, the readings it displays, and the command it sends. Taking
 * any one of them from a different space decodes one address's bits under
 * another address's name — precisely what an Address Space exists to prevent.
 * Resolving all three at once, by space, makes that mistake unavailable rather
 * than merely unlikely.
 */

import { useMemo } from 'react';
import { useBackendPort } from '../contexts/BackendPortContext';
import { useDSHub } from '../contexts/DSHubContext';
import type { DevicePort } from '../services/backendPort';
import type { ParameterData, RegisterData } from '../types/shared';
import { ADDRESS_SPACE_WRITABLE } from './addressSpace';
import type { AddressSpace, WritableAddressSpace } from './addressSpace';

/** Sends one value to one address. */
export type SpaceWrite = (address: number, value: number) => Promise<void>;

export interface SpaceBinding {
  /** The last reading of each address in this space, by address. */
  readonly readings: ReadonlyMap<number, RegisterData | ParameterData>;
  /**
   * Asks for one value now. Resolves when the request is *sent* — the value
   * arrives later, as an event, and lands in `readings`.
   */
  readonly read: (address: number, name: string) => void;
  /**
   * Sends one value, or null when the protocol permits no write to this space.
   *
   * Writes go through the port rather than through the context action because
   * the outcome is the point: the action returns void by design, logging a
   * failure and swallowing it, which is right for a read but not for a write.
   * A failure noticed later, in a log, is one noticed after the operator has
   * already decided the value was sent. Resolving is not success either — the
   * backend resolves as soon as the request is queued, and the Device's answer
   * is what settles it.
   */
  readonly write: SpaceWrite | null;
}

/**
 * Narrows `AddressSpace` to the ones {@link SEND} has a case for, so a System
 * Register write command has no way to reach the Device through this module —
 * there is no case for it to fall into, rather than a case that exists but is
 * only ever discarded.
 */
function isWritableSpace(space: AddressSpace): space is WritableAddressSpace {
  return ADDRESS_SPACE_WRITABLE[space];
}

/** The command each writable space is written with. */
const SEND: Readonly<
  Record<WritableAddressSpace, (device: DevicePort, address: number, value: number) => Promise<void>>
> = {
  register: (device, address, value) => device.writeRegister(address, value),
  parameter: (device, address, value) => device.writeParameter(address, value),
};

/** Binds a surface to one Address Space's Device traffic. */
export function useSpaceBinding(space: AddressSpace): SpaceBinding {
  const { state, actions } = useDSHub();
  const port = useBackendPort();

  /**
   * One table, keyed by space, for the two halves that come from React state:
   * which readings a Pane shows and which command asks for a fresh one. `write`
   * is resolved separately below because it answers a different question — not
   * "where does this space's traffic live" but "may this space be written at
   * all" — and folding a null branch into this table would put a real function
   * beside a space that must never receive one.
   */
  const table: Readonly<Record<AddressSpace, Pick<SpaceBinding, 'readings' | 'read'>>> = {
    register: { readings: state.registers, read: actions.readRegister },
    parameter: { readings: state.parameters, read: actions.readParameter },
    sysRegister: { readings: state.systemRegisters, read: actions.readSystemRegister },
  };

  /**
   * Memoised apart from the readings so that it keeps its identity as values
   * arrive: a write function that changed on every incoming reading would
   * re-create the write field's props a second at a time.
   */
  const write = useMemo<SpaceWrite | null>(
    () =>
      isWritableSpace(space)
        ? (address, value) => SEND[space](port.device, address, value)
        : null,
    [space, port]
  );

  return { ...table[space], write };
}
