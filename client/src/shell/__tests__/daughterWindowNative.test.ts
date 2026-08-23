// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, Window as TauriWindow } from '@tauri-apps/api/window';
import {
  closeDaughterWindow,
  focusDaughterWindow,
  listDaughterWindows,
  openDaughterWindow,
  openDaughterWindowAt,
  readOwnWindowBounds,
  readWindowBounds,
  restoreDaughterWindow,
  subscribeDaughterWindows,
  useDaughterWindows,
} from '../daughterWindowNative';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  Window: { getByLabel: vi.fn() },
  getCurrentWindow: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('openDaughterWindow', () => {
  it('invokes the Rust command with the Pane kind and resolves its new label', async () => {
    vi.mocked(invoke).mockResolvedValue('daughter-3');
    const label = await openDaughterWindow('register');
    expect(invoke).toHaveBeenCalledWith('open_daughter_window', { paneKind: 'register' });
    expect(label).toBe('daughter-3');
  });
});

describe('openDaughterWindowAt', () => {
  it('invokes the Rust command with the Pane kind, bounds and JSON-encoded, percent-encoded state', async () => {
    vi.mocked(invoke).mockResolvedValue('daughter-2');
    const bounds = { x: 100, y: 200, width: 640, height: 480 };

    const label = await openDaughterWindowAt('register', bounds, { query: 'MOTOR' });

    expect(invoke).toHaveBeenCalledWith('open_daughter_window_at', {
      paneKind: 'register',
      bounds,
      paneState: encodeURIComponent(JSON.stringify({ query: 'MOTOR' })),
    });
    expect(label).toBe('daughter-2');
  });

  it('sends null, not undefined, when there is no state to carry', async () => {
    vi.mocked(invoke).mockResolvedValue('daughter-2');
    const bounds = { x: 0, y: 0, width: 640, height: 480 };

    await openDaughterWindowAt('overview', bounds, undefined);

    expect(invoke).toHaveBeenCalledWith('open_daughter_window_at', { paneKind: 'overview', bounds, paneState: null });
  });
});

describe('readWindowBounds', () => {
  it("reads every named Window's outer bounds, converted to logical pixels", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(TauriWindow.getByLabel).mockImplementation(async (label: string) =>
      ({
        outerPosition: vi.fn().mockResolvedValue({ toLogical: () => (label === 'main' ? { x: 0, y: 0 } : { x: 800, y: 100 }) }),
        outerSize: vi.fn().mockResolvedValue({ toLogical: () => (label === 'main' ? { width: 1200, height: 800 } : { width: 640, height: 480 }) }),
        scaleFactor: vi.fn().mockResolvedValue(1),
      }) as never
    );

    const bounds = await readWindowBounds(['main', 'daughter-1']);

    expect(bounds).toEqual([
      { left: 0, top: 0, width: 1200, height: 800 },
      { left: 800, top: 100, width: 640, height: 480 },
    ]);
  });

  it('omits a Window that fails to resolve rather than failing the whole batch', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(TauriWindow.getByLabel).mockImplementation(async (label: string) =>
      label === 'main'
        ? ({
            outerPosition: vi.fn().mockResolvedValue({ toLogical: () => ({ x: 0, y: 0 }) }),
            outerSize: vi.fn().mockResolvedValue({ toLogical: () => ({ width: 1200, height: 800 }) }),
            scaleFactor: vi.fn().mockResolvedValue(1),
          } as never)
        : null
    );

    const bounds = await readWindowBounds(['main', 'daughter-gone']);

    expect(bounds).toEqual([{ left: 0, top: 0, width: 1200, height: 800 }]);
  });
});

describe('restoreDaughterWindow', () => {
  it('invokes the Rust command with the restore index and bounds, and resolves the newly-minted label', async () => {
    vi.mocked(invoke).mockResolvedValue('daughter-1');
    const bounds = { x: 10, y: 20, width: 640, height: 480 };
    const label = await restoreDaughterWindow(2, bounds);
    expect(invoke).toHaveBeenCalledWith('restore_daughter_window', { restoreIndex: 2, bounds });
    expect(label).toBe('daughter-1');
  });
});

describe('readOwnWindowBounds', () => {
  it('converts this window\'s own physical position and size to logical pixels', async () => {
    const toLogicalPosition = vi.fn().mockReturnValue({ x: 50, y: 60 });
    const toLogicalSize = vi.fn().mockReturnValue({ width: 320, height: 240 });
    vi.mocked(getCurrentWindow).mockReturnValue({
      outerPosition: vi.fn().mockResolvedValue({ toLogical: toLogicalPosition }),
      innerSize: vi.fn().mockResolvedValue({ toLogical: toLogicalSize }),
      scaleFactor: vi.fn().mockResolvedValue(2),
    } as never);

    const bounds = await readOwnWindowBounds();

    expect(toLogicalPosition).toHaveBeenCalledWith(2);
    expect(toLogicalSize).toHaveBeenCalledWith(2);
    expect(bounds).toEqual({ x: 50, y: 60, width: 320, height: 240 });
  });
});

