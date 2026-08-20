// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Window as TauriWindow } from '@tauri-apps/api/window';
import {
  closeDaughterWindow,
  focusDaughterWindow,
  listDaughterWindows,
  openDaughterWindow,
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
