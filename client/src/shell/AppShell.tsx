import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import type { AddPanelPositionOptions, DockviewApi, DockviewGroupPanel, IDockviewPanel } from 'dockview';
import { Button, Dialog, TooltipProvider } from '../ui';
import { useBackendPort } from '../contexts/BackendPortContext';
import { useSettings } from '../contexts/SettingsContext';
import { getThemeById } from '../appThemes';
import { AppChrome } from './AppChrome';
import { closeDaughterWindow, focusDaughterWindow } from './daughterWindowNative';
import {
  DAUGHTER_WINDOW_DEFAULT_HEIGHT,
  DAUGHTER_WINDOW_DEFAULT_WIDTH,
  dragOutTarget,
  paneMenuEntries,
  shouldWarnBeforeNewDaughterWindow,
} from './daughterWindows';
import type { WindowBounds } from './daughterWindows';
import { DaughterWindowRoot } from './DaughterWindowRoot';
import { FocusModeProvider } from './FocusModeContext';
import { FocusModeView } from './FocusModeView';
import { MAIN_WINDOW_ID, windowIdForPane } from './focusMode';
import type { WindowId } from './focusMode';
import { SelectionProvider, useSelection } from './SelectionContext';
import { Workspace } from './Workspace';
import { PANES, kindOfPaneId, paneDefinition, paneId } from './paneRegistry';
import type { PaneKind } from './paneRegistry';
import { retainPaneState, snapshotPaneStates, subscribePaneStateChanges } from './paneState';
import { retainSeriesFor } from './plotStream';
import { useDaughterWindowChrome } from './useDaughterWindowChrome';
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  activeWorkspaceOf,
  addWorkspace,
  createRestoreGuard,
  createWorkspaceId,
  removeWorkspace,
  renameWorkspace,
  restoreWorkspace,
  sanitizeProfileWorkspaces,
  seedProfileWorkspaces,
  setActiveWorkspace,
  snapshotWorkspace,
  updateWorkspaceContent,
  withoutWorkspace,
} from './workspaceStore';
import type { ProfileWorkspaces, RestoreGuard, StoredWorkspace } from './workspaceStore';
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

/** One open Daughter Window, as far as the shell needs to track it. */
interface OpenPopout {
  readonly id: string;
  readonly window: Window;
}

/** A popped-out group or panel awaiting confirmation past the window-count warning. */
interface PendingPopout {
  readonly item: IDockviewPanel | DockviewGroupPanel;
  readonly position?: WindowBounds;
}

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
 * Since issue 03, it also owns the Daughter Windows a Workspace can hold: it
 * tracks which are open, portals each one's chrome into its own document, and
 * is where every decision `workspaceStore.ts` cannot make on its own —
 * creating a popout, warning before a fifth, destroying its Panes when it
 * closes — is wired to the live dock api.
 */
