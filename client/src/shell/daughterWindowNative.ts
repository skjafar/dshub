/**
 * Closing and focusing a Daughter Window's actual native OS window, not just
 * its webview content.
 *
 * Under Tauri, a Daughter Window is a full `WebviewWindow` (`lib.rs`'s
 * `on_new_window` builds one, not a bare WebView2 popup) with its own
 * native title bar and close/minimize/maximize controls — entirely separate
 * from whatever WebView2 itself does with a script-opened window's raw DOM
 * methods. Calling `Window.close()` — what dockview itself calls
 * internally, and what this falls back to outside Tauri — only reaches the
 * webview content: the adopted DOM tears down, but the native frame around
 * it does not, leaving the Daughter Window an empty white shell with no way
 * to close it but the OS window controls. `Window.focus()` is the same
 * category of risk for the opposite reason: nothing observably fails if it
 * only focuses *content* rather than raising the native frame, so a broken
 * "focus a Daughter Window" (spec.md, story 26) would fail silently rather
 * than visibly.
 *
 * Tauri injects `__TAURI_INTERNALS__` into every window it manages, popouts
 * included, even though `popout.html` carries no script of its own —
 * reading it off `target` (the *other* window) rather than this module's
 * own `window` is what recovers *that* window's label, since
 * `getCurrentWindow()` would otherwise always answer with the Main
 * Window's. `Window.getByLabel` and the actions themselves are gated by
 * Tauri capabilities (`src-tauri/capabilities/default.json`:
 * `core:window:allow-close`, `core:window:allow-set-focus`) — without
 * those, the call rejects and this falls back to the raw DOM method, the
 * same as it does outside Tauri entirely.
 */

import { isTauri } from '@tauri-apps/api/core';
import { Window as TauriWindow } from '@tauri-apps/api/window';

interface TauriWindowGlobal {
  readonly __TAURI_INTERNALS__?: {
    readonly metadata?: {
      readonly currentWindow?: {
        readonly label?: string;
      };
    };
  };
}

async function resolveTauriWindow(target: Window): Promise<TauriWindow | null> {
  if (!isTauri()) return null;
  const label = (target as unknown as TauriWindowGlobal).__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
  if (label === undefined) return null;
  try {
    return await TauriWindow.getByLabel(label);
  } catch (error) {
    console.error(`Failed to resolve the Tauri window for label "${label}".`, error);
    return null;
  }
}

export async function closeDaughterWindow(target: Window): Promise<void> {
  const tauriWindow = await resolveTauriWindow(target);
  if (tauriWindow) {
    try {
      await tauriWindow.close();
      return;
    } catch (error) {
      console.error('Failed to close a Daughter Window through the Tauri window API.', error);
    }
  }
  target.close();
}

export async function focusDaughterWindow(target: Window): Promise<void> {
  const tauriWindow = await resolveTauriWindow(target);
  if (tauriWindow) {
    try {
      await tauriWindow.setFocus();
      return;
    } catch (error) {
      console.error('Failed to focus a Daughter Window through the Tauri window API.', error);
    }
  }
  target.focus();
}
