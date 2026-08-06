import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ArrowsIn } from '@phosphor-icons/react';
import { useSettings } from '../contexts/SettingsContext';
import { Button } from '../ui';
import { ControlBadge, LinkStatus } from './LinkStatus';
import { FOCUS_WIDGET_PANE_ID, resolveFocusDashboard } from './focusMode';
import { DashboardGrid } from './panes/DashboardGrid';
import { updateDashboard, updateWidgetConfig } from './widgets/dashboardStore';
import { useProfileDashboards } from './widgets/useProfileDashboards';
import type { WidgetConfig } from './widgets/widgetConfig';
import styles from './FocusModeView.module.css';

export interface FocusModeViewProps {
  /** The Dashboard to show. Re-resolved defensively (`resolveFocusDashboard`) in case it was deleted since this id was chosen. */
  readonly dashboardId: string;
  readonly onExit: () => void;
}

/**
 * Focus Mode: one Dashboard, full-canvas, layout locked, chrome minimised to
 * link and Control state plus a single way out (ticket 18).
 *
 * Renders in place of {@link AppChrome} and the Workspace rather than beside
 * them — `AppShell.tsx` unmounts the Workspace entirely for as long as this
 * is showing, so there is exactly one live Widget tree asking the Device for
 * data at a time, never a hidden Workspace polling in the background.
 * `DashboardGrid` is handed `editing={false}` with no way to flip it, which
 * is what makes the layout *locked* rather than merely opened unedited —
 * `DashboardPane` and Focus Mode share that one flag rather than each
 * deciding independently what "locked" means.
 */
export function FocusModeView({ dashboardId, onExit }: FocusModeViewProps): React.JSX.Element {
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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      const target = document.activeElement;
      const editingText = target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (editingText) return;
      onExit();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit]);

  // Puts a keyboard user one Escape (or one Enter, having landed here first)
  // away from leaving, without hunting for it — the only affordance Focus
  // Mode's minimised chrome carries besides the status it exists to show.
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    exitButtonRef.current?.focus();
  }, []);

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
          paneId={FOCUS_WIDGET_PANE_ID}
          editing={false}
          emptyMessage={dashboard === null ? 'No Dashboards to show.' : 'This Dashboard has no Widgets yet.'}
          onUpdateWidgetConfig={handleUpdateWidgetConfig}
        />
      </div>
    </div>
  );
}
