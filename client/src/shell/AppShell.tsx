import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type { AddPanelPositionOptions, DockviewApi } from 'dockview';
import { Button, Dialog, TooltipProvider } from '../ui';
import { useBackendPort } from '../contexts/BackendPortContext';
import { useSettings } from '../contexts/SettingsContext';
import type { MapEntry } from '../maps/mapParser';
import { AppChrome } from './AppChrome';
import { entriesBySpaceForProfile } from './bindingBackfill';
import { snapshotFromEntry } from './bindingIdentity';
import { BindingReviewDialog } from './BindingReviewDialog';
import type { BindingFix } from './bindingReviewApplier';
import { applyBindingFixes } from './bindingReviewApplier';
import { bindingsNeedingReview } from './bindingScanner';
import { closeDaughterWindow, focusDaughterWindow } from './daughterWindowNative';
import { customWindowNames, knownWindowIds, paneMenuEntries, windowLabel } from './daughterWindows';
import { useDaughterWindowLifecycle } from './useDaughterWindowLifecycle';
import { FocusModeProvider } from './FocusModeContext';
import { FocusModeView } from './FocusModeView';
import { MAIN_WINDOW_ID } from './focusMode';
import { OpenPlotProvider } from './OpenPlotContext';
import { usePaneLocations } from './paneLocations';
import { subscribeMapEdited, useMapEntries } from './useMapEntries';
import type { PlotPaneState } from './panes/PlotPane';
import { SelectionProvider, useSelection } from './SelectionContext';
import { Workspace } from './Workspace';
import { PANES, paneDefinition, paneId } from './paneRegistry';
import type { PaneKind } from './paneRegistry';
import { restorePaneState, retainPaneState, snapshotPaneStates, subscribePaneStateChanges } from './paneState';
import type { PlottableSpace } from './plotStream';
import { retainSeriesFor } from './plotStream';
import { useMoveToNewDaughterWindow } from './useMoveToNewDaughterWindow';
import { useMoveToWindow } from './useMoveToWindow';
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  activeWorkspaceOf,
  addWorkspace,
  createWorkspaceId,
  removeWorkspace,
  renameDaughterWindow,
  renameWorkspace,
  restoreWorkspace,
  sanitizeProfileWorkspaces,
  seedProfileWorkspaces,
  setActiveWorkspace,
  snapshotWorkspace,
  updateWorkspaceContent,
  updateWorkspaceDaughterWindows,
  withoutDaughterWindow,
  withoutWorkspace,
} from './workspaceStore';
import type { ProfileWorkspaces, StoredWorkspace } from './workspaceStore';
import styles from './AppShell.module.css';

/** How long a burst of layout or Pane-state changes settles before it is saved. */
const AUTOSAVE_DEBOUNCE_MS = 400;

/** One Pane of the arrangement a session opens into before anyone has rearranged anything. */
interface DefaultPane {
  readonly kind: PaneKind;
  /** Where it goes relative to the Pane opened before it. */
  readonly direction?: 'right' | 'below';
  readonly initialWidth?: number;
}

/**
 * The arrangement built the first time a Profile has no saved Workspace yet.
 *
 * Three Panes side by side rather than three tabs, because seeing two surfaces
 * at once is the entire reason the sidebar was replaced — an arrangement that
 * opens stacked would demonstrate none of it. The Inspector is narrow: it reads
 * one entry, and giving it an even third would take that width from the table it
 * is describing. Once built, this arrangement is itself saved as the Profile's
 * default Workspace, so every launch after the first restores a Workspace
 * rather than rebuilding this list.
 */
const INSPECTOR_WIDTH = 340;
const REGISTER_WIDTH = 620;

const DEFAULT_LAYOUT: readonly DefaultPane[] = [
  { kind: 'overview' },
  // A new Pane's width comes out of the Pane it is placed against, so the
  // Register Pane has to be opened wide enough to still have its own width left
  // after the Inspector takes a share of it. Asking for 620 directly leaves 280,
  // which is narrow enough to push the value column out of sight — the one
  // column the Pane exists to show.
  { kind: 'register', direction: 'right', initialWidth: REGISTER_WIDTH + INSPECTOR_WIDTH },
  { kind: 'inspector', direction: 'right', initialWidth: INSPECTOR_WIDTH },
];

