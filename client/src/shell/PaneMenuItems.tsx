import { MenuItem, MenuLabel } from '../ui';
import type { PaneMenuEntry } from './daughterWindows';
import type { PaneKind } from './paneRegistry';

export interface PaneMenuItemsProps {
  readonly entries: readonly PaneMenuEntry[];
  readonly onOpenPane: (kind: PaneKind) => void;
}

/**
 * The body of an "open a Pane" menu — shared by the Main Window's own Panes
 * menu (`AppChrome.tsx`) and every Daughter Window's add-Pane menu
 * (`DaughterWindowChrome.tsx`), so the two literally render the same list
 * rather than two copies that could drift apart. `entries` already carries
 * the disabled/location decision (`daughterWindows.ts`'s `paneMenuEntries`);
 * this only draws it.
 */
export function PaneMenuItems({ entries, onOpenPane }: PaneMenuItemsProps): React.JSX.Element {
  return (
    <>
      <MenuLabel>Open a pane</MenuLabel>
      {entries.map(entry => (
        <MenuItem key={entry.kind} disabled={entry.disabledLocation !== null} onSelect={() => onOpenPane(entry.kind)}>
          {entry.title}
          {entry.disabledLocation !== null ? ` — already open in ${entry.disabledLocation}` : ''}
        </MenuItem>
      ))}
    </>
  );
}
