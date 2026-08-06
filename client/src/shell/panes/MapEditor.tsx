import { FloppyDisk } from '@phosphor-icons/react';
import { Button, TabPanel, Tabs } from '../../ui';
import type { TabDefinition } from '../../ui';
import { CommandsEditor } from './CommandsEditor';
import type { CommandsEditorProps } from './CommandsEditor';
import { MapEntriesEditor } from './MapEntriesEditor';
import type { MapEntriesEditorProps } from './MapEntriesEditor';
import styles from './MapEditor.module.css';

export type MapEditorTab = 'registers' | 'parameters' | 'commands';

export interface MapEditorProps {
  readonly tab: MapEditorTab;
  readonly onTabChange: (tab: MapEditorTab) => void;
  /** The Profile being edited, or null before one has loaded. */
  readonly profileName: string | null;
  readonly readOnly: boolean;
  /** Why editing is unavailable, stated rather than left to a missing Save button to imply. Null when editable. */
  readonly readOnlyReason: string | null;
  readonly dirty: boolean;
  readonly onSave: () => void;
  readonly onReset: () => void;
  readonly registers: MapEntriesEditorProps;
  readonly parameters: MapEntriesEditorProps;
  readonly commands: CommandsEditorProps;
}

/**
 * Editing a Profile's Map as a Pane, alongside the Registers those entries
 * name — revising a name, a type or an access setting while watching the
 * value it produces is exactly what the full-screen editor it replaces made
 * impossible.
 *
 * System Registers are absent: they are library-managed and read-only from
 * the protocol regardless of what any Map claims (`addressSpace.ts`), so
 * there is nothing here for them to edit.
 */
export function MapEditor({
  tab,
  onTabChange,
  profileName,
  readOnly,
  readOnlyReason,
  dirty,
  onSave,
  onReset,
  registers,
  parameters,
  commands,
}: MapEditorProps): React.JSX.Element {
  const tabs: readonly TabDefinition<MapEditorTab>[] = [
    { value: 'registers', label: `Registers (${registers.entries.length})` },
    { value: 'parameters', label: `Parameters (${parameters.entries.length})` },
    { value: 'commands', label: `Commands (${commands.commands.length})` },
  ];

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Map Editor</h2>
        <span className={styles.profileName}>{profileName ?? 'No Profile active'}</span>
        <span className={styles.spacer} />
        {dirty ? <span className={styles.dirty}>Unsaved changes</span> : null}
        <Button size="sm" variant="ghost" onClick={onReset} disabled={!dirty}>
          Reset
        </Button>
        <Button size="sm" variant="primary" onClick={onSave} disabled={!dirty || readOnly}>
          <FloppyDisk size={14} /> Save
        </Button>
      </div>

      {readOnlyReason !== null ? <p className={styles.readOnlyNotice}>{readOnlyReason}</p> : null}

      <Tabs value={tab} onValueChange={onTabChange} tabs={tabs} aria-label="Map Editor section">
        <TabPanel value="registers">
          <MapEntriesEditor {...registers} />
        </TabPanel>
        <TabPanel value="parameters">
          <MapEntriesEditor {...parameters} />
        </TabPanel>
        <TabPanel value="commands">
          <CommandsEditor {...commands} />
        </TabPanel>
      </Tabs>
    </div>
  );
}
