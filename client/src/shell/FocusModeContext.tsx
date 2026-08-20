/**
 * The one entry point into Focus Mode: showing a specific Dashboard
 * full-canvas, layout locked, chrome minimised (ticket 18).
 *
 * `DashboardPane`'s own "Focus Mode" action is the natural place to pick
 * *which* Dashboard — it is, after all, already showing the one meant — but
 * each Window's own shell (`AppShell.tsx`, `DaughterWindowShell.tsx`) is
 * what actually owns entering it, since Focus Mode is per-Window state
 * (issue 02). Each Window composes its own, independent
 * `FocusModeProvider`, so a Dashboard Pane calling `enter` is, by
 * construction, always in the same Window as the provider wrapping it — no
 * cross-window resolution is needed here at all. A context carries the
 * trigger down without widening `PaneProps`, which every other Pane kind
 * would otherwise have to ignore.
 *
 * Defaults to a no-op rather than throwing outside a real Provider, unlike
 * `SelectionContext`. A missing selection silently mis-describes what is
 * selected, which is worth catching loudly; a missing Focus Mode trigger
 * only makes one button inert, so every test harness that renders a
 * Dashboard Pane without caring about Focus Mode — most of them — needs no
 * boilerplate wrapper to stay green.
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

interface FocusModeContextValue {
  /**
   * Enters Focus Mode, showing the named Dashboard full-canvas in whichever
   * Window `paneId` — the calling Dashboard Pane's own instance id —
   * currently lives in.
   */
  readonly enter: (dashboardId: string, paneId: string) => void;
}

const noop = (): void => {};

const FocusModeContext = createContext<FocusModeContextValue>({ enter: noop });

export interface FocusModeProviderProps {
  readonly enter: (dashboardId: string, paneId: string) => void;
  readonly children: ReactNode;
}

export function FocusModeProvider({ enter, children }: FocusModeProviderProps): React.JSX.Element {
  const value = useMemo(() => ({ enter }), [enter]);
  return <FocusModeContext.Provider value={value}>{children}</FocusModeContext.Provider>;
}

export function useFocusMode(): FocusModeContextValue {
  return useContext(FocusModeContext);
}
