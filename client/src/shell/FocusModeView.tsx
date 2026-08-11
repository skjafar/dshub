import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ArrowsIn } from '@phosphor-icons/react';
import { useSettings } from '../contexts/SettingsContext';
import { Button } from '../ui';
import { ControlBadge, LinkStatus } from './LinkStatus';
import { MAIN_WINDOW_ID, focusWidgetPaneId, resolveFocusDashboard } from './focusMode';
import type { WindowId } from './focusMode';
import { DashboardGrid } from './panes/DashboardGrid';
import { updateDashboard, updateWidgetConfig } from './widgets/dashboardStore';
import { useProfileDashboards } from './widgets/useProfileDashboards';
import type { WidgetConfig } from './widgets/widgetConfig';
import styles from './FocusModeView.module.css';

export interface FocusModeViewProps {
  /** The Dashboard to show. Re-resolved defensively (`resolveFocusDashboard`) in case it was deleted since this id was chosen. */
  readonly dashboardId: string;
  /**
   * Which Window this instance presents in — the Main Window by default, or
   * a Daughter Window's popout id. Scopes the Escape binding to the right
   * `document` and the plot-series claim to the right owner key, since more
   * than one Window can have Focus Mode active at once (issue 02).
   */
  readonly windowId?: WindowId;
  readonly onExit: () => void;
}

/**
 * Focus Mode: one Dashboard, full-canvas, layout locked, chrome minimised to
 * link and Control state plus a single way out (ticket 18).
 *
 * Renders in place of a Window's own chrome and dock rather than beside them
 * — `AppShell.tsx` hides that Window's dock for as long as this is showing,
 * rather than unmounting it (issue 02: unmounting would destroy any Daughter
 * Windows the dock instance owns). `DashboardGrid` is handed `editing={false}`
 * with no way to flip it, which is what makes the layout *locked* rather than
 * merely opened unedited — `DashboardPane` and Focus Mode share that one flag
 * rather than each deciding independently what "locked" means.
 */
export function FocusModeView({ dashboardId, windowId = MAIN_WINDOW_ID, onExit }: FocusModeViewProps): React.JSX.Element {
  const { settings, updateSettings } = useSettings();
  const profileId = settings.activeMapProfileId;
  const collection = useProfileDashboards(profileId);

  const dashboard = useMemo(
    () => resolveFocusDashboard(collection?.dashboards ?? [], dashboardId),
    [collection, dashboardId]
  );

  const handleUpdateWidgetConfig = useCallback(
    (widgetId: string, config: WidgetConfig) => {
      if (!collection || !dashboard) return;
      updateSettings({
        dashboardsByProfile: {
          ...settings.dashboardsByProfile,
          [profileId]: updateDashboard(collection, dashboard.id, d => updateWidgetConfig(d, widgetId, config)),
        },
      });
    },
    [collection, dashboard, settings.dashboardsByProfile, profileId, updateSettings]
  );

  // Puts a keyboard user one Escape (or one Enter, having landed here first)
  // away from leaving, without hunting for it — the only affordance Focus
  // Mode's minimised chrome carries besides the status it exists to show.
  // Also doubles as this instance's anchor into its own `document` below.
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    exitButtonRef.current?.focus();
  }, []);

  // Leaving is a single deliberate action, and this is the keyboard path to
  // it — the pointer path is the Exit button below. Locked layout does not
  // mean inert Widgets, and two other things a functional Widget does with
  // Escape must not also exit Focus Mode on the same keypress:
  //
  // - A Value Write field's own Escape (`ValueWriteWidget.tsx`, `WriteBar.tsx`)
  //   abandons its draft without calling `preventDefault`, so this is caught
  //   by deferring to a focused text field.
  // - A Dropdown's open picklist (`ui/Select.tsx`, Radix) closes itself on
  //   Escape via a capture-phase listener that *does* call `preventDefault`
  //   before this bubble-phase one ever runs — caught by deferring whenever
  //   the event already reports handled.
  //
  // Either alone still lets leaving by accident slip through the other's
  // gap, which is exactly what "not accidental" rules out. This is also
  // why the Exit button below carries its own "(Esc)" hint as plain text
  // rather than a `Tooltip`: a `Tooltip` opens on the focus this button
  // gets on mount, and it too dismisses on Escape through the same
  // capture-phase mechanism — so the very first Escape after entering would
  // only have closed the tooltip telling you Escape works.
  //
  // Bound to this instance's own `document` — recovered from the exit
  // button's `ownerDocument`, not the bare `window`/`document` globals —
  // because those globals always resolve to the Main Window's realm
  // regardless of which native Window this component's DOM is actually
  // rendered into. A Daughter Window is a separate `Window` sharing the same
  // React tree (ADR 0004): dockview adopts this element's DOM into whichever
  // Window it lives in, but the bare globals never follow, so a Main-Window
  // listener would silently never see the popout's own keystrokes at all.
  useEffect(() => {
    const view = exitButtonRef.current?.ownerDocument.defaultView ?? window;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      const target = view.document.activeElement;
      const editingText = target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (editingText) return;
      onExit();
    };
    view.addEventListener('keydown', handleKeyDown);
    return () => view.removeEventListener('keydown', handleKeyDown);
  }, [onExit]);

  return (
    <div className={styles.focus}>
      <header className={styles.strip}>
        {dashboard ? <span className={styles.dashboardName}>{dashboard.name}</span> : null}
        <LinkStatus />
        <ControlBadge />
        <span className={styles.spacer} />
        <Button ref={exitButtonRef} variant="secondary" size="sm" onClick={onExit} aria-label="Exit Focus Mode">
          <ArrowsIn size={16} />
          Exit Focus Mode
          <span className={styles.hint} aria-hidden>Esc</span>
        </Button>
      </header>
      <div className={styles.content}>
        <DashboardGrid
          dashboard={dashboard}
          paneId={focusWidgetPaneId(windowId)}
          editing={false}
          emptyMessage={dashboard === null ? 'No Dashboards to show.' : 'This Dashboard has no Widgets yet.'}
          onUpdateWidgetConfig={handleUpdateWidgetConfig}
        />
      </div>
    </div>
  );
}
