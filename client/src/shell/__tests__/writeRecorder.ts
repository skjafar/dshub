/**
 * Records what reaches the port, for a fake wired to a Pane under test.
 *
 * Shared by every suite that asserts what a write actually sends, so the
 * recording shape — three write commands wrapped, one array pushed to — exists
 * once rather than being retyped per file. The recorder only observes; it
 * forwards to the same fake browser development runs against rather than
 * replacing it, so a write asserted through this is one the interface really
 * made. See `spec.md`'s testing decisions: "Nothing mocks modules and nothing
 * stubs the transport."
 */

import type { BackendPort } from '../../services/backendPort';
import type { FakeBackendPort } from '../../services/fakeBackendPort';
import type { AddressSpace } from '../addressSpace';

export interface RecordedWrite {
  readonly space: AddressSpace;
  readonly address: number;
  readonly value: number;
}

export interface WriteRecorder {
  /** The port to render a Pane against; every write it forwards is recorded. */
  readonly port: BackendPort;
  readonly writes: RecordedWrite[];
}

export function recordWrites(fake: FakeBackendPort): WriteRecorder {
  const writes: RecordedWrite[] = [];

  const port: BackendPort = {
    ...fake,
    device: {
      ...fake.device,
      writeRegister: async (address, value) => {
        writes.push({ space: 'register', address, value });
        return fake.device.writeRegister(address, value);
      },
      writeParameter: async (address, value) => {
        writes.push({ space: 'parameter', address, value });
        return fake.device.writeParameter(address, value);
      },
      writeSystemRegister: async (address, value) => {
        writes.push({ space: 'sysRegister', address, value });
        return fake.device.writeSystemRegister(address, value);
      },
    },
  };

  return { port, writes };
}
