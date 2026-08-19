// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { usePolledTargets, type PollTarget } from '../useAutoRefresh';

afterEach(cleanup);

/**
 * `usePolledTargets` is `.scratch/rust-owned-polling` issue 03's frontend
 * seam: the one place a surface subscribes to the backend's per-address poll
 * mechanism. Coalescing itself (one read per address, fastest interval wins)
 * is proven where it actually lives — `poll.rs`'s own unit tests on the real
 * backend, `fakeBackendPort.test.ts` on its stand-in. What belongs here is
 * the hook's own contract: it subscribes once per mount and unsubscribes
 * once per unmount, and does not leak a subscription when a mount is
 * cleaned up before the (asynchronous, IPC-crossing) registration resolves —
 * the same race `DSHubContext.listeners.test.tsx` pins for event listeners
 * (ADR 0003's second amendment), reproduced here for subscriptions instead.
 */

const TARGET: PollTarget = { source: 'register', address: 4, name: 'SPEED' };

/** Counts subscribe/unsubscribe calls while still behaving like the real fake underneath. */
function countingPort() {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  let subscribed = 0;
  let released = 0;

  const port: BackendPort = {
    ...fake,
    device: {
      ...fake.device,
      subscribeAddress: async (source, address, name, intervalMs) => {
        subscribed += 1;
        return fake.device.subscribeAddress(source, address, name, intervalMs);
      },
      unsubscribeAddress: async id => {
        released += 1;
        return fake.device.unsubscribeAddress(id);
      },
    },
  };

  return { port, counts: () => ({ subscribed, released }) };
}

/** A port whose `subscribeAddress` call the test resolves by hand, so a
 *  cleanup can be made to run before the registration completes. */
function deferredSubscribePort() {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  const unsubscribed: number[] = [];
  let resolve!: (id: number) => void;
  const pending = new Promise<number>(r => { resolve = r; });

  const port: BackendPort = {
    ...fake,
    device: {
      ...fake.device,
      subscribeAddress: () => pending,
      unsubscribeAddress: async id => {
        unsubscribed.push(id);
      },
    },
  };

  return { port, unsubscribed, resolve };
}

function wrapper(port: BackendPort, strict = false) {
  return ({ children }: { children: ReactNode }): React.JSX.Element => {
    const tree = <BackendPortProvider port={port}>{children}</BackendPortProvider>;
    return strict ? <StrictMode>{tree}</StrictMode> : tree;
  };
}

/** Lets the asynchronous subscribe/unsubscribe registration settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

describe('usePolledTargets', () => {
  it('subscribes once per mount and unsubscribes once per unmount', async () => {
    const { port, counts } = countingPort();
    const { unmount } = renderHook(() => usePolledTargets([TARGET], 500, true), {
      wrapper: wrapper(port),
    });
    await settle();

    expect(counts()).toEqual({ subscribed: 1, released: 0 });

    unmount();
    await settle();

    expect(counts()).toEqual({ subscribed: 1, released: 1 });
  });

  it('does not subscribe while disabled', async () => {
    const { port, counts } = countingPort();
    renderHook(() => usePolledTargets([TARGET], 500, false), { wrapper: wrapper(port) });
    await settle();

    expect(counts()).toEqual({ subscribed: 0, released: 0 });
  });

  it('releases every subscription it took out, however many effect runs StrictMode caused', async () => {
    // StrictMode mounts, unmounts and remounts every effect once. Without the
    // cancelled-flag guard, the registration that completed after the first
    // cleanup had nothing to remove and stayed live, leaking a subscription.
    const { port, counts } = countingPort();
    const { unmount } = renderHook(() => usePolledTargets([TARGET], 500, true), {
      wrapper: wrapper(port, true),
    });
    await settle();

    unmount();
    await settle();

    const { subscribed, released } = counts();
    expect(subscribed).toBeGreaterThan(0);
    expect(released).toBe(subscribed);
  });

  it('unsubscribes a registration that resolves after the mount already cleaned up', async () => {
    // Subscribing crosses the IPC boundary, so it is asynchronous while this
    // effect's cleanup is not — a fast mount/unmount can tear down before the
    // subscription id has come back at all.
    const { port, unsubscribed, resolve } = deferredSubscribePort();
    const { unmount } = renderHook(() => usePolledTargets([TARGET], 500, true), {
      wrapper: wrapper(port),
    });

    unmount();
    expect(unsubscribed).toEqual([]); // nothing to release yet — no id has arrived

    resolve(77);
    await settle();

    expect(unsubscribed).toEqual([77]);
  });
});
