// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { DockviewApi, IDockviewPanel } from 'dockview';
import { useMoveToNewDaughterWindow } from '../useMoveToNewDaughterWindow';
import { openDaughterWindow, useDaughterWindows } from '../daughterWindowNative';

vi.mock('../daughterWindowNative', () => ({
  openDaughterWindow: vi.fn(),
  useDaughterWindows: vi.fn(),
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

describe('useMoveToNewDaughterWindow', () => {
  it('opens a new window and removes the source panel on success, below the warning threshold', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue([]); // well under the threshold
    vi.mocked(openDaughterWindow).mockResolvedValue('daughter-1');
    const removePanel = vi.fn();
    const apiRef = apiRefWith(removePanel);

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));
    const panel = fakePanel('register#2');

    await act(async () => {
      result.current.requestMove(panel);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openDaughterWindow).toHaveBeenCalledWith('register');
    expect(removePanel).toHaveBeenCalledWith(panel);
    expect(result.current.pendingPanel).toBeNull();
  });

  it('does not remove the source panel if opening the new window fails', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue([]);
    vi.mocked(openDaughterWindow).mockRejectedValue(new Error('boom'));
    const removePanel = vi.fn();
    const apiRef = apiRefWith(removePanel);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));

    await act(async () => {
      result.current.requestMove(fakePanel('plot#1'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(removePanel).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('holds the move for confirmation once the open count reaches the warning threshold', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue(['daughter-1', 'daughter-2', 'daughter-3', 'daughter-4']);
    vi.mocked(openDaughterWindow).mockResolvedValue('daughter-5');
    const removePanel = vi.fn();
    const apiRef = apiRefWith(removePanel);

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));
    const panel = fakePanel('register');

    act(() => result.current.requestMove(panel));

    expect(openDaughterWindow).not.toHaveBeenCalled();
    expect(result.current.pendingPanel).toBe(panel);

    await act(async () => {
      result.current.confirm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openDaughterWindow).toHaveBeenCalledWith('register');
    expect(removePanel).toHaveBeenCalledWith(panel);
    expect(result.current.pendingPanel).toBeNull();
  });

  it('cancel clears the pending move without opening anything', () => {
    vi.mocked(useDaughterWindows).mockReturnValue(['daughter-1', 'daughter-2', 'daughter-3', 'daughter-4']);
    const apiRef = apiRefWith(vi.fn());

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));

    act(() => result.current.requestMove(fakePanel('register')));
    expect(result.current.pendingPanel).not.toBeNull();

    act(() => result.current.cancel());
    expect(result.current.pendingPanel).toBeNull();
    expect(openDaughterWindow).not.toHaveBeenCalled();
  });

  it('does nothing for a panel whose id names no known Pane kind', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue([]);
    const apiRef = apiRefWith(vi.fn());

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));
    await act(async () => {
      result.current.requestMove(fakePanel('not-a-real-kind'));
      await Promise.resolve();
    });

    expect(openDaughterWindow).not.toHaveBeenCalled();
  });
});
