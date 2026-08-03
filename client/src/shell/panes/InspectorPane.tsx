import { useCallback, useEffect, useMemo } from 'react';
import { useDSHub } from '../../contexts/DSHubContext';
import type { ParameterData, RegisterData } from '../../types/shared';
import { useSelection } from '../SelectionContext';
import type { AddressSpace } from '../addressSpace';
import { isLive, isStale, linkStateOf } from '../linkState';
import type { PaneProps } from '../paneRegistry';
import { useMapEntries } from '../useMapEntries';
import { Inspector } from './Inspector';

/**
 * The Address Space to read the Map from when nothing is selected.
 *
 * `useMapEntries` is a hook and cannot be called conditionally, so it needs a
 * space even with no selection. Which one makes no difference — with nothing
 * selected the Inspector shows its empty state and never looks at the entries.
 */
const NO_SELECTION_SPACE: AddressSpace = 'register';

/** Where one Address Space's readings live, and how to ask for a fresh one. */
interface SpaceBinding {
  readonly readings: ReadonlyMap<number, RegisterData | ParameterData>;
  readonly read: (address: number, name: string) => void;
}

/**
 * Binds the Inspector to the selection, the Map and the Device.
 *
 * The three have to agree about which Address Space is being talked about: the
 * selection names one, the entry is looked up in that space's Map, and the value
 * comes from that space's readings. Reading any of the three from a different
 * space would decode one address's bits under another's name — which is exactly
 * what the space exists to prevent, so the binding is resolved once, by space,
 * rather than being re-derived at each use.
 */
export function InspectorPane({ setTitle }: PaneProps): React.JSX.Element {
  const { state, actions } = useDSHub();
  const { selection } = useSelection();
  const space = selection?.space ?? NO_SELECTION_SPACE;
  const map = useMapEntries(space);

  const bindings: Readonly<Record<AddressSpace, SpaceBinding>> = {
    register: { readings: state.registers, read: actions.readRegister },
    parameter: { readings: state.parameters, read: actions.readParameter },
    sysRegister: { readings: state.systemRegisters, read: actions.readSystemRegister },
  };
  const binding = bindings[space];

  const entry = useMemo(
    () => (selection === null ? null : map.entries.find(e => e.address === selection.address) ?? null),
    [map.entries, selection]
  );

  const reading = selection === null ? undefined : binding.readings.get(selection.address);
  const link = linkStateOf(state.connection, state.connecting);

  // The tab says what is being inspected, so a glance at the Workspace answers
  // "what is the Inspector showing" without making it the visible tab first.
  useEffect(() => {
    setTitle(entry === null ? 'Inspector' : `Inspector · ${entry.name}`);
  }, [setTitle, entry]);

  const handleRead = useCallback(() => {
    if (entry === null) return;
    binding.read(entry.address, entry.name);
  }, [binding, entry]);

  return (
    <Inspector
      selection={selection}
      entry={entry}
      value={reading?.value ?? null}
      valid={reading?.valid ?? true}
      timestamp={reading?.timestamp ?? 0}
      stale={reading !== undefined && isStale(link)}
      canRead={isLive(link) && entry !== null}
      onRead={handleRead}
    />
  );
}
