import { PortalContainerScope } from '../ui';
import { DaughterWindowChrome } from './DaughterWindowChrome';
import { FocusModeView } from './FocusModeView';
import type { PaneMenuEntry } from './daughterWindows';
import type { PaneKind } from './paneRegistry';
import styles from './DaughterWindowRoot.module.css';

export interface DaughterWindowRootProps {
  readonly windowId: string;
  /** Where floating primitives this Window opens (the add-Pane menu, say) should portal — that Window's own document, never the Main Window's. */
  readonly portalContainer: HTMLElement;
  readonly entries: readonly PaneMenuEntry[];
  readonly onOpenPane: (kind: PaneKind) => void;
  /** Non-null when this Window is the one Focus Mode was entered from. */
  readonly focusDashboardId: string | null;
  readonly onExitFocusMode: () => void;
}

/**
 * A Daughter Window's own React root: its top bar, and — when this Window is
 * the one Focus Mode was entered from — the Focus Mode overlay covering it.
 *
 * Portalled into the popout's own document from within the Main Window's
 * React tree (`AppShell.tsx`), not a second application instance: the popout
 * shares the Main Window's JavaScript realm (ADR 0004), and this is the one
 * piece of UI that actually needs to *render* there rather than have its DOM
 * relocated there — dockview only adopts a group's own dock content into a
 * popout, never surrounding chrome.
 *
 * Never renders the dock itself: that is dockview's own adopted DOM, sitting
 * in the same document as a sibling this component does not know about.
 * Focus Mode covering it is `FocusModeView`'s own `position: fixed` overlay,
 * which visually hides the chrome underneath but does not, on its own, take
 * it out of tab order or the accessibility tree — a sighted mouse user
 * cannot reach the covered add-Pane control, but a keyboard or screen-reader
 * user still could. `hidden` on this Window's chrome root is what actually
 * locks it (spec.md, story 36), mirroring the Main Window's own
 * `hidden={mainFocusDashboardId !== null}` on its `workspaceHost`
 * (`AppShell.tsx`) rather than trusting the overlay alone to do that job.
 */
export function DaughterWindowRoot({
  windowId,
  portalContainer,
  entries,
  onOpenPane,
  focusDashboardId,
  onExitFocusMode,
}: DaughterWindowRootProps): React.JSX.Element {
  return (
    <PortalContainerScope container={portalContainer}>
      <div className={styles.root} hidden={focusDashboardId !== null}>
        <DaughterWindowChrome entries={entries} onOpenPane={onOpenPane} />
      </div>
      {focusDashboardId !== null ? (
        <FocusModeView dashboardId={focusDashboardId} windowId={windowId} onExit={onExitFocusMode} />
      ) : null}
    </PortalContainerScope>
  );
}
