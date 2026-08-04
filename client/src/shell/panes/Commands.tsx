import { Table, TextField } from '../../ui';
import type { Column } from '../../ui';
import type { SysCommand } from '../../types/settings';
import { CommandSendBar } from './CommandSendBar';
import type { CommandSendBarProps } from './CommandSendBar';
import styles from './Commands.module.css';

/** Whether the active Profile has a Command catalogue to list at all. */
export type CatalogueStatus = 'unavailable' | 'ready';

export interface CommandsProps {
  /** This Pane's own filtered Commands, in the catalogue's order. */
  readonly commands: readonly SysCommand[];
  /** The catalogue's full size, unfiltered — for the status line and the empty state. */
  readonly totalCount: number;
  readonly status: CatalogueStatus;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** This Pane's own selected row. Another Pane's selection is not this one. */
  readonly selectedCode: number | null;
  readonly onSelect: (command: SysCommand) => void;
  /**
   * Everything the send bar needs; null when nothing is selected. Absent rather
   * than disabled: with no Command chosen there is nothing to send.
   */
  readonly send: CommandSendBarProps | null;
}

/**
 * Why there is nothing to list, in words that distinguish the reasons.
 *
 * No active Profile, a Profile that declares no Commands, and a search that
 * matched nothing all render as an empty table and call for three different
 * reactions — the last of those is left to the Table's own empty message, since
 * it is the only one a narrower search can fix.
 */
function catalogueNotice(status: CatalogueStatus, totalCount: number): string | null {
  if (status === 'unavailable') {
    return 'No Profile is active, so there is no Command catalogue to list.';
  }
  if (totalCount === 0) {
    // No call to action to a Map Editor here, matching `Entries.tsx`'s own
    // `mapNotice`: the rebuilt Workspace has no such surface yet (ticket 19),
    // so pointing at one would send an Engineer looking for something that
    // does not exist in this shell.
    return 'This Profile declares no Commands.';
  }
  return null;
}

/**
 * The active Profile's Commands: numbered instructions sent to the Device, as
 * distinct from writing a value to a Register or a Parameter.
 *
 * Listed by name so an Engineer works from the Profile's own vocabulary rather
 * than transcribing codes from a separate document — the code is still shown,
 * and is searchable, because a Profile that defines many Commands is used by
 * searching it rather than scrolling it.
 */
export function Commands({
  commands,
  totalCount,
  status,
  query,
  onQueryChange,
  selectedCode,
  onSelect,
  send,
}: CommandsProps): React.JSX.Element {
  const notice = catalogueNotice(status, totalCount);

  const columns: readonly Column<SysCommand>[] = [
    {
      key: 'code',
      header: 'Code',
      numeric: true,
      mono: true,
      width: '5.5rem',
      render: command => command.code,
    },
    {
      key: 'name',
      header: 'Name',
      render: command => <span className={styles.name}>{command.name}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      render: command => (
        <span className={styles.description}>{command.description ?? '—'}</span>
      ),
    },
  ];

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <h2 className={styles.heading}>Commands</h2>

        <div className={styles.filter}>
          <TextField
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Filter by name or code"
            aria-label="Filter commands by name or code"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>

      <p className={styles.status} role="status">
        <span>
          {commands.length} of {totalCount} commands
        </span>
      </p>

      <p className={styles.spaceDescription}>
        Numbered instructions the Device acts on, as distinct from writing a
        value.
      </p>

      {/* Keyed on the code, so selecting a different Command abandons a
          half-typed value rather than carrying it across to a Command it was
          never meant for. */}
      {send !== null ? <CommandSendBar key={send.command.code} {...send} /> : null}

      {notice !== null ? (
        <p className={styles.notice}>{notice}</p>
      ) : (
        <div className={styles.tableHost}>
          <Table
            columns={columns}
            rows={commands}
            rowKey={command => String(command.code)}
            selectedKey={selectedCode === null ? undefined : String(selectedCode)}
            onSelect={onSelect}
            emptyMessage={`No command matches “${query.trim()}”.`}
          />
        </div>
      )}
    </div>
  );
}
