/**
 * The Main Window's own authority over which Daughter Windows exist, for a
 * given active Workspace — the seam `AppShell.tsx`'s launch restore, its
 * Workspace-switch/delete-active-fallback/Profile-change handlers, and
 * `.scratch/daughter-windows-native` issue 03's own `daughterWindows.length`
 * regression-check tests all sit on top of. Split out of `AppShell.tsx` so
 * this orchestration — pure sequencing of already-tested primitives, not a
 * live dockview instance — is independently unit-testable the same way
 * `useMoveToNewDaughterWindow.ts` already is: mock `daughterWindowNative.ts`
 * wholesale, drive the hook through `renderHook`.
 */

import { useCallback } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { closeDaughterWindow, restoreDaughterWindow, useDaughterWindows } from './daughterWindowNative';
import { useToast } from './ToastNotification';
import type { StoredDaughterWindow } from './workspaceStore';

export interface DaughterWindowLifecycle {
  /** The live, Rust-owned list of which Daughter Windows are actually open right now. */
  readonly openDaughterWindows: readonly string[];
  /**
   * Opens every Daughter Window a Workspace was saved with, at its saved
   * position and size — sequential, in the saved array's order, since
   * `restoreDaughterWindow`'s `restoreIndex` is that order and each restored
   * window's own `DaughterWindowShell` reads its saved content back out by
   * that same index. A window that genuinely fails to open (an OS-level
   * resource failure, surfaced through `restore_daughter_window`'s own
   * `Result`) is reported rather than silently dropped — the rest of the
   * list still opens. A no-op outside Tauri (dev-in-browser, every test),
   * matching every other Daughter Window operation in this module — nothing
   * here has a real `WebviewWindow` to open.
   */
  openWorkspaceDaughterWindows(daughterWindows: readonly StoredDaughterWindow[]): Promise<void>;
  /** Closes every currently-open Daughter Window — `openDaughterWindows` is the only authority on which those are. */
  closeAllDaughterWindows(): Promise<void>;
  /**
   * A Daughter Window belongs to the Workspace, not the Profile
   * (`CONTEXT.md`): switching Workspace, or deleting the active one, closes
   * the outgoing one's Daughter Windows and opens the incoming one's saved
   * list.
   */
  switchDaughterWindows(target: readonly StoredDaughterWindow[]): Promise<void>;
}

export function useDaughterWindowLifecycle(): DaughterWindowLifecycle {
  const openDaughterWindows = useDaughterWindows();
  const { showError } = useToast();

  const openWorkspaceDaughterWindows = useCallback(
    async (daughterWindows: readonly StoredDaughterWindow[]) => {
      if (!isTauri()) return;
      for (const [index, entry] of daughterWindows.entries()) {
        try {
          await restoreDaughterWindow(index, entry.bounds);
        } catch (error) {
          console.error('Failed to restore a Daughter Window.', error);
          showError('A Daughter Window could not be reopened.');
        }
      }
    },
    [showError]
  );

  const closeAllDaughterWindows = useCallback(async () => {
    await Promise.all(openDaughterWindows.map(label => closeDaughterWindow(label)));
  }, [openDaughterWindows]);

  const switchDaughterWindows = useCallback(
    async (target: readonly StoredDaughterWindow[]) => {
      await closeAllDaughterWindows();
      await openWorkspaceDaughterWindows(target);
    },
    [closeAllDaughterWindows, openWorkspaceDaughterWindows]
  );

  return { openDaughterWindows, openWorkspaceDaughterWindows, closeAllDaughterWindows, switchDaughterWindows };
}
