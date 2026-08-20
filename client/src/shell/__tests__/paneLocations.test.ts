// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { isTauri } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { MAIN_WINDOW_ID } from '../focusMode';
import { PANE_LOCATIONS_EVENT, usePaneLocations } from '../paneLocations';
import type { PaneLocationsAnnouncement } from '../paneLocations';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
  listen: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
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
    vi.mocked(listen).mockResolvedValue(vi.fn());

    const { rerender } = renderHook(
      ({ paneIds }: { paneIds: readonly string[] }) => usePaneLocations(MAIN_WINDOW_ID, paneIds, [MAIN_WINDOW_ID]),
      { initialProps: { paneIds: ['overview'] } }
    );
    await settle();
    expect(emit).toHaveBeenCalledWith(PANE_LOCATIONS_EVENT, { windowId: MAIN_WINDOW_ID, paneIds: ['overview'] });

    rerender({ paneIds: ['overview', 'register#1'] });
    expect(emit).toHaveBeenCalledWith(PANE_LOCATIONS_EVENT, { windowId: MAIN_WINDOW_ID, paneIds: ['overview', 'register#1'] });
  });

  it("merges another Window's broadcast into the aggregate", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let deliver: (payload: PaneLocationsAnnouncement) => void = () => {};
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      deliver = payload => (handler as (event: { payload: PaneLocationsAnnouncement }) => void)({ payload });
      return vi.fn();
    });

    const { result } = renderHook(() => usePaneLocations(MAIN_WINDOW_ID, [], [MAIN_WINDOW_ID, 'daughter-1']));
    await settle();

    act(() => deliver({ windowId: 'daughter-1', paneIds: ['inspector'] }));

    expect(result.current.get('daughter-1')).toEqual(['inspector']);
    expect(result.current.get(MAIN_WINDOW_ID)).toEqual([]);
  });

  it("ignores a broadcast carrying this Window's own id — its own entry only ever comes from its own paneIds, never a round trip", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let deliver: (payload: PaneLocationsAnnouncement) => void = () => {};
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      deliver = payload => (handler as (event: { payload: PaneLocationsAnnouncement }) => void)({ payload });
      return vi.fn();
    });

    const { result } = renderHook(() => usePaneLocations(MAIN_WINDOW_ID, ['overview'], [MAIN_WINDOW_ID]));
    await settle();

    act(() => deliver({ windowId: MAIN_WINDOW_ID, paneIds: ['stale'] }));

    expect(result.current.get(MAIN_WINDOW_ID)).toEqual(['overview']);
  });

  it('prunes a Window once it drops out of `stillOpen` — a since-closed Window stops being reported', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let deliver: (payload: PaneLocationsAnnouncement) => void = () => {};
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      deliver = payload => (handler as (event: { payload: PaneLocationsAnnouncement }) => void)({ payload });
      return vi.fn();
    });

    const { result, rerender } = renderHook(
      ({ stillOpen }: { stillOpen: readonly string[] }) => usePaneLocations(MAIN_WINDOW_ID, [], stillOpen),
      { initialProps: { stillOpen: [MAIN_WINDOW_ID, 'daughter-1'] } }
    );
    await settle();
    act(() => deliver({ windowId: 'daughter-1', paneIds: ['inspector'] }));
    expect(result.current.get('daughter-1')).toEqual(['inspector']);

    rerender({ stillOpen: [MAIN_WINDOW_ID] }); // daughter-1 has since closed
    expect(result.current.has('daughter-1')).toBe(false);
  });

  it('unsubscribes on unmount', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);

    const { unmount } = renderHook(() => usePaneLocations(MAIN_WINDOW_ID, [], [MAIN_WINDOW_ID]));
    await settle();
    unmount();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
