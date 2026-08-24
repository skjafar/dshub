import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type { DockviewApi } from 'dockview';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Button, Dialog, TooltipProvider } from '../ui';
import { useBackendPort } from '../contexts/BackendPortContext';
import { useSettings } from '../contexts/SettingsContext';
import { DaughterWindowChrome } from './DaughterWindowChrome';
import {
  DAUGHTER_WINDOW_DEFAULT_HEIGHT,
  DAUGHTER_WINDOW_DEFAULT_WIDTH,
  customWindowNames,
  knownWindowIds,
  paneMenuEntries,
} from './daughterWindows';
import { closeDaughterWindow, readOwnWindowBounds, useDaughterWindows } from './daughterWindowNative';
import { FocusModeProvider } from './FocusModeContext';
import { FocusModeView } from './FocusModeView';
import { OpenPlotProvider } from './OpenPlotContext';
import { usePaneLocations } from './paneLocations';
import type { PlotPaneState } from './panes/PlotPane';
import { SelectionProvider, useSelection } from './SelectionContext';
import { Workspace } from './Workspace';
import { PANES, isKnownPaneKind, paneDefinition, paneId } from './paneRegistry';
import type { PaneKind } from './paneRegistry';
import { restorePaneState, retainPaneState, snapshotPaneStates, subscribePaneStateChanges } from './paneState';
import type { PlottableSpace } from './plotStream';
import { retainSeriesFor } from './plotStream';
import type { MapEntry } from '../maps/mapParser';
import type { UserSettings } from '../types/settings';
import { useMoveToNewDaughterWindow } from './useMoveToNewDaughterWindow';
import { useMoveToWindow } from './useMoveToWindow';
import {
  activeWorkspaceOf,
  restoreDaughterWindowContent,
  sanitizeProfileWorkspaces,
  updateWorkspaceDaughterWindows,
  upsertDaughterWindow,
  withoutDaughterWindow,
} from './workspaceStore';
import type { DaughterWindowBounds, ProfileWorkspaces, StoredDaughterWindow, StoredWorkspace } from './workspaceStore';
import styles from './DaughterWindowShell.module.css';

/**
 * The active Profile's own Workspace collection and its currently-active
 * Workspace record, resolved from a raw settings value in one step — the
 * same read/sanitize/locate dance `updateOwnEntry`, `handleReady`'s own
 * restore step and `customNames` below all need. A plain function over
 * `settings` rather than a hook, so each of those three call sites can pass
 * whichever source it already has: the live, reactive `settings` value
 * (`customNames`, which should re-derive whenever it changes), or
 * `settingsRef.current` (`updateOwnEntry`/`handleReady`, which read fresh
 * state from inside a callback without depending on a value that would
 * force it to be re-created every render).
 */
function activeWorkspaceEntryFor(
  settings: UserSettings
): { readonly collection: ProfileWorkspaces; readonly workspace: StoredWorkspace } | undefined {
  const stored = settings.workspacesByProfile[settings.activeMapProfileId];
  const collection = stored === undefined ? undefined : sanitizeProfileWorkspaces(stored);
  const workspace = collection && activeWorkspaceOf(collection);
  return collection && workspace ? { collection, workspace } : undefined;
}

/** How long a burst of layout or Pane-state changes settles before this Window's own entry is saved — mirrors `AppShell.tsx`'s own `AUTOSAVE_DEBOUNCE_MS`. */
const AUTOSAVE_DEBOUNCE_MS = 400;

/**
 * A genuinely separate `WebviewWindow`'s own top-level shell
 * (`.scratch/daughter-windows-native` issue 02) — its own React tree, its
 * own dockview instance, not dockview's own adopted-DOM popout (ADR 0004,
 * superseded by ADR 0005). Reads what it opens with from
 * `window.location.search`, set by `src-tauri/src/daughter_windows.rs`: a
 * freshly-created window carries `?pane=<kind>` (one Pane, "Move to new
 * window"), a window being restored at launch carries `?restore=<index>`
 * (this Workspace's saved `daughterWindows[index]`, read back out of the
 * shared Settings blob rather than carried in the URL itself — issue 03).
 * Otherwise behaves like a small, single-purpose Workspace: an "add a Pane"
 * control, Device link/Control state read-only, and nothing else (spec.md)
 * — Connect/Control/Workspace/Profile/Settings stay exclusive to the Main
 * Window (`AppShell.tsx`).
 *
 * Keeps its own entry in the active Workspace's `daughterWindows` list
 * current — debounced on layout or Pane-state change, flushed on unload —
 * the same shape as `AppShell.tsx`'s own autosave, scoped to just this one
 * window's content plus its own position and size.
 */
