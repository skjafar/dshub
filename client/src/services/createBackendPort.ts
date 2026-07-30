/**
 * Chooses which {@link BackendPort} the application runs against.
 *
 * Inside the desktop application the Tauri transport is present and is always
 * used. In a plain browser there is no transport at all, so the fake serves
 * instead — which is what makes the interface developable, reviewable and
 * screenshottable without hardware.
 *
 * The choice is made from whether Tauri is actually there rather than from a
 * build flag, so a production desktop build cannot be talked into serving fake
 * data by a stray environment variable.
 */

import { isTauri } from '@tauri-apps/api/core';
import type { BackendPort } from './backendPort';
import { createFakeBackendPort } from './fakeBackendPort';
import type { FakeBackendPort } from './fakeBackendPort';
import { createTauriBackendPort } from './tauriBackendPort';

/**
 * The one fake Device of a browser session.
 *
 * There is deliberately only ever one. React's StrictMode invokes the factory
 * twice on mount, and a fresh fake per call would leave two Devices with
 * independent value streams and separate fault switches — so the switches
 * reachable from the console could be the ones the interface is not listening
 * to. A session has one Device, as a bench does.
 */
let fake: FakeBackendPort | null = null;

export function createBackendPort(): BackendPort {
  if (isTauri()) {
    return createTauriBackendPort();
  }

  if (!fake) {
    fake = createFakeBackendPort();

    // Said plainly and once: every number on screen is invented. Nobody should
    // read a value here and believe a board produced it.
    console.warn(
      '[DSHub] No Tauri transport — serving fake Device data. Values are synthetic.\n' +
        'Misbehaviour switches are on window.dshubFaults: ' +
        'refuseControl(true), dropLink(), invalidate(true).'
    );

    // Reachable from the browser console, so refused Control, a dropped link and
    // invalid entries can be brought up while looking at the interface.
    (window as unknown as { dshubFaults?: unknown }).dshubFaults = fake.faults;
  }

  return fake;
}
