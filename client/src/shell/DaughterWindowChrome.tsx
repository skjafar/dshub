import { SquaresFour } from '@phosphor-icons/react';
import { Button, Menu } from '../ui';
import { ControlBadge, LinkStatus } from './LinkStatus';
import { PaneMenuItems } from './PaneMenuItems';
import type { PaneMenuEntry } from './daughterWindows';
import type { PaneKind } from './paneRegistry';
import styles from './DaughterWindowChrome.module.css';

export interface DaughterWindowChromeProps {
  readonly entries: readonly PaneMenuEntry[];
  readonly onOpenPane: (kind: PaneKind) => void;
}

/**
 * A Daughter Window's entire top bar: link and Control state, read-only, plus
 * one control to add a Pane — and nothing else (spec.md). Connect, Control,
 * Workspaces, Profiles, theme and Settings stay singular in the Main Window
 * by design, not by omission.
 *
 * Composes the exact components the Main Window's own chrome uses
 * (`LinkStatus`, `ControlBadge`) rather than redrawing them, so the two can
 * never disagree about what the link or Control state currently is.
 */
export function DaughterWindowChrome({ entries, onOpenPane }: DaughterWindowChromeProps): React.JSX.Element {
  return (
    <header className={styles.chrome}>
      <LinkStatus />
      <ControlBadge />
      <span className={styles.spacer} />
      <Menu
        align="end"
        trigger={
          <Button variant="ghost" size="sm" aria-label="Add a pane">
            <SquaresFour size={16} />
            Add Pane
          </Button>
        }
      >
        <PaneMenuItems entries={entries} onOpenPane={onOpenPane} />
      </Menu>
    </header>
  );
}
