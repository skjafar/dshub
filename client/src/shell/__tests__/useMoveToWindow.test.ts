// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { DockviewApi, IDockviewPanel } from 'dockview';
import { useMoveToWindow } from '../useMoveToWindow';
import { sendPaneHandoff, useIncomingPaneHandoffs } from '../paneHandoff';
import { MAIN_WINDOW_ID } from '../focusMode';
import type { WindowId } from '../focusMode';

vi.mock('../paneHandoff', () => ({
  sendPaneHandoff: vi.fn(),
  useIncomingPaneHandoffs: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

function fakePanel(id: string): IDockviewPanel {
  return { id } as IDockviewPanel;
}

function apiRefWith(removePanel: (panel: IDockviewPanel) => void) {
  return { current: { removePanel } as unknown as DockviewApi };
}

function locations(entries: Record<string, readonly string[]>): ReadonlyMap<WindowId, readonly string[]> {
  return new Map(Object.entries(entries));
}

function names(entries: Record<string, string> = {}): ReadonlyMap<WindowId, string> {
  return new Map(Object.entries(entries));
}

const NO_NAMES = names();

describe('useMoveToWindow', () => {
  describe('targetsFor', () => {
    it("lists every open Window a Pane's kind could move to", () => {
      const apiRef = apiRefWith(vi.fn());
      const { result } = renderHook(() =>
        useMoveToWindow(apiRef, MAIN_WINDOW_ID, ['daughter-1'], locations({}), vi.fn(), NO_NAMES)
      );

      expect(result.current.targetsFor(fakePanel('register#1'))).toEqual([
        { windowId: 'daughter-1', label: 'Daughter Window 1' },
      ]);
    });

    it("labels a target by its own custom name, when it has one", () => {
      const apiRef = apiRefWith(vi.fn());
      const { result } = renderHook(() =>
        useMoveToWindow(apiRef, MAIN_WINDOW_ID, ['daughter-1'], locations({}), vi.fn(), names({ 'daughter-1': 'Scope monitor' }))
      );

      expect(result.current.targetsFor(fakePanel('register#1'))).toEqual([
        { windowId: 'daughter-1', label: 'Scope monitor' },
      ]);
    });

    it('excludes a Window that already has this singleton open', () => {
      const apiRef = apiRefWith(vi.fn());
      const { result } = renderHook(() =>
        useMoveToWindow(
          apiRef,
          MAIN_WINDOW_ID,
          ['daughter-1', 'daughter-2'],
          locations({ 'daughter-1': ['inspector'] }),
          vi.fn(),
          NO_NAMES
        )
      );

      expect(result.current.targetsFor(fakePanel('inspector'))).toEqual([
        { windowId: 'daughter-2', label: 'Daughter Window 2' },
      ]);
    });

    it('is empty for a panel id naming no known Pane kind', () => {
      const apiRef = apiRefWith(vi.fn());
      const { result } = renderHook(() =>
        useMoveToWindow(apiRef, MAIN_WINDOW_ID, ['daughter-1'], locations({}), vi.fn(), NO_NAMES)
      );

      expect(result.current.targetsFor(fakePanel('not-a-real-kind'))).toEqual([]);
    });
  });

  describe('requestMove', () => {
    it("sends the panel's own kind and state, and removes it from the source on success", async () => {
      vi.mocked(sendPaneHandoff).mockResolvedValue(undefined);
      const removePanel = vi.fn();
      const apiRef = apiRefWith(removePanel);
      const { result } = renderHook(() =>
        useMoveToWindow(apiRef, MAIN_WINDOW_ID, ['daughter-1'], locations({}), vi.fn(), NO_NAMES)
      );
      const panel = fakePanel('register#2');

      await act(async () => {
        result.current.requestMove(panel, 'daughter-1');
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(sendPaneHandoff).toHaveBeenCalledWith({
        targetWindowId: 'daughter-1',
        kind: 'register',
        paneState: undefined,
      });
      expect(removePanel).toHaveBeenCalledWith(panel);
    });

    it('does not remove the source panel if the handoff fails to send', async () => {
      vi.mocked(sendPaneHandoff).mockRejectedValue(new Error('boom'));
      const removePanel = vi.fn();
      const apiRef = apiRefWith(removePanel);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() =>
        useMoveToWindow(apiRef, MAIN_WINDOW_ID, ['daughter-1'], locations({}), vi.fn(), NO_NAMES)
      );

      await act(async () => {
        result.current.requestMove(fakePanel('register#1'), 'daughter-1');
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(removePanel).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('does nothing for a panel whose id names no known Pane kind', async () => {
      const removePanel = vi.fn();
      const apiRef = apiRefWith(removePanel);
      const { result } = renderHook(() =>
        useMoveToWindow(apiRef, MAIN_WINDOW_ID, [], locations({}), vi.fn(), NO_NAMES)
      );

      await act(async () => {
        result.current.requestMove(fakePanel('not-a-real-kind'), 'daughter-1');
        await Promise.resolve();
      });

      expect(sendPaneHandoff).not.toHaveBeenCalled();
      expect(removePanel).not.toHaveBeenCalled();
    });

    it("sends the panel's own current paneState.ts blob, whatever shape that kind uses", async () => {
      vi.mocked(sendPaneHandoff).mockResolvedValue(undefined);
      const apiRef = apiRefWith(vi.fn());
      const { result } = renderHook(() =>
        useMoveToWindow(apiRef, MAIN_WINDOW_ID, ['daughter-1'], locations({}), vi.fn(), NO_NAMES)
      );

      await act(async () => {
        result.current.requestMove(fakePanel('register#3'), 'daughter-1');
        await Promise.resolve();
        await Promise.resolve();
      });

      // No usePaneState was ever recorded for this fixture's id — the
      // handoff still carries `undefined` rather than throwing, matching
      // `paneState.ts`'s own `snapshotPaneStates` contract.
      expect(sendPaneHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'register', paneState: undefined })
      );
    });
  });

  describe('receiving a handoff', () => {
    it('opens the seeded Pane when a handoff addressed to this Window arrives', () => {
      const apiRef = apiRefWith(vi.fn());
      const openPane = vi.fn();
      renderHook(() => useMoveToWindow(apiRef, 'daughter-1', [], locations({}), openPane, NO_NAMES));

      const onReceive = vi.mocked(useIncomingPaneHandoffs).mock.calls[0]?.[1];
      expect(onReceive).toBeDefined();
      onReceive?.({ targetWindowId: 'daughter-1', kind: 'register', paneState: { query: 'X' } });

      expect(openPane).toHaveBeenCalledWith('register', { query: 'X' });
    });

    it('registers under this Window\'s own id, so `useIncomingPaneHandoffs` filters correctly on its behalf', () => {
      const apiRef = apiRefWith(vi.fn());
      renderHook(() => useMoveToWindow(apiRef, 'daughter-2', [], locations({}), vi.fn(), NO_NAMES));

      expect(useIncomingPaneHandoffs).toHaveBeenCalledWith('daughter-2', expect.any(Function));
    });
  });
});
