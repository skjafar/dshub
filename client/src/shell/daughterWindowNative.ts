/**
 * Everything a Daughter Window's lifecycle needs from Tauri directly, rather
 * than through `services/backendPort.ts` — window management is not a
 * device operation or a host file write, the two concerns that seam
 * actually exists for.
 *
 * Opening, listing and closing all talk to the real OS window Rust owns
 * (`src-tauri/src/daughter_windows.rs`, `.scratch/daughter-windows-native`
 * issue 02): a Daughter Window is a genuine `WebviewWindow`, not dockview's
 * own adopted-DOM popout (ADR 0004, superseded by ADR 0005), so closing and
 * focusing one calls Tauri's own window API directly rather than the raw
 * DOM `Window.close()`/`Window.focus()` dockview itself used to call —
 * those only reach the webview's *content*, leaving the native frame
 * around it open and blank, or (for focus) failing silently rather than
 * visibly. `core:window:allow-close`/`core:window:allow-set-focus` gate
 * those two calls; outside Tauri (dev-in-browser, every test) there is no
 * concept of a Daughter Window at all, so `close`/`focus`/`list`/`subscribe`
 * are all safe no-ops. `openDaughterWindow` is the one exception: it calls
 * `invoke` directly and unguarded, so outside Tauri it rejects like any
 * other `invoke` would — its one caller (`useMoveToNewDaughterWindow.ts`)
 * already catches that, and a rejection is the honest outcome for "open a
 * new OS window" where a no-op has no sensible label to resolve with.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { getCurrentWindow, Window as TauriWindow } from '@tauri-apps/api/window';
import type { WindowBounds } from './daughterWindows';
import type { WindowId } from './focusMode';
import type { DaughterWindowBounds } from './workspaceStore';

/** Mirrors `daughter_windows.rs`'s `CHANGED_EVENT` constant. */
const DAUGHTER_WINDOWS_CHANGED_EVENT = 'daughter-windows-changed';

/** Opens a genuinely separate `WebviewWindow` showing one Pane of `paneKind`. Resolves with its Tauri label. */
export async function openDaughterWindow(paneKind: string): Promise<string> {
  return invoke<string>('open_daughter_window', { paneKind });
}

/**
 * Restores a genuinely separate `WebviewWindow` at a saved position and
 * size, for the entry at `restoreIndex` of the active Workspace's saved
 * `daughterWindows` list (`.scratch/daughter-windows-native` issue 03).
 * Resolves with its newly-minted Tauri label — never the label the entry was
 * saved under, since every launch remints labels from `daughter-1`
 * regardless of a previous session's history (`daughter_windows.rs`).
 */
export async function restoreDaughterWindow(restoreIndex: number, bounds: DaughterWindowBounds): Promise<string> {
  return invoke<string>('restore_daughter_window', { restoreIndex, bounds });
}

/**
 * This window's own current position and size, converted to the logical
 * pixels `restore_daughter_window`'s `WebviewWindowBuilder::position`/
 * `inner_size` calls expect (confirmed at the `tauri` crate source level) —
 * `@tauri-apps/api/window` itself only reports physical pixels.
 */
export async function readOwnWindowBounds(): Promise<DaughterWindowBounds> {
  const win = getCurrentWindow();
  const [position, size, scaleFactor] = await Promise.all([win.outerPosition(), win.innerSize(), win.scaleFactor()]);
  const logicalPosition = position.toLogical(scaleFactor);
  const logicalSize = size.toLogical(scaleFactor);
  return { x: logicalPosition.x, y: logicalPosition.y, width: logicalSize.width, height: logicalSize.height };
}

/**
 * Opens a genuinely separate `WebviewWindow` for one Pane dragged out of an
 * already-open Window (`.scratch/daughter-windows-native` issue 07), at an
 * explicit position and size rather than the OS's own default placement —
 * `openDaughterWindow`'s own "Move to new window" menu command has no drop
 * point of its own to anchor on, so it stays the simpler call.
 *
 * `paneState` — whatever `paneState.ts`'s `snapshotPaneStates` held for the
 * dragged panel, opaque here the same way it is to that module itself —
 * travels JSON-serialized and percent-encoded on the new window's own URL
 * rather than through `paneHandoff.ts`'s live broadcast: that mechanism
 * assumes its target is already open and already listening (its own doc
 * comment), which a window this call is still in the middle of creating is
 * not. `undefined` (no state to carry) is sent through as `null` — a bare
 * `undefined` does not survive a Tauri `invoke` call's own JSON encoding.
 */
