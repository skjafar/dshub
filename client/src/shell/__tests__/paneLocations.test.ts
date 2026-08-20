// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { isTauri } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { MAIN_WINDOW_ID } from '../focusMode';
import { PANE_LOCATIONS_EVENT, PANE_LOCATIONS_REQUEST_EVENT, usePaneLocations } from '../paneLocations';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
  listen: vi.fn(),
}));

type Handler = (event: { payload: unknown }) => void;

/**
 * A minimal in-memory stand-in for Tauri's own global event bus: `listen`
 * registers a handler under its event name, `emit` dispatches synchronously
 * to every handler currently registered for that name — global, and
 * delivered to the emitting Window too, close enough to the real thing to
 * either simulate "another Window" by calling `emit` directly from a test,
 * or run two real `usePaneLocations` instances against each other the way
 * two real Windows would (the catch-up test below does exactly that).
 */
function installEventBus(): { unlistenSpies: ReturnType<typeof vi.fn>[] } {
  const handlers = new Map<string, Set<Handler>>();
  const unlistenSpies: ReturnType<typeof vi.fn>[] = [];

  vi.mocked(listen).mockImplementation(async (event, handler) => {
    const name = event as string;
    const set = handlers.get(name) ?? new Set<Handler>();
    set.add(handler as never);
    handlers.set(name, set);
    const spy = vi.fn(() => {
      set.delete(handler as never);
    });
    unlistenSpies.push(spy);
    return spy;
  });

  vi.mocked(emit).mockImplementation(async (event, payload) => {
    const name = event as string;
    for (const handler of handlers.get(name) ?? []) handler({ payload });
  });

  return { unlistenSpies };
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

/** Flushes both the `Promise.all(...).then(...)` registration chain and any React state updates it triggers — a macrotask, not a fixed count of `Promise.resolve()` hops, so it stays correct regardless of how many microtask ticks that chain needs. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

describe('usePaneLocations', () => {
  it("reports this Window's own panel ids under its own id, even outside Tauri", () => {
    vi.mocked(isTauri).mockReturnValue(false);

    const { result } = renderHook(() => usePaneLocations(MAIN_WINDOW_ID, ['overview'], [MAIN_WINDOW_ID]));

    expect(result.current.get(MAIN_WINDOW_ID)).toEqual(['overview']);
    expect(listen).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("broadcasts this Window's own panel ids on mount and again whenever they change, under Tauri", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    installEventBus();

    const { rerender } = renderHook(
      ({ paneIds }: { paneIds: readonly string[] }) => usePaneLocations(MAIN_WINDOW_ID, paneIds, [MAIN_WINDOW_ID]),
      { initialProps: { paneIds: ['overview'] } }
    );
    await settle();
    expect(emit).toHaveBeenCalledWith(PANE_LOCATIONS_EVENT, { windowId: MAIN_WINDOW_ID, paneIds: ['overview'] });

    rerender({ paneIds: ['overview', 'register#1'] });
    expect(emit).toHaveBeenCalledWith(PANE_LOCATIONS_EVENT, { windowId: MAIN_WINDOW_ID, paneIds: ['overview', 'register#1'] });
  });

  it('asks every other Window to re-announce itself, once its own listeners are confirmed registered', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    installEventBus();

    renderHook(() => usePaneLocations(MAIN_WINDOW_ID, [], [MAIN_WINDOW_ID]));
    await settle();

    expect(emit).toHaveBeenCalledWith(PANE_LOCATIONS_REQUEST_EVENT);
  });

  it("merges another Window's broadcast into the aggregate", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    installEventBus();

    const { result } = renderHook(() => usePaneLocations(MAIN_WINDOW_ID, [], [MAIN_WINDOW_ID, 'daughter-1']));
    await settle();

    await act(async () => {
      await emit(PANE_LOCATIONS_EVENT, { windowId: 'daughter-1', paneIds: ['inspector'] });
    });

    expect(result.current.get('daughter-1')).toEqual(['inspector']);
    expect(result.current.get(MAIN_WINDOW_ID)).toEqual([]);
  });

  it("ignores a broadcast carrying this Window's own id — its own entry only ever comes from its own paneIds, never a round trip", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    installEventBus();

    const { result } = renderHook(() => usePaneLocations(MAIN_WINDOW_ID, ['overview'], [MAIN_WINDOW_ID]));
    await settle();

    await act(async () => {
      await emit(PANE_LOCATIONS_EVENT, { windowId: MAIN_WINDOW_ID, paneIds: ['stale'] });
    });

    expect(result.current.get(MAIN_WINDOW_ID)).toEqual(['overview']);
  });

  it('prunes a Window once it drops out of `stillOpen` — a since-closed Window stops being reported', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    installEventBus();

    const { result, rerender } = renderHook(
      ({ stillOpen }: { stillOpen: readonly string[] }) => usePaneLocations(MAIN_WINDOW_ID, [], stillOpen),
      { initialProps: { stillOpen: [MAIN_WINDOW_ID, 'daughter-1'] } }
    );
    await settle();
    await act(async () => {
      await emit(PANE_LOCATIONS_EVENT, { windowId: 'daughter-1', paneIds: ['inspector'] });
    });
    expect(result.current.get('daughter-1')).toEqual(['inspector']);

    rerender({ stillOpen: [MAIN_WINDOW_ID] }); // daughter-1 has since closed
    expect(result.current.has('daughter-1')).toBe(false);
  });

  it('unsubscribes both listeners on unmount', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const { unlistenSpies } = installEventBus();

    const { unmount } = renderHook(() => usePaneLocations(MAIN_WINDOW_ID, [], [MAIN_WINDOW_ID]));
    await settle();
    expect(unlistenSpies).toHaveLength(2); // the "changed" listener and the "request" listener

    unmount();

    for (const spy of unlistenSpies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it(
    "a freshly-mounted Window catches up on an already-open Window's panes via the request/response " +
      'handshake — without this, a singleton open before this Window existed would never show as ' +
      'disabled until something unrelated changed in the other Window (the bug this closes)',
    async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      installEventBus();

      // Stable references, not literals inline in the render callbacks
      // below: with two hook instances live at once, each feeding the
      // other a fresh broadcast on every one of *its own* re-renders, a
      // fresh array reference each render would make `usePaneLocations`'s
      // own change-detection (`[ownWindowId, ownPaneIds]`) treat *every*
      // re-render as "my own panes changed," even with identical content —
      // re-announcing, which re-triggers the other Window's re-render, on
      // and on. Real callers never hit this: `AppShell.tsx`/
      // `DaughterWindowShell.tsx` only ever produce a fresh `openPaneIds`
      // array from dockview's own `onDidLayoutChange`, an external event
      // untouched by this hook's own state changes, so nothing there ever
      // feeds back into itself the way two inline literals do here.
      const windowAPanes: readonly string[] = ['overview'];
      const windowBPanes: readonly string[] = [];
      const bothWindows: readonly string[] = [MAIN_WINDOW_ID, 'daughter-1'];

      // Window A ("main") already has "overview" open and has been running
      // for a while — its own announce for this already happened before
      // Window B ever existed to hear it.
      renderHook(() => usePaneLocations(MAIN_WINDOW_ID, windowAPanes, bothWindows));
      await settle();

      // Window B mounts later. Its own request, answered by A's own
      // request-listener (registered back when A mounted), is the only way
      // it can ever learn "overview" is open in A.
      const { result: windowB } = renderHook(() => usePaneLocations('daughter-1', windowBPanes, bothWindows));
      await settle();

      expect(windowB.current.get(MAIN_WINDOW_ID)).toEqual(['overview']);
    }
  );
});