describe('listDaughterWindows', () => {
  it('invokes the Rust command when running under Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue(['daughter-1', 'daughter-2']);
    const labels = await listDaughterWindows();
    expect(invoke).toHaveBeenCalledWith('list_daughter_windows');
    expect(labels).toEqual(['daughter-1', 'daughter-2']);
  });

  it('returns an empty list outside Tauri without invoking anything', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const labels = await listDaughterWindows();
    expect(invoke).not.toHaveBeenCalled();
    expect(labels).toEqual([]);
  });
});

describe('subscribeDaughterWindows', () => {
  it('delivers broadcast payloads to the callback', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let deliver: (labels: string[]) => void = () => {};
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      deliver = labels => handler({ payload: labels } as never);
      return vi.fn();
    });

    const onChange = vi.fn();
    const unsubscribe = subscribeDaughterWindows(onChange);
    await act(async () => {
      await Promise.resolve();
    });

    deliver(['daughter-1']);
    expect(onChange).toHaveBeenCalledWith(['daughter-1']);
    unsubscribe();
  });

  it('unsubscribes cleanly even if called before the async listen registration resolves', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const unlisten = vi.fn();
    let resolveListen!: (fn: () => void) => void;
    vi.mocked(listen).mockReturnValue(new Promise(resolve => { resolveListen = resolve; }) as never);

    const unsubscribe = subscribeDaughterWindows(vi.fn());
    unsubscribe(); // cleaned up before registration completed

    resolveListen(unlisten);
    await act(async () => {
      await Promise.resolve();
    });

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('is a no-op outside Tauri', () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const unsubscribe = subscribeDaughterWindows(vi.fn());
    expect(listen).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('useDaughterWindows', () => {
  it('seeds from the initial list, then follows broadcasts', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let deliver: (labels: string[]) => void = () => {};
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      deliver = labels => handler({ payload: labels } as never);
      return vi.fn();
    });
    vi.mocked(invoke).mockResolvedValue(['daughter-1']);

    const { result } = renderHook(() => useDaughterWindows());
    await waitFor(() => expect(result.current).toEqual(['daughter-1']));

    act(() => deliver(['daughter-1', 'daughter-2']));
    expect(result.current).toEqual(['daughter-1', 'daughter-2']);
  });

  it('does not let a slow initial read clobber a broadcast that already arrived', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let deliver: (labels: string[]) => void = () => {};
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      deliver = labels => handler({ payload: labels } as never);
      return vi.fn();
    });

    let resolveList!: (labels: string[]) => void;
    vi.mocked(invoke).mockReturnValue(new Promise(resolve => { resolveList = resolve; }) as never);

    const { result } = renderHook(() => useDaughterWindows());

    // The broadcast lands before the slow initial read resolves.
    await act(async () => {
      await Promise.resolve();
    });
    act(() => deliver(['daughter-5']));
    expect(result.current).toEqual(['daughter-5']);

    resolveList(['daughter-1']); // stale — must not overwrite the broadcast's result
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual(['daughter-5']);
  });
});

describe('closeDaughterWindow', () => {
  it('closes via the Tauri window API, by label, when running under Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const tauriClose = vi.fn();
    vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ close: tauriClose } as never);

    await closeDaughterWindow('daughter-3');

    expect(TauriWindow.getByLabel).toHaveBeenCalledWith('daughter-3');
    expect(tauriClose).toHaveBeenCalledTimes(1);
  });

  it('is a no-op outside Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    await closeDaughterWindow('daughter-3');
    expect(TauriWindow.getByLabel).not.toHaveBeenCalled();
  });

  it('is a no-op if Tauri no longer knows that label', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(TauriWindow.getByLabel).mockResolvedValue(null);
    await expect(closeDaughterWindow('daughter-already-gone')).resolves.toBeUndefined();
  });

  it('does not throw if the Tauri close call itself rejects — e.g. a missing capability', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const tauriClose = vi.fn().mockRejectedValue(new Error('core:window:allow-close'));
    vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ close: tauriClose } as never);

    await expect(closeDaughterWindow('daughter-3')).resolves.toBeUndefined();
    expect(tauriClose).toHaveBeenCalledTimes(1);
  });
});

describe('focusDaughterWindow', () => {
  it('raises the native window via the Tauri window API, by label, when running under Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const tauriSetFocus = vi.fn();
    vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ setFocus: tauriSetFocus } as never);

    await focusDaughterWindow('daughter-3');

    expect(TauriWindow.getByLabel).toHaveBeenCalledWith('daughter-3');
    expect(tauriSetFocus).toHaveBeenCalledTimes(1);
  });

  it('is a no-op outside Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    await focusDaughterWindow('daughter-3');
    expect(TauriWindow.getByLabel).not.toHaveBeenCalled();
  });

  it('does not throw if the Tauri setFocus call itself rejects', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const tauriSetFocus = vi.fn().mockRejectedValue(new Error('core:window:allow-set-focus'));
    vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ setFocus: tauriSetFocus } as never);

    await expect(focusDaughterWindow('daughter-3')).resolves.toBeUndefined();
    expect(tauriSetFocus).toHaveBeenCalledTimes(1);
  });
});
