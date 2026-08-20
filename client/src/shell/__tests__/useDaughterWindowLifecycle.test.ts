// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { isTauri } from '@tauri-apps/api/core';
import { useDaughterWindowLifecycle } from '../useDaughterWindowLifecycle';
import { closeDaughterWindow, restoreDaughterWindow, useDaughterWindows } from '../daughterWindowNative';
import { useToast } from '../ToastNotification';
import type { DaughterWindowBounds, StoredDaughterWindow } from '../workspaceStore';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
}));

vi.mock('../daughterWindowNative', () => ({
  closeDaughterWindow: vi.fn(),
  restoreDaughterWindow: vi.fn(),
  useDaughterWindows: vi.fn(),
}));

vi.mock('../ToastNotification', () => ({
  useToast: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

const bounds: DaughterWindowBounds = { x: 10, y: 20, width: 640, height: 480 };

function daughterWindow(label: string): StoredDaughterWindow {
  return { label, dockLayout: { grid: { root: { type: 'branch', data: [] }, height: 0, width: 0, orientation: 'HORIZONTAL' }, panels: {} } as never, paneStates: {}, bounds };
}

function setUp(openLabels: readonly string[] = []) {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(useDaughterWindows).mockReturnValue(openLabels);
  const showError = vi.fn();
  vi.mocked(useToast).mockReturnValue({
    showToast: vi.fn(),
    showSuccess: vi.fn(),
    showError,
    showWarning: vi.fn(),
    showInfo: vi.fn(),
  });
  return { showError };
}

describe('useDaughterWindowLifecycle', () => {
  it('exposes the live open-Daughter-Window list unchanged', () => {
    setUp(['daughter-1', 'daughter-2']);
    const { result } = renderHook(() => useDaughterWindowLifecycle());
    expect(result.current.openDaughterWindows).toEqual(['daughter-1', 'daughter-2']);
  });

  describe('openWorkspaceDaughterWindows', () => {
    it('restores every saved entry in array order, by its own index', async () => {
      setUp();
      vi.mocked(restoreDaughterWindow).mockResolvedValue('daughter-1');
      const { result } = renderHook(() => useDaughterWindowLifecycle());

      await act(async () => {
        await result.current.openWorkspaceDaughterWindows([daughterWindow('a'), daughterWindow('b')]);
      });

      expect(vi.mocked(restoreDaughterWindow).mock.calls).toEqual([
        [0, bounds],
        [1, bounds],
      ]);
    });

    it('is a no-op outside Tauri, so a stored Daughter Window list never causes a browser-dev session to invoke anything', async () => {
      setUp();
      vi.mocked(isTauri).mockReturnValue(false);
      const { result } = renderHook(() => useDaughterWindowLifecycle());

      await act(async () => {
        await result.current.openWorkspaceDaughterWindows([daughterWindow('a')]);
      });

      expect(restoreDaughterWindow).not.toHaveBeenCalled();
    });

    it('reports a failed restore and still opens the rest of the list', async () => {
      const { showError } = setUp();
      vi.mocked(restoreDaughterWindow).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('daughter-2');
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useDaughterWindowLifecycle());

      await act(async () => {
        await result.current.openWorkspaceDaughterWindows([daughterWindow('a'), daughterWindow('b')]);
      });

      expect(showError).toHaveBeenCalledTimes(1);
      expect(restoreDaughterWindow).toHaveBeenCalledTimes(2); // the second entry still opened
      consoleError.mockRestore();
    });

    it('does nothing for an empty list', async () => {
      setUp();
      const { result } = renderHook(() => useDaughterWindowLifecycle());
      await act(async () => {
        await result.current.openWorkspaceDaughterWindows([]);
      });
      expect(restoreDaughterWindow).not.toHaveBeenCalled();
    });
  });

  describe('closeAllDaughterWindows', () => {
    it('closes every currently-open label', async () => {
      setUp(['daughter-1', 'daughter-2']);
      const { result } = renderHook(() => useDaughterWindowLifecycle());

      await act(async () => {
        await result.current.closeAllDaughterWindows();
      });

      expect(vi.mocked(closeDaughterWindow).mock.calls.map(call => call[0]).sort()).toEqual(['daughter-1', 'daughter-2']);
    });
  });

  describe('switchDaughterWindows', () => {
    it('closes every currently-open window before opening the target list', async () => {
      setUp(['daughter-1']);
      vi.mocked(restoreDaughterWindow).mockResolvedValue('daughter-2');
      const order: string[] = [];
      vi.mocked(closeDaughterWindow).mockImplementation(async () => {
        order.push('close');
      });
      vi.mocked(restoreDaughterWindow).mockImplementation(async () => {
        order.push('open');
        return 'daughter-2';
      });

      const { result } = renderHook(() => useDaughterWindowLifecycle());
      await act(async () => {
        await result.current.switchDaughterWindows([daughterWindow('a')]);
      });

      expect(order).toEqual(['close', 'open']);
    });
  });
});