export async function openDaughterWindowAt(
  paneKind: string,
  bounds: DaughterWindowBounds,
  paneState: unknown
): Promise<string> {
  const encodedState = paneState === undefined ? null : encodeURIComponent(JSON.stringify(paneState));
  return invoke<string>('open_daughter_window_at', { paneKind, bounds, paneState: encodedState });
}

/**
 * The outer screen bounds (window frame included, not just its content area
 * — the unit a drag's own release point needs to be tested against) of
 * every Window in `windowIds`, in logical pixels — issue 07's own drag-out
 * hit test, `daughterWindows.ts`'s `dragOutTarget`. Resolved by label, one
 * Window at a time: no realm has live access to another's DOM to read this
 * directly (ADR 0005). A Window that fails to resolve — closed in the
 * moment between the drag ending and this call landing — is silently
 * omitted rather than failing the whole batch; a drag ending near a Window
 * that no longer exists should be treated as ending on the desktop, not as
 * an error.
 */
export async function readWindowBounds(windowIds: readonly WindowId[]): Promise<readonly WindowBounds[]> {
  const results = await Promise.all(
    windowIds.map(async (id): Promise<WindowBounds | null> => {
      const win = await resolveByLabel(id);
      if (!win) return null;
      try {
        const [position, size, scaleFactor] = await Promise.all([win.outerPosition(), win.outerSize(), win.scaleFactor()]);
        const logicalPosition = position.toLogical(scaleFactor);
        const logicalSize = size.toLogical(scaleFactor);
        return { left: logicalPosition.x, top: logicalPosition.y, width: logicalSize.width, height: logicalSize.height };
      } catch (error) {
        console.error(`Failed to read bounds for the Tauri window labelled "${id}".`, error);
        return null;
      }
    })
  );
  return results.filter((bounds): bounds is WindowBounds => bounds !== null);
}

/** The currently-open Daughter Window labels — a one-time read, not a live subscription. */
export async function listDaughterWindows(): Promise<readonly string[]> {
  if (!isTauri()) return [];
  return invoke<string[]>('list_daughter_windows');
}

/**
 * Live updates to the open Daughter Window list. Returns an unsubscribe
 * function, safe to call even if the underlying (asynchronous) `listen`
 * registration hasn't resolved yet — mirrors `hooks/useAutoRefresh.ts`'s own
 * cancelled-flag guard against the same async-subscribe-vs-sync-cleanup race.
 */
export function subscribeDaughterWindows(onChange: (labels: readonly string[]) => void): () => void {
  if (!isTauri()) return () => {};

  let cancelled = false;
  let unlisten: (() => void) | null = null;
  void listen<string[]>(DAUGHTER_WINDOWS_CHANGED_EVENT, event => onChange(event.payload)).then(fn => {
    if (cancelled) {
      fn();
      return;
    }
    unlisten = fn;
  });

  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/**
 * The live Daughter Window list, for the Main Window's own list UI and the
 * 5th-window warning (`daughterWindows.ts`'s `shouldWarnBeforeNewDaughterWindow`)
 * — shared by `AppShell.tsx` and `DaughterWindowShell.tsx`, since "Move to
 * new window" works from either.
 *
 * The `listen` subscription is registered *before* the initial
 * `listDaughterWindows()` read, and the read's result is discarded if a
 * broadcast already landed first — otherwise a slow-resolving initial read
 * could clobber fresher state from a broadcast that arrived while it was
 * still in flight.
 */
export function useDaughterWindows(): readonly string[] {
  const [labels, setLabels] = useState<readonly string[]>([]);

  useEffect(() => {
    let receivedBroadcast = false;
    const unsubscribe = subscribeDaughterWindows(next => {
      receivedBroadcast = true;
      setLabels(next);
    });
    void listDaughterWindows().then(initial => {
      if (!receivedBroadcast) setLabels(initial);
    });
    return unsubscribe;
  }, []);

  return labels;
}

async function resolveByLabel(label: string): Promise<TauriWindow | null> {
  if (!isTauri()) return null;
  try {
    return await TauriWindow.getByLabel(label);
  } catch (error) {
    console.error(`Failed to resolve the Tauri window labelled "${label}".`, error);
    return null;
  }
}

export async function closeDaughterWindow(label: string): Promise<void> {
  const window = await resolveByLabel(label);
  if (!window) return;
  try {
    await window.close();
  } catch (error) {
    console.error('Failed to close a Daughter Window through the Tauri window API.', error);
  }
}

export async function focusDaughterWindow(label: string): Promise<void> {
  const window = await resolveByLabel(label);
  if (!window) return;
  try {
    await window.setFocus();
  } catch (error) {
    console.error('Failed to focus a Daughter Window through the Tauri window API.', error);
  }
}