/**
 * The application shell: chrome above, Workspace below.
 *
 * The shell owns which Panes are open — not the Workspace — because opening a
 * Pane and reopening a closed one have to be the same operation. Two paths for
 * that is how you end up with a Pane that can be closed and never recovered.
 *
 * It also owns which named Workspace is on screen and keeps it saved. A
 * Workspace is dockview's serialized layout plus each Pane's own state
 * (ADR-0001) plus whatever the shared Inspector was following — see
 * `workspaceStore.ts` for the shape and the corruption-handling contract.
 *
 * It is also where "Move to new window" and the 5th-window warning are
 * wired for the Main Window's own tabs (`useMoveToNewDaughterWindow.ts`,
 * shared with `DaughterWindowShell.tsx`) — but owns nothing else about
 * Daughter Windows themselves. Each is a genuinely separate `WebviewWindow`
 * with its own React tree and dockview instance (ADR 0005); this component
 * only reads the live, Rust-owned list of which ones are open
 * (`useDaughterWindows`) for its own "Daughter Windows" list UI. It is,
 * however, the one place a Daughter Window can be *renamed*
 * (`handleRenameDaughterWindow`) — a Daughter Window's own chrome stays as
 * minimal as spec.md already requires, so naming one is a Main-Window-only
 * action written into the active Workspace's own `daughterWindows` entry,
 * the same field `windowLabel` (`daughterWindows.ts`) already reads first,
 * ahead of auto-deriving a label from what that Window currently has open.
 */
