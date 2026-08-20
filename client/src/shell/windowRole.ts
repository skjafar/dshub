/**
 * Whether the calling code is running in the Main Window or a Daughter
 * Window (`.scratch/daughter-windows-native` issue 02).
 *
 * `getCurrentWindow()` resolves correctly per-realm now that a Daughter
 * Window is a genuinely separate `WebviewWindow` rather than adopted DOM
 * sharing the Main Window's own JS realm (ADR 0004) — confirmed by issue
 * 01's spike (`spike/DaughterWindowSpike.tsx`). Outside Tauri entirely
 * (dev-in-browser, every test) there is no concept of a Daughter Window at
 * all, so this always reads as the Main Window there.
 */

import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** The Tauri window label `tauri.conf.json` declares for the Main Window. */
export const MAIN_TAURI_WINDOW_LABEL = 'main';

export function isMainWindow(): boolean {
  if (!isTauri()) return true;
  return getCurrentWindow().label === MAIN_TAURI_WINDOW_LABEL;
}