function initialPaneKind(): PaneKind | null {
  const raw = new URLSearchParams(window.location.search).get('pane');
  return raw !== null && isKnownPaneKind(raw) ? raw : null;
}

/**
 * The dragged Pane's own state (issue 07), carried on this window's own URL
 * by `openDaughterWindowAt` — `URLSearchParams` has already percent-decoded
 * it by the time `.get` returns, so only `JSON.parse` is left to do. Absent
 * for a window opened via the plain "Move to new window" menu command
 * (`openDaughterWindow`, no `paneState` query param at all), which still
 * opens empty by design (ADR 0005).
 */
function initialPaneState(): unknown {
  const raw = new URLSearchParams(window.location.search).get('paneState');
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Failed to parse this Window's seeded Pane state from its own URL.", error);
    return undefined;
  }
}

/** The array position this window is restoring from, if any — see `upsertDaughterWindow`'s own doc comment for why a freshly-minted label can't be used for this one, first correlation instead. */
function initialRestoreIndex(): number | null {
  const raw = new URLSearchParams(window.location.search).get('restore');
  if (raw === null) return null;
  const index = Number.parseInt(raw, 10);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function DaughterWindowShellInner(): React.JSX.Element {
  const apiRef = useRef<DockviewApi | null>(null);
  const [openPaneIds, setOpenPaneIds] = useState<readonly string[]>([]);
  const [focusDashboardId, setFocusDashboardId] = useState<string | null>(null);
  const { retainPanes } = useSelection();
  const { settings, updateSettings } = useSettings();
  const port = useBackendPort();
  const moveToNewWindow = useMoveToNewDaughterWindow(apiRef);

  const seed = useMemo(() => initialPaneKind(), []);
  const seedPaneState = useMemo(() => initialPaneState(), []);
  // Read once, at mount: which saved entry (if any) this window restores
  // from. Cleared after the first successful autosave write, since every
  // write after that finds its own entry by label instead (`upsertDaughterWindow`).
  const restoreIndexAtLaunch = useMemo(() => initialRestoreIndex(), []);
  const restoreIndexRef = useRef<number | null>(restoreIndexAtLaunch);

  /** This Window's own identity — for Focus Mode's plot-series ownership key
   *  below, and for `paneMenuEntries`' own cross-window singleton dedup
   *  (issue 04), which needs to tell this Window apart from every other one.
   *  This shell only ever mounts under real Tauri (`App.tsx`'s
   *  `isMainWindow()` routes everywhere else to `AppShell`), but the
   *  `isTauri()` guard is kept anyway, matching `windowRole.ts`'s own
   *  pattern, rather than assuming: a test rendering this component directly
   *  has no such guarantee. Also this window's own key into
   *  `daughterWindows`' `label` field, once it starts saving. */
  const windowId = useMemo(() => (isTauri() ? getCurrentWindow().label : 'daughter'), []);

  // The other currently-open Daughter Windows, for `paneMenuEntries`' own
  // numbering and for pruning a stale broadcast from one that has since
  // closed (`usePaneLocations`'s own `stillOpen`) — `useDaughterWindows`
  // reports every open Daughter Window including this one, unlike
  // `AppShell.tsx`'s own use of it for its "Daughter Windows" list, which
  // only ever needs *other* windows since the Main Window is never in that
  // list to begin with.
  const openDaughterWindows = useDaughterWindows();
  const stillOpenWindowIds = useMemo(() => knownWindowIds(openDaughterWindows), [openDaughterWindows]);
  const paneLocations = usePaneLocations(windowId, openPaneIds, stillOpenWindowIds);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /**
   * Every currently-open Daughter Window's own custom name, keyed by label
   * (`.scratch/daughter-windows-native` issue 07's own naming follow-up) —
   * read straight from the reactive `settings` value (not `settingsRef`),
   * so it recomputes not only on this Window's own writes but also on a
   * rename landing live from the Main Window via issue 06's own `storage`
   * event sync, with no new plumbing.
   */
  const customNames = useMemo(
    () => customWindowNames(activeWorkspaceEntryFor(settings)?.workspace.daughterWindows ?? []),
    [settings]
  );

  // Kept current by the `onMoved`/`onResized` subscription below rather than
  // read fresh (async, IPC-backed) at the moment autosave actually flushes —
  // that would make `flushAutosave` itself async, and a `beforeunload`
  // handler that only *starts* async work is not guaranteed to finish before
  // the page actually unloads. Reading this ref instead keeps the flush
  // synchronous, the same guarantee `AppShell.tsx`'s own autosave already has.
  const boundsRef = useRef<DaughterWindowBounds>({
    x: 0,
    y: 0,
    width: DAUGHTER_WINDOW_DEFAULT_WIDTH,
    height: DAUGHTER_WINDOW_DEFAULT_HEIGHT,
  });

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingAutosave = useCallback(() => {
    if (autosaveTimer.current !== null) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
  }, []);

  /**
   * Reads the active Workspace's own Daughter Window list and, if `updater`
   * returns a different one, writes it back — the same read-transform-write
   * shape `AppShell.tsx`'s own `withProfileWorkspaces` uses, scoped to this
   * window's own `SettingsProvider` (a separate realm from the Main
   * Window's, sharing the same underlying storage — spec.md's "Settings,
   * Profiles and Workspaces are automatically shared again").
   */
  const updateOwnEntry = useCallback(
    (updater: (daughterWindows: readonly StoredDaughterWindow[]) => readonly StoredDaughterWindow[]) => {
      const currentSettings = settingsRef.current;
      const found = activeWorkspaceEntryFor(currentSettings);
      if (found === undefined) return;
      const { collection, workspace: target } = found;

      const nextDaughterWindows = updater(target.daughterWindows);
      if (nextDaughterWindows === target.daughterWindows) return;

      const nextCollection = updateWorkspaceDaughterWindows(collection, target.id, nextDaughterWindows);
      updateSettings({
        workspacesByProfile: { ...currentSettings.workspacesByProfile, [currentSettings.activeMapProfileId]: nextCollection },
      });
    },
    [updateSettings]
  );

  /**
   * Persists this Window's own dockLayout, Pane state and current bounds
   * (`boundsRef`) into the active Workspace's Daughter Window list.
   * Synchronous, so `beforeunload` below can rely on it actually completing
   * before the page unloads.
   *
   * Carries the existing entry's own `name` forward unchanged — this Window
   * has no opinion on its own custom name (only the Main Window's own
   * "Daughter Windows" list sets one), so building a fresh `entry` without
   * reading it first would silently erase a rename that landed between one
   * autosave tick and the next. Read from `daughterWindows` inside the
   * `updateOwnEntry` updater itself, not from `customNames` above, so this
   * always sees the array it is about to write over rather than whatever
   * `settings` last rendered with.
   */
  const flushAutosave = useCallback(() => {
    cancelPendingAutosave();
    const api = apiRef.current;
    if (!api) return;

    const ids = api.panels.map(panel => panel.id);
    const dockLayout = api.toJSON();
    const paneStates = snapshotPaneStates(ids);
    const bounds = boundsRef.current;

    updateOwnEntry(daughterWindows => {
      const restoreIndex = restoreIndexRef.current;
      const existing =
        restoreIndex !== null ? daughterWindows[restoreIndex] : daughterWindows.find(d => d.label === windowId);
      const entry: StoredDaughterWindow = { label: windowId, name: existing?.name ?? null, dockLayout, paneStates, bounds };
      return upsertDaughterWindow(daughterWindows, entry, restoreIndex);
    });
    restoreIndexRef.current = null;
  }, [cancelPendingAutosave, updateOwnEntry, windowId]);

  const scheduleAutosave = useCallback(() => {
    cancelPendingAutosave();
    autosaveTimer.current = setTimeout(flushAutosave, AUTOSAVE_DEBOUNCE_MS);
  }, [cancelPendingAutosave, flushAutosave]);

  // Keeps `boundsRef` current — moving or resizing this Window doesn't touch
  // dockview's own layout at all, so nothing else would ever notice or save
  // it. Reads the full bounds back out after each event rather than
  // converting the event's own payload directly: a move fires with only a
  // position and a resize with only a size, and `readOwnWindowBounds`
  // already has the one conversion this needs, so reusing it keeps this
  // window's own bounds internally consistent rather than merging two partial
  // updates by hand. Scheduling autosave here, not just refreshing the ref, is
  // what actually saves a bare move/resize — dockview's `onDidLayoutChange`
  // (below) has nothing to fire for one.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const win = getCurrentWindow();

    const refreshBounds = () => {
      void readOwnWindowBounds().then(bounds => {
        if (!cancelled) boundsRef.current = bounds;
      });
    };
    refreshBounds();

    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;
    void win.onMoved(() => {
      refreshBounds();
      scheduleAutosave();
    }).then(fn => {
      if (cancelled) fn();
      else unlistenMoved = fn;
    });
    void win.onResized(() => {
      refreshBounds();
      scheduleAutosave();
    }).then(fn => {
      if (cancelled) fn();
      else unlistenResized = fn;
    });

    return () => {
      cancelled = true;
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, [scheduleAutosave]);

  // Flush on unmount and on quit, so a debounced change is never lost — the
  // same precedent `AppShell.tsx`'s own autosave sets.
  useEffect(() => {
    window.addEventListener('beforeunload', flushAutosave);
    const unsubscribePaneState = subscribePaneStateChanges(scheduleAutosave);
    return () => {
      window.removeEventListener('beforeunload', flushAutosave);
      unsubscribePaneState();
      cancelPendingAutosave();
    };
  }, [flushAutosave, scheduleAutosave, cancelPendingAutosave]);

  const syncOpenPanes = useCallback(
    (api: DockviewApi) => {
      const ids = api.panels.map(panel => panel.id);
      // Fed to `usePaneLocations` above, broadcast to every other Window
      // (issue 04).
      setOpenPaneIds(ids);
      retainPaneState(ids);
      retainPanes(ids);
      retainSeriesFor(port, ids);
    },
    [retainPanes, port]
  );

  const openPane = useCallback((kind: PaneKind, paneState?: unknown) => {
    const api = apiRef.current;
    const definition = paneDefinition(kind);
    if (!api || !definition) return;

    if (definition.singleton) {
      // `paneState` arriving for a singleton already open here is a stale
      // or racing handoff — `moveTargets` (`useMoveToWindow.ts`) already
      // excludes a Window in this state from the sender's own menu, so
      // this is a defensive fallback, not the expected path.
      const existing = api.getPanel(paneId(kind));
      if (existing) {
        existing.api.setActive();
        return;
      }
      const id = paneId(kind);
      if (paneState !== undefined) restorePaneState(id, paneState);
      api.addPanel({ id, component: kind, title: definition.title });
      return;
    }

    // A Pane moved in from another Window gets a fresh instance number the
    // same way any other new Pane of this kind would — its numeric suffix
    // was never meaningful outside the Window it was minted in, and its tab
    // title needs no special handling either: every Pane kind that shows
    // one recomputes it from its own state on mount regardless
    // (`paneHandoff.ts`'s own doc comment).
    const taken = new Set(api.panels.map(panel => panel.id));
    let instance = 1;
    while (taken.has(paneId(kind, instance))) instance += 1;
    const id = paneId(kind, instance);
    if (paneState !== undefined) restorePaneState(id, paneState);
    api.addPanel({ id, component: kind, title: `${definition.title} ${instance}` });
  }, []);

  // `openPane` already takes `(kind, paneState?)` — exactly what
  // `useMoveToWindow` needs to open a Pane handed off from another Window —
  // so unlike `AppShell.tsx`'s own wider signature (position/width for its
  // default-layout seeding), no adapter is needed here.
  const moveToWindow = useMoveToWindow(apiRef, windowId, openDaughterWindows, paneLocations, openPane, customNames);

  /** `OpenPlotProvider`'s own implementation, mirroring `AppShell.tsx`'s own — right-click "Plot" on a Registers/System Registers row opens a fresh Plot Pane, in this Window, already carrying that one entry as its series. */
  const handleOpenPlot = useCallback(
    (entry: MapEntry, source: PlottableSpace) => {
      const { pollInterval, timeSpan } = settingsRef.current.plotDefaults;
      const seed: PlotPaneState = {
        series: [{ name: entry.name, source, address: entry.address, colorSlot: 0, visible: true }],
        pollInterval,
        timeSpan,
        pickerSource: source,
        pickerQuery: '',
      };
      openPane('plot', seed);
    },
    [openPane]
  );

  /**
   * A Daughter Window that loses its last Pane closes itself (spec.md) —
   * purely a local check against this window's own dockview instance,
   * unlike the Main Window's cross-window `closeEmptyPopouts` (which no
   * longer applies: nothing here has popouts of its own). This window's own
   * JS is still alive at this exact moment, unlike a native title-bar
   * close, so its entry is pruned here rather than left to reappear on the
   * next restore. Returns whether it closed, so callers that already know
   * `api.panels.length` can skip scheduling an autosave for a window about
   * to disappear anyway.
   */
  const closeIfEmpty = useCallback(
    (api: DockviewApi): boolean => {
      if (api.panels.length !== 0) return false;
      updateOwnEntry(daughterWindows => withoutDaughterWindow(daughterWindows, windowId));
      void closeDaughterWindow(windowId);
      return true;
    },
    [updateOwnEntry, windowId]
  );

  const handleReady = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api;

      // Registered before the initial seed/restore below, not after: dockview
      // fires this for that very first `addPanel`/`fromJSON` too, and a
      // freshly opened single-Pane window needs its own first autosave
      // scheduled from that same event — nothing else would ever trigger one
      // for a window the user opens and never touches again.
      api.onDidLayoutChange(() => {
        syncOpenPanes(api);
        if (closeIfEmpty(api)) return;
        scheduleAutosave();
      });

      if (restoreIndexAtLaunch !== null) {
        const entry = activeWorkspaceEntryFor(settingsRef.current)?.workspace.daughterWindows[restoreIndexAtLaunch];
        if (entry !== undefined) {
          try {
            restoreDaughterWindowContent(api, entry);
          } catch (error) {
            console.error("Failed to restore this Daughter Window's own content.", error);
          }
        }
        // No matching saved entry: this window opens empty. Nothing changed,
        // so dockview never fires the listener above on its own — checked
        // explicitly below instead, so it still closes rather than lingering.
      } else if (seed !== null) {
        openPane(seed, seedPaneState);
      }
      syncOpenPanes(api);
      closeIfEmpty(api);

      // Dragging a Pane's tab outside every open Window's bounds creates a
      // new Daughter Window there (issue 07) — works from a Daughter
      // Window's own tabs too, the same way "Move to new window" already
      // does (`useMoveToNewDaughterWindow.ts` is shared by both shells).
      moveToNewWindow.attachDragOutListener(api);
    },
    [restoreIndexAtLaunch, seed, seedPaneState, openPane, syncOpenPanes, closeIfEmpty, scheduleAutosave, moveToNewWindow]
  );

  const handleOpenPane = useCallback((kind: PaneKind) => openPane(kind), [openPane]);

  const handleTabContextMenuItems: NonNullable<ComponentProps<typeof Workspace>['getTabContextMenuItems']> =
    useCallback(
      ({ panel }) => {
        const targets = moveToWindow.targetsFor(panel);
        return [
          'close',
          'closeOthers',
          'closeAll',
          'separator',
          { label: 'Move to new window', action: () => moveToNewWindow.requestMove(panel) },
          // Only present when another Window is actually open to move into —
          // see `AppShell.tsx`'s own identical comment on why this is flat
          // entries rather than a nested submenu.
          ...(targets.length > 0
            ? [
                'separator' as const,
                ...targets.map(target => ({
                  label: `Move to ${target.label}`,
                  action: () => moveToWindow.requestMove(panel, target.windowId),
                })),
              ]
            : []),
        ];
      },
      [moveToNewWindow, moveToWindow]
    );

  const enterFocusMode = useCallback((dashboardId: string) => {
    setFocusDashboardId(dashboardId);
  }, []);

  const exitFocusMode = useCallback(() => setFocusDashboardId(null), []);

  return (
    <OpenPlotProvider openPlot={handleOpenPlot}>
      <FocusModeProvider enter={enterFocusMode}>
        <div className={styles.shell}>
          {focusDashboardId !== null ? (
            <FocusModeView dashboardId={focusDashboardId} windowId={windowId} onExit={exitFocusMode} />
          ) : (
            <DaughterWindowChrome
              entries={paneMenuEntries(PANES, paneLocations, windowId, openDaughterWindows, customNames)}
              onOpenPane={handleOpenPane}
            />
          )}
          {/* Always mounted, hidden rather than unmounted during Focus Mode —
              same reasoning as `AppShell.tsx`'s own `workspaceHost`, just for
              this Window's own arrangement rather than a shared instance
              other Windows depend on: unmounting would rebuild this Window's
              dockview from scratch on exit, losing whatever the user had
              added beyond the one seeded Pane. */}
          <div className={styles.workspaceHost} hidden={focusDashboardId !== null}>
            <Workspace onReady={handleReady} getTabContextMenuItems={handleTabContextMenuItems} />
          </div>
        </div>

        <Dialog
          open={moveToNewWindow.pendingPanel !== null}
          onOpenChange={open => {
            if (!open) moveToNewWindow.cancel();
          }}
          title="Open another Daughter Window?"
          description="You already have several Daughter Windows open."
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={moveToNewWindow.cancel}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={moveToNewWindow.confirm}>
                Open window
              </Button>
            </>
          }
        >
          <p>Each one keeps arranging and polling — this is a soft limit, not a hard one, if your bench genuinely needs it.</p>
        </Dialog>
      </FocusModeProvider>
    </OpenPlotProvider>
  );
}

export function DaughterWindowShell(): React.JSX.Element {
  return (
    <TooltipProvider>
      <SelectionProvider>
        <DaughterWindowShellInner />
      </SelectionProvider>
    </TooltipProvider>
  );
}
