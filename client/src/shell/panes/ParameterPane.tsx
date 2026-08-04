import { AddressSpacePane } from './AddressSpacePane';
import type { PaneProps } from '../paneRegistry';

/**
 * The Parameters of the active Profile's Map: configuration the Device keeps
 * across a power cycle.
 *
 * Writing is offered on the same terms as a Register — the same encoding
 * contracts, the same Control gate, the same confirmation from the Device — and
 * goes out over the Parameter command rather than the Register one. That
 * distinction is not cosmetic: address 0 exists in every space, so a Parameter
 * write sent as a Register write lands on a different word of firmware entirely
 * and reports success either way.
 *
 * A Parameter Map declares no read-only boundary, so every Parameter a Profile
 * declares is writable.
 */
export function ParameterPane(props: PaneProps): React.JSX.Element {
  return <AddressSpacePane space="parameter" {...props} />;
}
