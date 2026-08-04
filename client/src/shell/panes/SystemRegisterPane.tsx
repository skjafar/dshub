import { AddressSpacePane } from './AddressSpacePane';
import type { PaneProps } from '../paneRegistry';

/**
 * The System Registers: the space the protocol library defines, rather than the
 * firmware on any particular board.
 *
 * Read-only, and the absence of a write affordance is the whole point of this
 * Pane rather than a feature it has yet to grow. The Device answers a write to
 * this space with `PERMISSION_ERROR`, so a field offered here would promise a
 * change that never happens.
 *
 * That rule cannot come from the Map. A System Register Map is parsed with no
 * read-only boundary, which leaves every entry in it claiming read/write — so
 * the space's rule overrides the Map's claim, in the access column as well as in
 * what this Pane offers. See `ADDRESS_SPACE_WRITABLE`.
 */
export function SystemRegisterPane(props: PaneProps): React.JSX.Element {
  return <AddressSpacePane space="sysRegister" {...props} />;
}
