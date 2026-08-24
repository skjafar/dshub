/**
 * The one entry point a Registers/System Registers Pane uses to open a new
 * Plot Pane prepopulated with one of its own entries (right-click "Plot" on
 * a row, `Entries.tsx`).
 *
 * A context carries the trigger down without widening `PaneProps` — the same
 * reasoning `FocusModeContext` already gives for its own `enter`. Each
 * Window's own shell (`AppShell.tsx`, `DaughterWindowShell.tsx`) is what
 * actually owns opening a Pane onto its own dockview instance, so a Pane
 * calling this is, by construction, always opening the new Plot Pane into
 * the same Window it is itself docked in.
 *
 * Defaults to a no-op rather than throwing outside a real Provider, matching
 * `FocusModeContext`'s own default: a missing trigger only makes the menu
 * item inert, so a test harness that renders an Address Space Pane without
 * caring about plotting needs no boilerplate wrapper to stay green.
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { MapEntry } from '../maps/mapParser';
import type { PlottableSpace } from './plotStream';

interface OpenPlotContextValue {
  /** Opens a new Plot Pane in this Window, with `entry` as its one series. */
  readonly openPlot: (entry: MapEntry, source: PlottableSpace) => void;
}

const noop = (): void => {};

const OpenPlotContext = createContext<OpenPlotContextValue>({ openPlot: noop });

export interface OpenPlotProviderProps {
  readonly openPlot: (entry: MapEntry, source: PlottableSpace) => void;
  readonly children: ReactNode;
}

export function OpenPlotProvider({ openPlot, children }: OpenPlotProviderProps): React.JSX.Element {
  const value = useMemo(() => ({ openPlot }), [openPlot]);
  return <OpenPlotContext.Provider value={value}>{children}</OpenPlotContext.Provider>;
}

export function useOpenPlot(): OpenPlotContextValue {
  return useContext(OpenPlotContext);
}
