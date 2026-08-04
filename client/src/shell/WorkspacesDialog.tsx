import { useEffect, useState } from 'react';
import { Check, FloppyDisk, PencilSimple, TrashSimple, X } from '@phosphor-icons/react';
import { Button, Dialog, TextField, cx } from '../ui';
import type { StoredWorkspace } from './workspaceStore';
import styles from './WorkspacesDialog.module.css';

export interface WorkspacesDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly workspaces: readonly StoredWorkspace[];
  readonly activeWorkspaceId: string;
  readonly defaultWorkspaceId: string;
  readonly onSwitch: (id: string) => void;
  readonly onSaveAs: (name: string) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
}

interface WorkspaceRowProps {
  readonly workspace: StoredWorkspace;
  readonly active: boolean;
  readonly isDefault: boolean;
  readonly onSwitch: () => void;
  readonly onRename: (name: string) => void;
  readonly onDelete: () => void;
}

/** How long an armed delete stays armed before it resets, in case blur never fires. */
const DELETE_ARM_TIMEOUT_MS = 3000;

/**
 * A row's own interaction state.
 *
 * Renaming and an armed delete are mutually exclusive — a row is never both
 * at once — so one discriminated field says so, rather than two booleans
 * whose disallowed fourth combination has to be reasoned about separately.
 */
type RowMode =
  | { readonly kind: 'view' }
  | { readonly kind: 'editing'; readonly draft: string }
  | { readonly kind: 'armed' };

const VIEW_MODE: RowMode = { kind: 'view' };

function WorkspaceRow({ workspace, active, isDefault, onSwitch, onRename, onDelete }: WorkspaceRowProps): React.JSX.Element {
  const [mode, setMode] = useState<RowMode>(VIEW_MODE);

  useEffect(() => {
    if (mode.kind !== 'armed') return;
    const timer = setTimeout(() => setMode(VIEW_MODE), DELETE_ARM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [mode.kind]);

  const commitRename = (draft: string): void => {
    const trimmed = draft.trim();
    if (trimmed !== '' && trimmed !== workspace.name) onRename(trimmed);
    setMode(VIEW_MODE);
  };

  if (mode.kind === 'editing') {
    return (
      <div className={styles.row}>
        <TextField
          aria-label={`Rename ${workspace.name}`}
          autoFocus
          value={mode.draft}
          onChange={e => setMode({ kind: 'editing', draft: e.target.value })}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename(mode.draft);
            if (e.key === 'Escape') setMode(VIEW_MODE);
          }}
        />
        <Button variant="ghost" size="sm" aria-label="Save name" onClick={() => commitRename(mode.draft)}>
          <Check size={14} weight="bold" />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Cancel rename" onClick={() => setMode(VIEW_MODE)}>
          <X size={14} />
        </Button>
      </div>
    );
  }

  const armed = mode.kind === 'armed';

  return (
    <div className={styles.row}>
      <button type="button" className={cx(styles.name, active && styles.active)} onClick={onSwitch}>
        <span className={styles.activeMark}>
          {active ? <Check size={14} weight="bold" /> : null}
        </span>
        <span className={styles.nameText}>{workspace.name}</span>
        {isDefault ? <span className={styles.defaultTag}>Default</span> : null}
      </button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Rename ${workspace.name}`}
        onClick={() => setMode({ kind: 'editing', draft: workspace.name })}
      >
        <PencilSimple size={14} />
      </Button>
      <Button
        variant={armed ? 'danger' : 'ghost'}
        size="sm"
        aria-label={armed ? `Confirm deleting ${workspace.name}` : `Delete ${workspace.name}`}
        disabled={isDefault}
        onClick={() => (armed ? onDelete() : setMode({ kind: 'armed' }))}
        onBlur={() => setMode(VIEW_MODE)}
      >
        <TrashSimple size={14} />
        {armed ? 'Confirm?' : null}
      </Button>
    </div>
  );
}

/**
 * Manages named Workspaces: save the current arrangement, switch, rename or
 * delete one.
 *
 * A dialog rather than a menu, because renaming and deleting both need a
 * second control per row — a Radix menu item expects to be the one thing a
 * click on it does, and stacking a text field and two icon buttons inside one
 * fights that rather than using it.
 */
export function WorkspacesDialog({
  open,
  onOpenChange,
  workspaces,
  activeWorkspaceId,
  defaultWorkspaceId,
  onSwitch,
  onSaveAs,
  onRename,
  onDelete,
}: WorkspacesDialogProps): React.JSX.Element {
  const [newName, setNewName] = useState('');

  // Starts blank every time the dialog opens, so a name typed and abandoned
  // last time is never accidentally saved this time.
  useEffect(() => {
    if (open) setNewName('');
  }, [open]);

  const handleSaveAs = (): void => {
    const trimmed = newName.trim();
    if (trimmed === '') return;
    onSaveAs(trimmed);
    setNewName('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Workspaces"
      description="Save the current arrangement as a new Workspace, or switch, rename and delete the ones you have."
    >
      <div className={styles.body}>
        <div className={styles.saveRow}>
          <TextField
            label="Save current arrangement as"
            placeholder="Debug layout"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveAs();
            }}
          />
          <Button variant="primary" onClick={handleSaveAs} disabled={newName.trim() === ''}>
            <FloppyDisk size={14} />
            Save as New
          </Button>
        </div>

        <div className={styles.list}>
          {workspaces.map(workspace => (
            <WorkspaceRow
              key={workspace.id}
              workspace={workspace}
              active={workspace.id === activeWorkspaceId}
              isDefault={workspace.id === defaultWorkspaceId}
              onSwitch={() => {
                onSwitch(workspace.id);
                onOpenChange(false);
              }}
              onRename={name => onRename(workspace.id, name)}
              onDelete={() => onDelete(workspace.id)}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
