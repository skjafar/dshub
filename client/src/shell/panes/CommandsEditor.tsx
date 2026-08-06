import { useState } from 'react';
import { DownloadSimple, Plus, Trash } from '@phosphor-icons/react';
import type { SysCommand } from '../../types/settings';
import { Button, TextField, cx } from '../../ui';
import styles from './CommandsEditor.module.css';

export interface CommandsEditorProps {
  readonly commands: readonly SysCommand[];
  readonly readOnly: boolean;
  readonly onAdd: () => void;
  readonly onChange: (index: number, patch: Partial<SysCommand>) => void;
  readonly onDelete: (index: number) => void;
  readonly onExportMap: () => void;
  readonly onExportHeader: () => void;
  /** The last edit the draft refused — a code colliding with another Command or a built-in one. */
  readonly error: string | null;
}

interface CommandRowProps {
  readonly command: SysCommand;
  readonly index: number;
  readonly readOnly: boolean;
  readonly onChange: (patch: Partial<SysCommand>) => void;
  readonly onDelete: () => void;
}

/**
 * One Command's row.
 *
 * The code field holds its own draft, `null` while not being edited — the
 * same shape `MapEntriesEditor`'s row fields use, and for the same reason: a
 * code the draft refuses (a collision, one reserved for `DS_SYS_COMMANDS`)
 * leaves the Command unchanged, and committing on every keystroke would
 * otherwise leave the rejected digits standing as if they had taken.
 */
function CommandRow({ command, index, readOnly, onChange, onDelete }: CommandRowProps): React.JSX.Element {
  const [codeDraft, setCodeDraft] = useState<string | null>(null);

  const commitCode = (): void => {
    const draft = codeDraft;
    setCodeDraft(null);
    if (draft === null) return;
    const parsed = Number.parseInt(draft, 10);
    if (Number.isFinite(parsed) && parsed !== command.code) onChange({ code: parsed });
  };

  return (
    <tr className={styles.row}>
      <td className={cx(styles.td, styles.numeric)}>
        <TextField
          aria-label={`Code for command ${index + 1}`}
          mono
          inputMode="numeric"
          value={codeDraft ?? String(command.code)}
          readOnly={readOnly}
          onChange={e => setCodeDraft(e.target.value)}
          onBlur={commitCode}
        />
      </td>
      <td className={styles.td}>
        <TextField
          aria-label={`Name for command ${index + 1}`}
          mono
          value={command.name}
          readOnly={readOnly}
          onChange={e => onChange({ name: e.target.value.toUpperCase() })}
        />
      </td>
      <td className={styles.td}>
        <TextField
          aria-label={`Description for command ${index + 1}`}
          value={command.description ?? ''}
          readOnly={readOnly}
          onChange={e => onChange({ description: e.target.value || undefined })}
        />
      </td>
      <td className={cx(styles.td, styles.actions)}>
        {!readOnly ? (
          <Button variant="ghost" size="sm" aria-label={`Delete command ${index + 1}`} onClick={onDelete}>
            <Trash size={14} />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * The active Profile's Commands, editable by code, name and description.
 *
 * Order carries no meaning here the way it does for a Register's address —
 * `sysCommandFileGenerator` sorts by code at export time — so there is no
 * drag handle and no boundary to protect, unlike `MapEntriesEditor`. A code
 * is still exclusive, though: two Commands sharing one would be
 * indistinguishable on the wire, since `CommandPane` sends by code alone.
 */
export function CommandsEditor({
  commands,
  readOnly,
  onAdd,
  onChange,
  onDelete,
  onExportMap,
  onExportHeader,
  error,
}: CommandsEditorProps): React.JSX.Element {
  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <Button size="sm" onClick={onAdd} disabled={readOnly}>
          <Plus size={14} /> Add command
        </Button>
        <Button size="sm" variant="secondary" onClick={onExportMap} disabled={commands.length === 0}>
          <DownloadSimple size={14} /> Export .map
        </Button>
        <Button size="sm" variant="secondary" onClick={onExportHeader} disabled={commands.length === 0}>
          <DownloadSimple size={14} /> Export header
        </Button>
      </div>

      {error !== null ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.tableHost}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={cx(styles.th, styles.numeric)}>Code</th>
              <th className={styles.th}>Name</th>
              <th className={styles.th}>Description</th>
              <th className={styles.th} aria-hidden />
            </tr>
          </thead>
          <tbody>
            {commands.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={4}>
                  No Commands yet. Add one to get started.
                </td>
              </tr>
            ) : (
              commands.map((command, index) => (
                // Keyed by position: a Command's code is itself an editable
                // field here, so it cannot double as a stable key the way it
                // does when only read in `CommandPane`.
                <CommandRow
                  key={index}
                  command={command}
                  index={index}
                  readOnly={readOnly}
                  onChange={patch => onChange(index, patch)}
                  onDelete={() => onDelete(index)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
