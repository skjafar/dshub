import { describe, it, expect } from 'vitest';
import { canWriteToDevice } from '../../utils/dataTableUtils';
import { ControlInterfaceState, InterfaceType } from '../../types/shared';
import type { DeviceConnection } from '../../types/shared';
import { controlHolderOf, holdsControl } from '../linkState';

/**
 * Who holds Control, and therefore whether writing is even possible.
 *
 * The Device reports which *interface type* holds its control interface, not
 * which session. Reading that as "ours" without checking it against the
 * transport we are actually connected over claims a Control we do not have —
 * and a write affordance offered on that basis produces a write the board
 * refuses, after the operator has already decided the value was sent.
 */

function connection(overrides: Partial<DeviceConnection> = {}): DeviceConnection {
  return {
    ip: '192.168.1.42',
    port: 2009,
    interface: InterfaceType.TCP,
    connected: true,
    reconnecting: false,
    controlState: ControlInterfaceState.TCP_DATASTREAM,
    ...overrides,
  };
}

describe('controlHolderOf', () => {
  it('reports Control as ours when the claim is on the transport we are using', () => {
    expect(controlHolderOf(connection())).toEqual({ kind: 'ours', transport: 'TCP' });
    expect(
      controlHolderOf(
        connection({ interface: InterfaceType.UDP, controlState: ControlInterfaceState.UDP_DATASTREAM })
      )
    ).toEqual({ kind: 'ours', transport: 'UDP' });
  });

  it('does not claim a datastream Control held over the other transport', () => {
    // Connected over TCP while the Device reports UDP holds control: that is
    // somebody else, and saying "this session" would put a write affordance in
    // front of an operator who cannot write.
    const holder = controlHolderOf(
      connection({ interface: InterfaceType.TCP, controlState: ControlInterfaceState.UDP_DATASTREAM })
    );
    expect(holder.kind).toBe('elsewhere');
  });

  it('reports the interfaces that are never us as elsewhere', () => {
    expect(controlHolderOf(connection({ controlState: ControlInterfaceState.TCP_CLI })).kind)
      .toBe('elsewhere');
    expect(controlHolderOf(connection({ controlState: ControlInterfaceState.USB })).kind)
      .toBe('elsewhere');
  });

  it('reports no holder when nobody has claimed it, or there is no link', () => {
    expect(controlHolderOf(connection({ controlState: ControlInterfaceState.UNDECIDED })).kind)
      .toBe('unclaimed');
    expect(controlHolderOf(connection({ connected: false })).kind).toBe('unclaimed');
    expect(controlHolderOf(null).kind).toBe('unclaimed');
  });
});

describe('holdsControl', () => {
  const STATES = [
    ControlInterfaceState.UNDECIDED,
    ControlInterfaceState.TCP_DATASTREAM,
    ControlInterfaceState.UDP_DATASTREAM,
    ControlInterfaceState.TCP_CLI,
    ControlInterfaceState.USB,
  ];

  /**
   * The shell's reading of Control has to match the one the write path has
   * always used. Two answers to "may I write" is how an affordance appears for a
   * write the Device will refuse.
   */
  it('agrees with the existing write gate in every state', () => {
    for (const interfaceType of [InterfaceType.TCP, InterfaceType.UDP]) {
      for (const controlState of STATES) {
        for (const connected of [true, false]) {
          const link = connection({ interface: interfaceType, controlState, connected });
          expect(holdsControl(link), `${interfaceType} ${controlState} connected=${connected}`)
            .toBe(canWriteToDevice(link));
        }
      }
    }
  });

  it('is false without a link at all', () => {
    expect(holdsControl(null)).toBe(false);
  });
});