function WorkspaceShell(): React.JSX.Element {
  const apiRef = useRef<DockviewApi | null>(null);
  const [openKinds, setOpenKinds] = useState<readonly PaneKind[]>([]);
  const [openPopouts, setOpenPopouts] = useState<readonly OpenPopout[]>([]);
  // Which Dashboard, if any, each Window is showing full-canvas — issue 02.
  // Keyed by `WindowId` rather than a single value because more than one
  // Window can have Focus Mode active at once: the Main Window's own entry is
  // `focusByWindow[MAIN_WINDOW_ID]`. `<Workspace>` stays mounted regardless —
  // hiding a Window's dock rather than unmounting it is the whole point, since
  // unmounting the one shared dockview instance would destroy every Daughter
  // Window along with it, not just the Window Focus Mode was entered from.
  const [focusByWindow, setFocusByWindow] = useState<Readonly<Record<WindowId, string>>>({});
  // True once a restore's popout was blocked (spec.md's data-loss path) —
  // mirrors `restoreGuardRef.current.blocked` as React state purely so the
  // "Reopen windows" banner below can react to it; the guard itself is what
  // autosave actually checks, synchronously, with no render involved.
  const [restoreBlocked, setRestoreBlocked] = useState(false);
  const [pendingPopout, setPendingPopout] = useState<PendingPopout | null>(null);
  const restoreGuardRef = useRef<RestoreGuard | null>(null);
  const draggedPanelRef = useRef<IDockviewPanel | null>(null);

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

  /** Mirrors dockview's own panel and popout lists, which are the only authority on either. */
  const syncOpenPanes = useCallback(
    (api: DockviewApi) => {
      const ids = api.panels.map(panel => panel.id);

      const kinds = ids
        .map(id => kindOfPaneId(id))
        .filter((kind): kind is PaneKind => kind !== undefined);
      setOpenKinds([...new Set(kinds)]);
      setOpenPopouts(api.getPopouts().map(popout => ({ id: popout.id, window: popout.window })));

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

  /** Persists the active Workspace's current content — dockLayout, Pane state and selection. */
  const flushAutosave = useCallback(() => {
    cancelPendingAutosave();
    const api = apiRef.current;
    if (!api) return;
    // Frozen while a restore's popout is blocked (spec.md): dockview redocks
    // the orphaned groups into the main grid, which is a layout change like
    // any other, and saving *that* would overwrite the stored Workspace with
    // an arrangement missing the Daughter Windows it just failed to reopen.
    // `handleReopenWindows` is what lifts this, by resetting the guard before
    // it retries.
    if (restoreGuardRef.current?.blocked) return;

    const ids = api.panels.map(panel => panel.id);
    const content = {
      dockLayout: api.toJSON(),
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
   * Enters Focus Mode on the named Dashboard, in whichever Window the calling
   * Dashboard Pane instance (`paneId`) currently lives in — the one trigger
   * `DashboardPane` calls through `FocusModeProvider`, below.
   *
   * Flushes first as ordinary autosave hygiene, matching `flushAutosave`'s own
   * reasoning for quit — not, as before issue 02, because entering is about to
   * unmount the Workspace out from under an in-flight debounced save.
   * `apiRef` stays live: dockview keeps running underneath, since hiding one
   * Window's dock must not disturb what every other Window is doing,
   * including polling the Device.
   */
  const enterFocusMode = useCallback(
    (dashboardId: string, paneId: string) => {
      flushAutosave();
      const api = apiRef.current;
      const windowId = api ? windowIdForPane(api, paneId) : MAIN_WINDOW_ID;
      setFocusByWindow(previous => ({ ...previous, [windowId]: dashboardId }));
    },
    [flushAutosave]
  );

  /** Leaves Focus Mode for one Window, restoring that Window's normal dock. */
  const exitFocusMode = useCallback((windowId: WindowId) => {
    setFocusByWindow(previous => {
      if (!(windowId in previous)) return previous;
      const { [windowId]: _removed, ...rest } = previous;
      return rest;
    });
  }, []);

  /**
   * Restores a Workspace onto the live api, following its selection and
   * re-syncing what is open.
   *
   * Resets the restore guard first, including on a retry: a stale `blocked`
   * from a previous, already-handled failure must not linger onto this one,
   * and this is the one call site every restore path — initial load,
   * Workspace switch, delete-active fallback, and the "Reopen windows" retry
   * — already goes through.
   */
  const applyWorkspace = useCallback(
    (api: DockviewApi, target: StoredWorkspace): boolean => {
      restoreGuardRef.current?.reset();
      setRestoreBlocked(false);
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
    (kind: PaneKind, position?: AddPanelPositionOptions, initialWidth?: number): string | null => {
      const api = apiRef.current;
      const definition = paneDefinition(kind);
      if (!api || !definition) return null;

      if (definition.singleton) {
        // Already open: focus it rather than duplicate it, so the menu entry
        // reads as "take me there" instead of appearing to do nothing. (When
        // it is open in a *different* Window, the menu disables the entry
        // instead of offering this — see `paneMenuEntries`.)
        const existing = api.getPanel(paneId(kind));
        if (existing) {
          existing.api.setActive();
          return existing.id;
        }
        const id = paneId(kind);
        api.addPanel({ id, component: kind, title: definition.title, position, initialWidth });
        return id;
      }

      // Several of this kind may be open at once, each with its own filter and
      // selection, so each needs its own identity. Numbering from 1 rather than
      // 0 keeps every instance's tab reading the same way, instead of the first
      // being unnumbered and every later one numbered.
      const taken = new Set(api.panels.map(panel => panel.id));
      let instance = 1;
      while (taken.has(paneId(kind, instance))) instance += 1;
      const id = paneId(kind, instance);
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

  /**
   * Opens a Pane into a specific Daughter Window rather than wherever
   * dockview would otherwise place it — what that Window's own add-Pane
   * control needs (spec.md: "a Pane I add from a Daughter Window opens in
   * that Daughter Window"). Positioned against any existing panel in that
   * Window; a Window can never be empty while this runs (it would already
   * have closed itself — see `handleReady`'s last-panel watch), so there is
   * always a reference panel to place against.
   */
  const openPaneInWindow = useCallback(
    (kind: PaneKind, windowId: WindowId) => {
      const api = apiRef.current;
      if (!api) return;
      const reference = api.panels.find(panel => windowIdForPane(api, panel.id) === windowId);
      if (!reference) return;
      openPane(kind, { referencePanel: reference.id, direction: 'within' });
    },
    [openPane]
  );

  /**
   * Destroys every Pane in `window`'s member groups — the override
   * `disposePopoutWindow`'s default (relocate to the main grid) needs, since
   * the spec wants a closed Daughter Window's Panes gone, not reappearing in
   * the Main Window. `removePanel` rather than the dockview-internal
   * `skipPopoutReturn` flag: the latter is not reachable through the public
   * `DockviewApi.removeGroup`, but emptying every member group achieves the
   * same outcome — there is nothing left for the default relocate to move.
   */
  const destroyMembersOnClose = useCallback((api: DockviewApi, closingWindow: Window) => {
    for (const group of api.groups.filter(g => g.api.getWindow() === closingWindow)) {
      for (const panel of [...group.panels]) {
        api.removePanel(panel);
      }
    }
  }, []);

  /**
   * Actually opens `item` as a popout, wiring the destroy-on-close override.
   *
   * Only reaches dockview's own `window.open` after {@link openAsPopout} (or
   * the pending-popout confirmation) has already decided the count warning
   * does not apply or has been passed — this is the one place that call
   * happens, so the override is never accidentally skipped for one creation
   * path and not another.
   */
  const reallyOpenPopout = useCallback(
    (api: DockviewApi, item: IDockviewPanel | DockviewGroupPanel, position?: PendingPopout['position']) => {
      void api.addPopoutGroup(item, {
        position,
        onWillClose: ({ window: closingWindow }) => destroyMembersOnClose(api, closingWindow),
      });
    },
    [destroyMembersOnClose]
  );

  /**
   * Pops `item` out into a new Daughter Window, or holds it for confirmation
   * first once creating one more would be the fifth (spec.md, story 28).
   *
   * The one entry point for popping something out — drag-out and "Move to
   * new window" both call this — so the warning and the destroy-on-close
   * wiring apply identically regardless of which gesture asked for it.
   */
  const openAsPopout = useCallback(
    (item: IDockviewPanel | DockviewGroupPanel, position?: PendingPopout['position']) => {
      const api = apiRef.current;
      if (!api) return;
      if (shouldWarnBeforeNewDaughterWindow(api.getPopouts().length)) {
        setPendingPopout({ item, position });
        return;
      }
      reallyOpenPopout(api, item, position);
    },
    [reallyOpenPopout]
  );

  const confirmPendingPopout = useCallback(() => {
    const api = apiRef.current;
    if (!api || !pendingPopout) return;
    reallyOpenPopout(api, pendingPopout.item, pendingPopout.position);
    setPendingPopout(null);
  }, [pendingPopout, reallyOpenPopout]);

  const handleReady = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api;
      restoreGuardRef.current?.dispose();
      restoreGuardRef.current = createRestoreGuard(api, () => setRestoreBlocked(true));

      const currentProfileId = profileIdRef.current;
      const stored = settingsRef.current.workspacesByProfile[currentProfileId];
      let collection = stored === undefined ? undefined : sanitizeProfileWorkspaces(stored);
      let restored = false;

      // The active Workspace can still fail at runtime even after passing
      // structural validation — dockview rejecting a field a future version
      // dropped, say. Dropping just that one and trying what the collection
      // has left keeps every other saved Workspace intact; only when nothing
      // in the collection actually loads does the shell give up and reseed.
      while (collection !== undefined) {
        const target = activeWorkspaceOf(collection);
        if (target === undefined) break;
        if (applyWorkspace(api, target)) {
          restored = true;
          break;
        }
        collection = withoutWorkspace(collection, target.id);
      }

      if (!restored) {
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
        const seeded = snapshotWorkspace(api, DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME, null);
        collection = seedProfileWorkspaces(seeded);
      }

      if (collection !== undefined) {
        updateSettings({
          workspacesByProfile: { ...settingsRef.current.workspacesByProfile, [currentProfileId]: collection },
        });
      }

      // A Daughter Window that loses its last Pane closes itself (spec.md) —
      // checked on every layout change, not only `onDidRemovePanel`: dragging
      // a Pane out of a popout and back into the Main Window (or into another
      // Daughter Window) empties that popout exactly as closing its last tab
      // does, but it is a *move*, not a removal, and fires no
      // `onDidRemovePanel` at all — confirmed by hand, the earlier
      // `onDidRemovePanel`-only version left a dragged-empty popout sitting
      // open and blank. `onDidLayoutChange` is the one event every path that
      // can empty a popout — close, drag out, drag elsewhere — is guaranteed
      // to fire. Closing an already-empty popout has nothing left to
      // relocate, so no destroy-on-close override is needed here — only
      // `closeDaughterWindow` itself, since a raw `window.close()` cannot
      // reach a Tauri window's own native frame.
      const closeEmptyPopouts = (): void => {
        for (const popout of api.getPopouts()) {
          const stillOccupied = api.groups.some(g => g.api.getWindow() === popout.window);
          if (!stillOccupied) void closeDaughterWindow(popout.window);
        }
      };

      // Closing, opening, moving or resizing a Pane changes what the reopen
      // menu should offer and what the active Workspace should be saved as, so
      // the shell follows dockview rather than trying to predict it.
      api.onDidLayoutChange(() => {
        syncOpenPanes(api);
        scheduleAutosave();
        closeEmptyPopouts();
      });
      syncOpenPanes(api);

      // The only novel gesture dockview does not have: a Pane's tab dragged
      // outside every open Window's bounds becomes a new Daughter Window.
      // `onWillDragPanel` fires at drag start (dockview has no "did drag
      // end" event of its own), so the native `dragend` — the only signal
      // for where the pointer actually let go — is attached by hand, to the
      // dragged element's own document since the drag may have started
      // inside a Daughter Window rather than the Main Window.
      api.onWillDragPanel(({ panel, nativeEvent }) => {
        draggedPanelRef.current = panel;
        if (!(nativeEvent instanceof DragEvent)) return;
        const doc = nativeEvent.target instanceof Node ? nativeEvent.target.ownerDocument : document;

        const handleDragEnd = (event: DragEvent): void => {
          doc.removeEventListener('dragend', handleDragEnd);
          const dragged = draggedPanelRef.current;
          draggedPanelRef.current = null;
          const currentApi = apiRef.current;
          if (!dragged || !currentApi) return;

          const openWindows = [window, ...currentApi.getPopouts().map(p => p.window)];
          const bounds = openWindows.map(w => ({
            left: w.screenX,
            top: w.screenY,
            width: w.outerWidth,
            height: w.outerHeight,
          }));
          const target = dragOutTarget({ x: event.screenX, y: event.screenY }, bounds);
          if (target === null) return;
          openAsPopout(dragged, {
            left: target.left,
            top: target.top,
            width: DAUGHTER_WINDOW_DEFAULT_WIDTH,
            height: DAUGHTER_WINDOW_DEFAULT_HEIGHT,
          });
        };
        doc.addEventListener('dragend', handleDragEnd);
      });

      // Reachable from the browser console during development, alongside
      // `window.dshubFaults`. An arrangement is the thing this shell is for, and
      // being able to build one from the console is what makes it reviewable
      // before there are enough Pane kinds to build one by hand. Gated on the
      // dev build rather than on the absence of Tauri, so it cannot ship.
      if (import.meta.env.DEV) {
        (window as unknown as { dshubWorkspace?: DockviewApi }).dshubWorkspace = api;
      }
    },
    [applyWorkspace, openAsPopout, openPane, syncOpenPanes, scheduleAutosave, updateSettings]
  );

  const handleOpenPane = useCallback((kind: PaneKind) => openPane(kind), [openPane]);

  const handleTabContextMenuItems: NonNullable<ComponentProps<typeof Workspace>['getTabContextMenuItems']> = useCallback(
    ({ panel }) => [
      'close',
      'closeOthers',
      'closeAll',
      'separator',
      { label: 'Move to new window', action: () => openAsPopout(panel) },
    ],
    [openAsPopout]
  );

  const handleSwitchWorkspace = useCallback(
    (id: string) => {
      const api = apiRef.current;
      if (!api) return;
      cancelPendingAutosave();

      withProfileWorkspaces(collection => {
        const target = collection.workspaces.find(w => w.id === id);
        if (target === undefined) return undefined;

        // The Workspace being left has to be saved with what it actually
        // shows right now, and the switch to the new active id has to land in
        // the same write — two sequential `updateSettings` calls here would
        // have the second overwrite the first, since neither can see the
        // other's result until the next render.
        const outgoingIds = api.panels.map(panel => panel.id);
        const flushed = updateWorkspaceContent(collection, collection.activeWorkspaceId, {
          dockLayout: api.toJSON(),
          paneStates: snapshotPaneStates(outgoingIds),
          selection: selectionRef.current,
        });

        if (!applyWorkspace(api, target)) return undefined;
        return setActiveWorkspace(flushed, id);
      });
    },
    [applyWorkspace, cancelPendingAutosave, withProfileWorkspaces]
  );

  const handleSaveWorkspaceAs = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      const api = apiRef.current;
      if (!api || trimmed === '') return;

      const saved = snapshotWorkspace(api, createWorkspaceId(), trimmed, selectionRef.current);
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
      withProfileWorkspaces(collection => {
        const next = removeWorkspace(collection, id);
        if (next === collection) return undefined; // refused (default) or an id that is not there

        const api = apiRef.current;
        if (collection.activeWorkspaceId === id && api) {
          cancelPendingAutosave();
          const target = next.workspaces.find(w => w.id === next.activeWorkspaceId);
          if (target !== undefined) applyWorkspace(api, target);
        }
        return next;
      });
    },
    [applyWorkspace, cancelPendingAutosave, withProfileWorkspaces]
  );

  /** The stored Workspace a "Reopen windows" retry re-applies — the one that autosave, frozen since the block, never overwrote. */
  const handleReopenWindows = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const collection = settingsRef.current.workspacesByProfile[profileIdRef.current];
    const target = collection && activeWorkspaceOf(collection);
    if (!target) return;
    applyWorkspace(api, target);
  }, [applyWorkspace]);

  const handleFocusDaughterWindow = useCallback(
    (windowId: string) => {
      const target = openPopouts.find(p => p.id === windowId)?.window;
      if (target) void focusDaughterWindow(target);
    },
    [openPopouts]
  );

  const handleCloseDaughterWindow = useCallback(
    (windowId: string) => {
      const target = openPopouts.find(p => p.id === windowId)?.window;
      if (target) void closeDaughterWindow(target);
    },
    [openPopouts]
  );

  // Each Daughter Window's own chrome — its top bar and, when applicable,
  // its Focus Mode overlay — portals into that popout's own document
  // (`DaughterWindowRoot.tsx`); dockview only adopts a group's dock content
  // there, never surrounding chrome. Theme reaching every open Window at
  // once (spec.md, story 37) is the other half of the same "each popout
  // document needs upkeep the Main Window gets for free" concern.
  const activeTheme = useMemo(() => getThemeById(settings.colorThemeId), [settings.colorThemeId]);
  const chromeContainers = useDaughterWindowChrome(openPopouts, activeTheme);

  const openPopoutIds = useMemo(() => openPopouts.map(p => p.id), [openPopouts]);

  const collection: ProfileWorkspaces | undefined = settings.workspacesByProfile[profileId];
  const mainFocusDashboardId = focusByWindow[MAIN_WINDOW_ID] ?? null;

  return (
    <FocusModeProvider enter={enterFocusMode}>
      <div className={styles.shell}>
        {restoreBlocked ? (
          <div className={styles.restoreBanner} role="alert">
            <span>Some Windows couldn’t be reopened.</span>
            <Button variant="secondary" size="sm" onClick={handleReopenWindows}>
              Reopen windows
            </Button>
          </div>
        ) : null}
        {mainFocusDashboardId !== null ? (
          <FocusModeView
            dashboardId={mainFocusDashboardId}
            windowId={MAIN_WINDOW_ID}
            onExit={() => exitFocusMode(MAIN_WINDOW_ID)}
          />
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
            onBeforeProfileChange={flushAutosave}
            daughterWindows={openPopouts.map((popout, index) => ({ id: popout.id, label: `Daughter Window ${index + 1}` }))}
            onFocusDaughterWindow={handleFocusDaughterWindow}
            onCloseDaughterWindow={handleCloseDaughterWindow}
            paneMenuEntries={
              apiRef.current ? paneMenuEntries(PANES, openKinds, apiRef.current, MAIN_WINDOW_ID, openPopoutIds) : []
            }
          />
        )}
        {/* Always mounted — issue 02. Hidden rather than unmounted while the
            Main Window is in Focus Mode, so the one shared dockview instance
            (and any Daughter Windows it owns) keeps running underneath
            exactly as it does when Focus Mode is showing in a *different*
            Window instead. Keyed on the Profile regardless: switching one is
            a different Workspace collection entirely
            (`workspacesByProfile` is itself keyed by Profile), and
            remounting is what makes `handleReady` run again against the new
            Profile's own saved layout — or seed one — rather than leaving
            the old Profile's Panes on screen pointed at a Map that no longer
            describes them. */}
        <div className={styles.workspaceHost} hidden={mainFocusDashboardId !== null}>
          <Workspace key={profileId} onReady={handleReady} getTabContextMenuItems={handleTabContextMenuItems} />
        </div>
      </div>

      {apiRef.current &&
        openPopouts.map(popout => {
          const container = chromeContainers.get(popout.id);
          const api = apiRef.current;
          if (!container || !api) return null;
          return createPortal(
            <DaughterWindowRoot
              key={popout.id}
              windowId={popout.id}
              portalContainer={popout.window.document.body}
              entries={paneMenuEntries(PANES, openKinds, api, popout.id, openPopoutIds)}
              onOpenPane={kind => openPaneInWindow(kind, popout.id)}
              focusDashboardId={focusByWindow[popout.id] ?? null}
              onExitFocusMode={() => exitFocusMode(popout.id)}
            />,
            container
          );
        })}

      <Dialog
        open={pendingPopout !== null}
        onOpenChange={open => {
          if (!open) setPendingPopout(null);
        }}
        title="Open another Daughter Window?"
        description="You already have several Daughter Windows open."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPendingPopout(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={confirmPendingPopout}>
              Open window
            </Button>
          </>
        }
      >
        <p>Each one keeps arranging and polling — this is a soft limit, not a hard one, if your bench genuinely needs it.</p>
      </Dialog>
    </FocusModeProvider>
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
