import { describe, it, expect, vi, afterEach } from 'vitest';
import { isTauri } from '@tauri-apps/api/core';
import { Window as TauriWindow } from '@tauri-apps/api/window';
import { closeDaughterWindow, focusDaughterWindow } from '../daughterWindowNative';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  Window: { getByLabel: vi.fn() },
}));

/**
 * The raw DOM `Window.close()`/`Window.focus()` dockview itself calls only
 * ever reach a Daughter Window's webview content under Tauri — its native
 * OS frame (title bar, close button, z-order) belongs to a separate
 * `WebviewWindow` Tauri manages, unreachable from either call. This is what
 * actually closes and raises it — confirmed by hand against a live Tauri
 * build, where the raw DOM path left a closed-but-still-open blank window
 * and this one closes it for real (spec.md, story 22; the `WebviewWindow`
 * path also needs `core:window:allow-close` /
 * `core:window:allow-set-focus` in `capabilities/default.json`, which a
 * missing-permission rejection here falls back past rather than silently
 * doing nothing).
 */
describe('daughterWindowNative', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function fakeWindow(label: string | undefined): Window {
    return {
      close: vi.fn(),
      focus: vi.fn(),
      __TAURI_INTERNALS__: label === undefined ? undefined : { metadata: { currentWindow: { label } } },
    } as unknown as Window;
  }

  describe('closeDaughterWindow', () => {
    it('closes via the Tauri window API, by label, when running under Tauri', async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      const tauriClose = vi.fn();
      vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ close: tauriClose } as never);

      const target = fakeWindow('popout-3');
      await closeDaughterWindow(target);

      expect(TauriWindow.getByLabel).toHaveBeenCalledWith('popout-3');
      expect(tauriClose).toHaveBeenCalledTimes(1);
      expect(target.close).not.toHaveBeenCalled();
    });

    it('falls back to the raw DOM close outside Tauri, where it is correct', async () => {
      vi.mocked(isTauri).mockReturnValue(false);
      const target = fakeWindow('popout-3');

      await closeDaughterWindow(target);

      expect(TauriWindow.getByLabel).not.toHaveBeenCalled();
      expect(target.close).toHaveBeenCalledTimes(1);
    });

    it('falls back to the raw DOM close if the window carries no Tauri label', async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      const target = fakeWindow(undefined);

      await closeDaughterWindow(target);

      expect(TauriWindow.getByLabel).not.toHaveBeenCalled();
      expect(target.close).toHaveBeenCalledTimes(1);
    });

    it('falls back to the raw DOM close if Tauri no longer knows that label', async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      vi.mocked(TauriWindow.getByLabel).mockResolvedValue(null);
      const target = fakeWindow('popout-already-gone');

      await closeDaughterWindow(target);

      expect(target.close).toHaveBeenCalledTimes(1);
    });

    it('falls back to the raw DOM close if the Tauri close call itself rejects — e.g. a missing capability', async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      const tauriClose = vi.fn().mockRejectedValue(new Error('core:window:allow-close'));
      vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ close: tauriClose } as never);
      const target = fakeWindow('popout-3');

      await closeDaughterWindow(target);

      expect(tauriClose).toHaveBeenCalledTimes(1);
      expect(target.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('focusDaughterWindow', () => {
    it('raises the native window via the Tauri window API, by label, when running under Tauri', async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      const tauriSetFocus = vi.fn();
      vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ setFocus: tauriSetFocus } as never);

      const target = fakeWindow('popout-3');
      await focusDaughterWindow(target);

      expect(TauriWindow.getByLabel).toHaveBeenCalledWith('popout-3');
      expect(tauriSetFocus).toHaveBeenCalledTimes(1);
      expect(target.focus).not.toHaveBeenCalled();
    });

    it('falls back to the raw DOM focus outside Tauri, where it is correct', async () => {
      vi.mocked(isTauri).mockReturnValue(false);
      const target = fakeWindow('popout-3');

      await focusDaughterWindow(target);

      expect(target.focus).toHaveBeenCalledTimes(1);
    });

    it('falls back to the raw DOM focus if the Tauri setFocus call itself rejects', async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      const tauriSetFocus = vi.fn().mockRejectedValue(new Error('core:window:allow-set-focus'));
      vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ setFocus: tauriSetFocus } as never);
      const target = fakeWindow('popout-3');

      await focusDaughterWindow(target);

      expect(target.focus).toHaveBeenCalledTimes(1);
    });
  });
});