function WorkspaceShell(): React.JSX.Element {
  const apiRef = useRef<DockviewApi | null>(null);
  const [openPaneIds, setOpenPaneIds] = useState<readonly string[]>([]);
  const { openDaughterWindows, openWorkspaceDaughterWindows, closeAllDaughterWindows, switchDaughterWindows } =
    useDaughterWindowLifecycle();
  const stillOpenWindowIds = useMemo(() => knownWindowIds(openDaughterWindows), [openDaughterWindows]);
  const paneLocations = usePaneLocations(MAIN_WINDOW_ID, openPaneIds, stillOpenWindowIds);
  const moveToNewWindow = useMoveToNewDaughterWindow(apiRef);
  // Which Dashboard, if any, the Main Window is showing full-canvas. A
  // single value rather than the `Record<WindowId, string>` this used to be
  // (issue 02) — every Daughter Window now composes its own, independent
  // `FocusModeProvider`/`FocusModeView` (`DaughterWindowShell.tsx`), so this
  // Window's own Focus Mode state never needs to resolve which Window a
  // Dashboard Pane lives in at all: a Dashboard Pane rendering here is, by
  // construction, always in the Main Window. `<Workspace>` stays mounted
  // regardless of Focus Mode — hiding the dock rather than unmounting it is
  // the whole point, since unmounting it would destroy this Window's
  // in-session state.
  const [mainFocusDashboardId, setMainFocusDashboardId] = useState<string | null>(null);

  const { selection, select, retainPanes } = useSelection();
  const { settings, updateSettings } = useSettings();
  const port = useBackendPort();

  // Latest settings/selection, readable from callbacks that outlive the render
  // that created them: dockview's own event handlers and the debounced
  // autosave are registered once and must not close over a stale value.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const profileId = settings.activeMapProfileId;
  const profileIdRef = useRef(profileId);
  profileIdRef.current = profileId;

  const collection: ProfileWorkspaces | undefined = settings.workspacesByProfile[profileId];

  /**
   * Every currently-open Daughter Window's own custom name, keyed by label
   * — a Workspace's own `daughterWindows` entries already carry `name`
   * (`workspaceStore.ts`), so this is just the lookup `windowLabel` needs,
   * re-derived whenever the active Workspace's own Daughter Window list
   * changes (including a rename landing from a `storage` event fired by
   * another open Window — issue 06's own live-sync mechanism, reused here
   * with no new plumbing).
   */
  const customNames = useMemo(() => {
    const target = collection && activeWorkspaceOf(collection);
    return customWindowNames(target?.daughterWindows ?? []);
  }, [collection]);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingAutosave = useCallback(() => {
    if (autosaveTimer.current !== null) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
  }, []);

  /**
   * Reads the active Profile's Workspace collection and, if `updater` returns
   * a different one, writes it back.
   *
   * Every Workspace mutation below is this same shape — look the collection
   * up, do nothing if there is none yet, transform it, splice the result into
   * `workspacesByProfile` — so this is the one place that shape is written
   * rather than at every call site. `updater` may perform its own side effects
   * (restoring the live dock api, say) before returning; it runs synchronously
   * and exactly once, so there is no ordering hazard in doing so.
   */
  const withProfileWorkspaces = useCallback(
    (updater: (collection: ProfileWorkspaces) => ProfileWorkspaces | undefined): void => {
      const currentProfileId = profileIdRef.current;
      const collection = settingsRef.current.workspacesByProfile[currentProfileId];
      if (collection === undefined) return;
      const next = updater(collection);
      if (next === undefined || next === collection) return;
      updateSettings({
        workspacesByProfile: { ...settingsRef.current.workspacesByProfile, [currentProfileId]: next },
      });
    },
    [updateSettings]
  );

  // ── Map-edit drift review (`.scratch/map-binding-drift`) ─────────────────
  //
  // A Map Editor save reaches every open Window's `mapManager` and settings
  // the same way any other edit does; this is specifically the "did that
  // edit put anything into question" half (ticket 07) plus the persistent
  // indicator (ticket 08), both Main-Window-only by construction —
  // `subscribeMapEdited` fires once per process, in whichever Window's own
  // realm the save happened in, and the Map Editor Pane is a singleton that
  // in practice lives here. See `BindingReviewDialog.tsx`'s own doc comment
  // for why a Daughter-Window-hosted save not opening this dialog directly
  // is an accepted, narrow gap rather than a correctness one — ticket 03's
  // live status still holds regardless of which Window edited the Map, and
  // this Window's own indicator still surfaces the same items once its next
  // scan runs.
  const registerMap = useMapEntries('register');
  const parameterMap = useMapEntries('parameter');
  const sysRegisterMap = useMapEntries('sysRegister');
  const activeEntriesBySpace = useMemo(
    () => ({ register: registerMap.entries, parameter: parameterMap.entries, sysRegister: sysRegisterMap.entries }),
    [registerMap.entries, parameterMap.entries, sysRegisterMap.entries]
  );
  const activeDashboards = settings.dashboardsByProfile[profileId];
  /**
   * A fresh scan, not a stale snapshot carried over from the last save
   * (ticket 08's own requirement) — recomputed from live settings and the
   * live Map on every relevant change, which is what both the persistent
   * indicator's own count and the dialog's own content read from.
   */
  const liveReviewItems = useMemo(
    () => bindingsNeedingReview(activeDashboards, collection, activeEntriesBySpace),
    [activeDashboards, collection, activeEntriesBySpace]
  );
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(
    () =>
      subscribeMapEdited(profile => {
        // Only the active Profile's own Map Editor can produce a save at
        // all, but this guards against a future caller of `announceMapEdited`
        // for a Profile that is not (or no longer) the active one.
        if (profile.id !== profileIdRef.current) return;
        const dashboards = settingsRef.current.dashboardsByProfile[profile.id];
        const workspaces = settingsRef.current.workspacesByProfile[profile.id];
        // Computed fresh from the just-saved `profile` argument itself,
        // deliberately not read from `liveReviewItems` above: this listener
        // fires before `useMapEntries`'s own `announce()` (see
        // `useMapEntries.ts`'s `announceMapEdited`), so the reactive memo
        // has not necessarily caught up to the new Map yet — the dialog
        // itself still renders from `liveReviewItems`, which has caught up
        // by the time React actually paints it.
        const items = bindingsNeedingReview(dashboards, workspaces, entriesBySpaceForProfile(profile));
        if (items.length > 0) setReviewOpen(true);
      }),
    []
  );

  const handleApplyReviewFixes = useCallback(
    (fixes: readonly BindingFix[]) => {
      if (fixes.length === 0) return;
      const currentProfileId = profileIdRef.current;
      const dashboards = settingsRef.current.dashboardsByProfile[currentProfileId];
      const workspaces = settingsRef.current.workspacesByProfile[currentProfileId];
      const result = applyBindingFixes(dashboards, workspaces, fixes);
      updateSettings({
        dashboardsByProfile:
          result.dashboards !== undefined
            ? { ...settingsRef.current.dashboardsByProfile, [currentProfileId]: result.dashboards }
            : settingsRef.current.dashboardsByProfile,
        workspacesByProfile:
          result.workspaces !== undefined
            ? { ...settingsRef.current.workspacesByProfile, [currentProfileId]: result.workspaces }
            : settingsRef.current.workspacesByProfile,
      });
    },
    [updateSettings]
  );

  /** Mirrors dockview's own panel and popout lists, which are the only authority on either. */
  const syncOpenPanes = useCallback(
    (api: DockviewApi) => {
      const ids = api.panels.map(panel => panel.id);

      // Fed to `usePaneLocations` below, which broadcasts it to every other
      // Window so a singleton open here shows correctly as "already open in
      // Main Window" from a Daughter Window's own menu (issue 04).
      setOpenPaneIds(ids);

      // A closed Pane is gone: its filter must not come back with the next Pane
      // of its kind, and the Inspector must not keep describing a selection made
      // in a surface that is no longer on screen.
      retainPaneState(ids);
      retainPanes(ids);
      // Likewise a closed Plot Pane's series: freed so another Plot Pane can
      // claim the name, rather than left streaming to a Pane that no longer
      // exists. A merely backgrounded Pane is still in `ids` and keeps its claim.
      retainSeriesFor(port, ids);
    },
    [retainPanes, port]
  );

  /** Persists the active Workspace's own Main-Window content — mainDockLayout, Pane state and selection. Never touches `daughterWindows`: each open Daughter Window keeps its own entry current independently. */
  const flushAutosave = useCallback(() => {
    cancelPendingAutosave();
    const api = apiRef.current;
    if (!api) return;

    const ids = api.panels.map(panel => panel.id);
    const content = {
      mainDockLayout: api.toJSON(),
      paneStates: snapshotPaneStates(ids),
      selection: selectionRef.current,
    };
    withProfileWorkspaces(collection => updateWorkspaceContent(collection, collection.activeWorkspaceId, content));
  }, [cancelPendingAutosave, withProfileWorkspaces]);

  const scheduleAutosave = useCallback(() => {
    cancelPendingAutosave();
    autosaveTimer.current = setTimeout(flushAutosave, AUTOSAVE_DEBOUNCE_MS);
  }, [cancelPendingAutosave, flushAutosave]);

  // Flush on unmount and on quit, so a debounced change is never lost — the
  // same precedent `SettingsContext` sets for the settings blob this lives in.
  useEffect(() => {
    const flush = () => flushAutosave();
    window.addEventListener('beforeunload', flush);
    const unsubscribePaneState = subscribePaneStateChanges(scheduleAutosave);
    return () => {
      window.removeEventListener('beforeunload', flush);
      unsubscribePaneState();
      cancelPendingAutosave();
    };
  }, [flushAutosave, scheduleAutosave, cancelPendingAutosave]);

  /**
   * Enters Focus Mode on the named Dashboard — the one trigger `DashboardPane`
   * calls through `FocusModeProvider`, below. `paneId` is part of the shared
   * trigger signature (a Daughter Window's own `FocusModeProvider`,
   * `DaughterWindowShell.tsx`, uses the same one) but unused here: this
   * provider only ever wraps the Main Window's own tree, so a Dashboard Pane
   * calling it is, by construction, always in the Main Window.
   *
   * Flushes first as ordinary autosave hygiene, matching `flushAutosave`'s own
   * reasoning for quit — not, as before issue 02, because entering is about to
   * unmount the Workspace out from under an in-flight debounced save.
   * `apiRef` stays live: dockview keeps running underneath, since hiding the
   * dock must not disturb what else is going on, including polling the Device.
   */
  const enterFocusMode = useCallback(
    (dashboardId: string) => {
      flushAutosave();
      setMainFocusDashboardId(dashboardId);
    },
    [flushAutosave]
  );

  const exitFocusMode = useCallback(() => setMainFocusDashboardId(null), []);

  /** Restores a Workspace's own Main-Window content onto the live api, following its selection and re-syncing what is open. Says nothing about `target.daughterWindows` — restoring those is a separate, asynchronous step (see `openWorkspaceDaughterWindows`/`switchDaughterWindows` below). */
  const applyWorkspace = useCallback(
    (api: DockviewApi, target: StoredWorkspace): boolean => {
      try {
        restoreWorkspace(api, target);
      } catch (error) {
        console.error(`Failed to load the "${target.name}" Workspace.`, error);
        return false;
      }
      if (target.selection !== null) select(target.selection);
      syncOpenPanes(api);
      return true;
    },
    [select, syncOpenPanes]
  );

  const openPane = useCallback(
    (
      kind: PaneKind,
      position?: AddPanelPositionOptions,
      initialWidth?: number,
      paneState?: unknown
    ): string | null => {
      const api = apiRef.current;
      const definition = paneDefinition(kind);
      if (!api || !definition) return null;

      if (definition.singleton) {
        // Already open: focus it rather than duplicate it, so the menu entry
        // reads as "take me there" instead of appearing to do nothing. (When
        // it is open in a *different* Window, the menu disables the entry
        // instead of offering this — see `paneMenuEntries`.) `paneState`
        // arriving for a singleton already open here is a stale or racing
        // handoff — `moveTargets` (`useMoveToWindow.ts`) already excludes a
        // Window in this state from the sender's own menu, so this is a
        // defensive fallback, not the expected path: still just focus what
        // is already here rather than silently dropping the seed on the
        // floor.
        const existing = api.getPanel(paneId(kind));
        if (existing) {
          existing.api.setActive();
          return existing.id;
        }
        const id = paneId(kind);
        if (paneState !== undefined) restorePaneState(id, paneState);
        api.addPanel({ id, component: kind, title: definition.title, position, initialWidth });
        return id;
      }

      // Several of this kind may be open at once, each with its own filter and
      // selection, so each needs its own identity. Numbering from 1 rather than
      // 0 keeps every instance's tab reading the same way, instead of the first
      // being unnumbered and every later one numbered. A Pane moved in from
      // another Window (`paneState` set) gets a fresh instance number here the
      // same way any other new Pane of this kind would — its numeric suffix
      // was never meaningful outside the Window it was minted in, and its tab
      // title needs no special handling either: every Pane kind that shows
      // one recomputes it from its own state on mount regardless (see
      // `paneHandoff.ts`'s own doc comment for why a title was deliberately
      // dropped from the handoff payload).
      const taken = new Set(api.panels.map(panel => panel.id));
      let instance = 1;
      while (taken.has(paneId(kind, instance))) instance += 1;
      const id = paneId(kind, instance);
      if (paneState !== undefined) restorePaneState(id, paneState);
      api.addPanel({
        id,
        component: kind,
        title: `${definition.title} ${instance}`,
        position,
        initialWidth,
      });
      return id;
    },
    []
  );

  /** Adapts `openPane`'s own wider signature (position/width, for the default-layout seeding above) to what `useMoveToWindow` needs to open a Pane handed off from another Window — always at dockview's own default placement, never a specific position. */
  const openPaneFromHandoff = useCallback(
    (kind: PaneKind, paneState: unknown) => {
      openPane(kind, undefined, undefined, paneState);
    },
    [openPane]
  );
  const moveToWindow = useMoveToWindow(
    apiRef,
    MAIN_WINDOW_ID,
    openDaughterWindows,
    paneLocations,
    openPaneFromHandoff,
    customNames
  );

  /** `OpenPlotProvider`'s own implementation: right-click "Plot" on a Registers/System Registers row opens a fresh Plot Pane already carrying that one entry as its series, using this Profile's own plot defaults for poll interval and time span the same way a manually-added series would. */
  const handleOpenPlot = useCallback(
    (entry: MapEntry, source: PlottableSpace) => {
      const { pollInterval, timeSpan } = settingsRef.current.plotDefaults;
      const seed: PlotPaneState = {
        series: [
          { name: entry.name, source, address: entry.address, snapshot: snapshotFromEntry(entry), colorSlot: 0, visible: true },
        ],
        pollInterval,
        timeSpan,
        pickerSource: source,
        pickerQuery: '',
      };
      openPane('plot', undefined, undefined, seed);
    },
    [openPane]
  );

  const handleReady = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api;

      const currentProfileId = profileIdRef.current;
      const stored = settingsRef.current.workspacesByProfile[currentProfileId];
      let collection = stored === undefined ? undefined : sanitizeProfileWorkspaces(stored);
      let restoredTarget: StoredWorkspace | undefined;

      // The active Workspace can still fail at runtime even after passing
      // structural validation — dockview rejecting a field a future version
      // dropped, say. Dropping just that one and trying what the collection
      // has left keeps every other saved Workspace intact; only when nothing
      // in the collection actually loads does the shell give up and reseed.
      while (collection !== undefined) {
        const target = activeWorkspaceOf(collection);
        if (target === undefined) break;
        if (applyWorkspace(api, target)) {
          restoredTarget = target;
          break;
        }
        collection = withoutWorkspace(collection, target.id);
      }

      if (restoredTarget === undefined) {
        // Nothing usable was stored — first launch, or every stored Workspace
        // failed to load. Build the bundled arrangement live and seed it as the
        // Profile's default Workspace, so the next launch restores rather than
        // rebuilding this list again.
        let previousId: string | null = null;
        for (const entry of DEFAULT_LAYOUT) {
          const position: AddPanelPositionOptions | undefined =
            previousId !== null && entry.direction !== undefined
              ? { referencePanel: previousId, direction: entry.direction }
              : undefined;
          const id = openPane(entry.kind, position, entry.initialWidth);
          if (id !== null) previousId = id;
        }
        const seeded = snapshotWorkspace(api, DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME, null, []);
        collection = seedProfileWorkspaces(seeded);
        restoredTarget = seeded;
      }

      if (collection !== undefined) {
        updateSettings({
          workspacesByProfile: { ...settingsRef.current.workspacesByProfile, [currentProfileId]: collection },
        });
      }

      // Restoring N Daughter Windows at launch is just N Rust
      // `WebviewWindowBuilder::build()` calls, none of them gated on a user
      // gesture (unlike the old dockview-popout mechanism's `window.open`) —
      // fire-and-forget from this synchronous handler, each failure surfaced
      // through its own toast rather than blocking the rest of the restore.
      void openWorkspaceDaughterWindows(restoredTarget.daughterWindows);

      // Closing, opening, moving or resizing a Pane changes what the reopen
      // menu should offer and what the active Workspace should be saved as, so
      // the shell follows dockview rather than trying to predict it.
      //
      // A Daughter Window that loses its last Pane closes itself — that is
      // now `DaughterWindowShell.tsx`'s own, purely local concern against
      // its own dockview instance, not this one's: a Daughter Window is a
      // genuinely separate `WebviewWindow` (issue 02), not a dockview
      // popout `api.getPopouts()` would still know about.
      api.onDidLayoutChange(() => {
        syncOpenPanes(api);
        scheduleAutosave();
      });
      syncOpenPanes(api);

      // Dragging a Pane's tab outside every open Window's bounds creates a
      // new Daughter Window there (issue 07) — rebuilt against the new
      // mechanism, since dockview's own DOM-adoption drag-out (formerly
      // wired here) cannot work unchanged now that a Daughter Window is a
      // genuinely separate process rather than an adopted-DOM popout.
      moveToNewWindow.attachDragOutListener(api);

      // Reachable from the browser console during development, alongside
      // `window.dshubFaults`. An arrangement is the thing this shell is for, and
      // being able to build one from the console is what makes it reviewable
      // before there are enough Pane kinds to build one by hand. Gated on the
      // dev build rather than on the absence of Tauri, so it cannot ship.
      if (import.meta.env.DEV) {
        (window as unknown as { dshubWorkspace?: DockviewApi }).dshubWorkspace = api;
      }
    },
    [applyWorkspace, openPane, syncOpenPanes, scheduleAutosave, updateSettings, openWorkspaceDaughterWindows, moveToNewWindow]
  );

  const handleOpenPane = useCallback((kind: PaneKind) => openPane(kind), [openPane]);

  const handleTabContextMenuItems: NonNullable<ComponentProps<typeof Workspace>['getTabContextMenuItems']> = useCallback(
    ({ panel }) => {
      const targets = moveToWindow.targetsFor(panel);
      return [
        'close',
        'closeOthers',
        'closeAll',
        'separator',
        { label: 'Move to new window', action: () => moveToNewWindow.requestMove(panel) },
        // Only present when another Window is actually open to move into
        // (`moveTargets`) — "Move to new window" above already covers "I want
        // a new one" regardless. dockview's own tab context menu has no
        // native submenu, so each target is its own flat entry rather than a
        // nested "Move to Window ▸ …" flyout — functionally the same choice,
        // just without machinery this library gives no seam to build.
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

  const handleSwitchWorkspace = useCallback(
    (id: string) => {
      const api = apiRef.current;
      if (!api) return;
      cancelPendingAutosave();

      // Looked up before the update rather than inside it: the Daughter
      // Window switch below is asynchronous and needs the incoming
      // Workspace's saved list regardless of whether the update itself
      // ends up applying (see `switched`) — and nothing mutates settings
      // between this read and the synchronous `withProfileWorkspaces` call
      // right after it, so the two agree on the same collection.
      const collectionNow = settingsRef.current.workspacesByProfile[profileIdRef.current];
      const target = collectionNow?.workspaces.find(w => w.id === id);
      if (target === undefined) return;

      let switched = false;
      withProfileWorkspaces(collection => {
        // The Workspace being left has to be saved with what it actually
        // shows right now, and the switch to the new active id has to land in
        // the same write — two sequential `updateSettings` calls here would
        // have the second overwrite the first, since neither can see the
        // other's result until the next render.
        const outgoingIds = api.panels.map(panel => panel.id);
        const flushed = updateWorkspaceContent(collection, collection.activeWorkspaceId, {
          mainDockLayout: api.toJSON(),
          paneStates: snapshotPaneStates(outgoingIds),
          selection: selectionRef.current,
        });

        if (!applyWorkspace(api, target)) return undefined;
        switched = true;
        return setActiveWorkspace(flushed, id);
      });

      // A Daughter Window belongs to the Workspace, not the Profile: only
      // touch the live window set once the switch actually took — a
      // rejected `applyWorkspace` above must leave whatever was already
      // open alone.
      if (switched) void switchDaughterWindows(target.daughterWindows);
    },
    [applyWorkspace, cancelPendingAutosave, switchDaughterWindows, withProfileWorkspaces]
  );

  const handleSaveWorkspaceAs = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      const api = apiRef.current;
      if (!api || trimmed === '') return;

      // Currently-open Daughter Windows are not carried into the new
      // Workspace identity here — each keeps saving itself under whatever
      // is active at its own next autosave tick, which becomes this new
      // Workspace the moment `addWorkspace` below makes it active.
      const saved = snapshotWorkspace(api, createWorkspaceId(), trimmed, selectionRef.current, []);
      withProfileWorkspaces(collection => addWorkspace(collection, saved));
    },
    [withProfileWorkspaces]
  );

  const handleRenameWorkspace = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (trimmed === '') return;
      withProfileWorkspaces(collection => renameWorkspace(collection, id, trimmed));
    },
    [withProfileWorkspaces]
  );

  const handleDeleteWorkspace = useCallback(
    (id: string) => {
      let fallbackTarget: StoredWorkspace | undefined;
      withProfileWorkspaces(collection => {
        const next = removeWorkspace(collection, id);
        if (next === collection) return undefined; // refused (default) or an id that is not there

        const api = apiRef.current;
        if (collection.activeWorkspaceId === id && api) {
          cancelPendingAutosave();
          const target = next.workspaces.find(w => w.id === next.activeWorkspaceId);
          if (target !== undefined) {
            applyWorkspace(api, target);
            fallbackTarget = target;
          }
        }
        return next;
      });
      if (fallbackTarget !== undefined) void switchDaughterWindows(fallbackTarget.daughterWindows);
    },
    [applyWorkspace, cancelPendingAutosave, switchDaughterWindows, withProfileWorkspaces]
  );

  // Labels, not `Window` objects — Rust is the only thing that knows which
  // Daughter Windows actually exist now (`useDaughterWindows`), so closing
  // and focusing one is a direct label-based Tauri call rather than a lookup
  // against anything dockview or this component's own state ever tracked.
  const handleFocusDaughterWindow = useCallback((label: string) => {
    void focusDaughterWindow(label);
  }, []);

  /**
   * Sets or clears one Daughter Window's own custom name, from the Main
   * Window's own "Daughter Windows" list (`.scratch/daughter-windows-native`
   * issue 07's own naming follow-up) — the only place this happens, per the
   * confirmed scope decision that a Daughter Window's own chrome stays
   * exactly as minimal as it already is. A blank/whitespace-only name
   * clears it rather than setting a literal empty string, reverting that
   * Window's own label back to `windowLabel`'s auto-derived-from-open-Panes
   * fallback.
   */
  const handleRenameDaughterWindow = useCallback(
    (label: string, name: string) => {
      const trimmed = name.trim();
      withProfileWorkspaces(collection => {
        const target = activeWorkspaceOf(collection);
        if (!target) return undefined;
        return updateWorkspaceDaughterWindows(
          collection,
          target.id,
          renameDaughterWindow(target.daughterWindows, label, trimmed === '' ? null : trimmed)
        );
      });
    },
    [withProfileWorkspaces]
  );

  /** A deliberate close from the Main Window's own list — unlike a native title-bar close, this is unambiguous, so the closed window's own entry is pruned from the active Workspace right here rather than left to reappear on the next restore. */
  const handleCloseDaughterWindow = useCallback(
    (label: string) => {
      void closeDaughterWindow(label);
      withProfileWorkspaces(collection => {
        const target = activeWorkspaceOf(collection);
        if (!target) return undefined;
        return updateWorkspaceDaughterWindows(collection, target.id, withoutDaughterWindow(target.daughterWindows, label));
      });
    },
    [withProfileWorkspaces]
  );

  /** Both the outgoing Profile's own autosave flush and closing its Daughter Windows before `<Workspace key={profileId}>` remounts against the incoming Profile — `handleReady` opens the incoming one's own saved list once that mount's own restore runs. */
  const handleBeforeProfileChange = useCallback(() => {
    flushAutosave();
    void closeAllDaughterWindows();
  }, [flushAutosave, closeAllDaughterWindows]);

  return (
    <OpenPlotProvider openPlot={handleOpenPlot}>
      <FocusModeProvider enter={enterFocusMode}>
        <div className={styles.shell}>
          {mainFocusDashboardId !== null ? (
            <FocusModeView dashboardId={mainFocusDashboardId} windowId={MAIN_WINDOW_ID} onExit={exitFocusMode} />
          ) : (
            <AppChrome
              onOpenPane={handleOpenPane}
              workspaces={collection?.workspaces ?? []}
              activeWorkspaceId={collection?.activeWorkspaceId ?? ''}
              defaultWorkspaceId={collection?.defaultWorkspaceId ?? ''}
              onSwitchWorkspace={handleSwitchWorkspace}
              onSaveWorkspaceAs={handleSaveWorkspaceAs}
              onRenameWorkspace={handleRenameWorkspace}
              onDeleteWorkspace={handleDeleteWorkspace}
              onBeforeProfileChange={handleBeforeProfileChange}
              daughterWindows={openDaughterWindows.map(label => ({
                id: label,
                label: windowLabel(label, openDaughterWindows, customNames, paneLocations),
                isCustomName: customNames.has(label),
              }))}
              onFocusDaughterWindow={handleFocusDaughterWindow}
              onCloseDaughterWindow={handleCloseDaughterWindow}
              onRenameDaughterWindow={handleRenameDaughterWindow}
              paneMenuEntries={paneMenuEntries(PANES, paneLocations, MAIN_WINDOW_ID, openDaughterWindows, customNames)}
              unresolvedBindingCount={liveReviewItems.length}
              onOpenBindingReview={() => setReviewOpen(true)}
            />
          )}
          {/* Always mounted. Hidden rather than unmounted while the Main
              Window is in Focus Mode, so this Window's own in-session
              arrangement survives the toggle. Keyed on the Profile regardless:
              switching one is a different Workspace collection entirely
              (`workspacesByProfile` is itself keyed by Profile), and
              remounting is what makes `handleReady` run again against the new
              Profile's own saved layout — or seed one — rather than leaving
              the old Profile's Panes on screen pointed at a Map that no longer
              describes them. */}
          <div className={styles.workspaceHost} hidden={mainFocusDashboardId !== null}>
            <Workspace key={profileId} onReady={handleReady} getTabContextMenuItems={handleTabContextMenuItems} />
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

        <BindingReviewDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          items={liveReviewItems}
          onApply={handleApplyReviewFixes}
        />
      </FocusModeProvider>
    </OpenPlotProvider>
  );
}

/**
 * The shell's providers.
 *
 * Separate from the shell body only because the body has to *read* the selection
 * to prune it when a Pane closes, and a component cannot consume a context it
 * provides.
 */
export function AppShell(): React.JSX.Element {
  return (
    <TooltipProvider>
      <SelectionProvider>
        <WorkspaceShell />
      </SelectionProvider>
    </TooltipProvider>
  );
}
