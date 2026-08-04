import { AddressSpacePane } from './AddressSpacePane';
import type { PaneProps } from '../paneRegistry';

/**
 * The Registers of the active Profile's Map: live runtime values, written by
 * firmware and lost at power-off.
 *
 * Access comes from the Map's own read-only boundary, so which Registers may be
 * written is the Profile's answer rather than this Pane's.
 */
export function RegisterPane(props: PaneProps): React.JSX.Element {
  return <AddressSpacePane space="register" {...props} />;
}
