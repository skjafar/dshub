import { useId } from 'react';
import type { MapEntry } from '../../maps/mapParser';
import { Button, Select, Switch, Table, TextField, cx } from '../../ui';
import type { Column } from '../../ui';
import {
  ADDRESS_SPACE_DESCRIPTION,
  ADDRESS_SPACE_ENTRY_NAME,
  ADDRESS_SPACE_NAME,
  ADDRESS_SPACE_READ_ONLY_REASON,
  accessLabel,
} from '../addressSpace';
import type { AddressSpace } from '../addressSpace';
import { isLive, isStale } from '../linkState';
import type { LinkState } from '../linkState';
import { DISPLAY_FORMATS, formatEntryValue } from '../valueFormat';
import type { DisplayFormat } from '../valueFormat';
import type { MapView } from '../useMapEntries';
import { WriteBar } from './WriteBar';
import type { WriteBarProps } from './WriteBar';
import styles from './Entries.module.css';

/** One Map entry beside whatever the Device last said about it. */
export interface EntryRow {
  readonly entry: MapEntry;
  /** The last value read, or null when this entry has never answered. */
  readonly value: number | null;
  /** False when the Device answered but the reading could not be trusted. */
  readonly valid: boolean;
}

export interface EntriesProps {
  /**
   * Which Address Space is being listed.
   *
   * Everything a person reads to identify what they are looking at comes from
   * this — the heading, the filter's label, the empty states, the access column
   * and whether writing is offered at all. A bare address is meaningless without
   * it, and two Panes docked side by side are two columns of bare addresses.
   */
  readonly space: AddressSpace;
  /** The entries this Pane is showing, already filtered. */
  readonly rows: readonly EntryRow[];
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly format: DisplayFormat;
  readonly onFormatChange: (format: DisplayFormat) => void;
  /** This Pane's own selected row. Another Pane's selection is not this one. */
  readonly selectedAddress: number | null;
  readonly onSelect: (entry: MapEntry) => void;
  readonly live: boolean;
  readonly onLiveChange: (live: boolean) => void;
  readonly onRead: () => void;
  readonly link: LinkState;
  /** The Map this Pane is listing, and whether it has arrived. */
  readonly map: MapView;
  /**
   * Everything the write bar needs; null when nothing is selected, and always
   * null in a space the protocol will not accept a write to. Absent rather than
   * disabled: with no entry chosen there is nothing to write to, and in a
   * read-only space there never will be.
   */
  readonly write: WriteBarProps | null;
}

const FORMAT_LABEL: Readonly<Record<DisplayFormat, string>> = {
  decimal: 'Decimal',
  hexadecimal: 'Hexadecimal',
  binary: 'Binary',
};

const FORMAT_OPTIONS = DISPLAY_FORMATS.map(format => ({
  value: format,
  label: FORMAT_LABEL[format],
}));

/**
 * Why there is nothing to list, in words that distinguish the reasons.
 *
 * A Map that has not loaded, a Profile that declares nothing in this space and a
 * filter that matched nothing all render as an empty table, and they call for
 * three different actions from whoever is looking at it. The space is named in
 * the last of them, because "declares no entries" leaves an Engineer wondering
 * which of the three Maps to go and look at.
 */
function mapNotice(space: AddressSpace, map: MapView): string | null {
  switch (map.status) {
    case 'loading':
      return 'Loading this Profile’s Map…';
    case 'unavailable':
      return 'No Profile is active, so there is no Map to list.';
    case 'failed':
      return map.error ?? 'This Profile’s Map could not be loaded.';
    default:
      return map.entries.length === 0
        ? `This Profile’s Map declares no ${ADDRESS_SPACE_NAME[space]}.`
        : null;
  }
}

/**
 * One Address Space's entries, with their current values.
 *
 * Entries are listed by the name the Map gives them rather than as bare
 * addresses, because an address is only meaningful alongside the space it
 * belongs to and the declaration of what lives there. Type and access sit beside
 * the name for the same reason: they are what say whether a reading means what
 * it appears to and whether writing to it is even permitted.
 *
 * The same component serves all three spaces. Where they differ — what they are
 * called, what they list, and whether they can be written — the difference is
 * made visible rather than kept internal, since an Engineer reading an address
 * off one of two docked Panes has to know which space it belongs to.
 */
export function Entries({
  space,
  rows,
  query,
  onQueryChange,
  format,
  onFormatChange,
  selectedAddress,
  onSelect,
  live,
  onLiveChange,
  onRead,
  link,
  map,
  write,
}: EntriesProps): React.JSX.Element {
  const liveId = useId();
  const stale = isStale(link);
  const connected = isLive(link);
  const notice = mapNotice(space, map);
  const spaceName = ADDRESS_SPACE_NAME[space];
  const entryName = ADDRESS_SPACE_ENTRY_NAME[space].toLowerCase();
  const readOnlyReason = ADDRESS_SPACE_READ_ONLY_REASON[space];

  const columns: readonly Column<EntryRow>[] = [
    {
      key: 'address',
      header: 'Addr',
      numeric: true,
      mono: true,
      width: '5.5rem',
      render: row => row.entry.address,
    },
    {
      key: 'name',
      header: 'Name',
      render: row => <span className={styles.name}>{row.entry.name}</span>,
    },
    {
      // Beside the name rather than at the far end of the row. A Pane docked
      // into a quarter of the window is narrower than this table wants to be,
      // and whatever sits last is what gets scrolled out of sight — which must
      // not be the reading the Pane exists to show.
      key: 'value',
      header: 'Value',
      numeric: true,
      mono: true,
      render: row => {
        if (row.value === null) {
          // Never read is not the same as read and found to be zero, and a
          // column of zeroes for a Device nobody has asked anything is the most
          // confident possible way to say nothing.
          return <span className={styles.unread}>—</span>;
        }
        if (!row.valid) {
          return <span className={styles.invalid}>invalid</span>;
        }
        return (
          <span className={cx(stale && styles.staleValue)}>
            {formatEntryValue(row.value, row.entry.type, format)}
          </span>
        );
      },
    },
    {
      key: 'type',
      header: 'Type',
      width: '6rem',
      render: row => <span className={styles.meta}>{row.entry.type}</span>,
    },
    {
      key: 'access',
      header: 'Access',
      width: '6.5rem',
      render: row => <span className={styles.meta}>{accessLabel(space, row.entry)}</span>,
    },
  ];

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        {/* The space, stated in the Pane and not only on its tab. A tab
            truncates, and the Pane being read need not be the one whose tab is
            in view — while the addresses in this table mean something different
            in each of the three spaces. */}
        <h2 className={styles.space}>{spaceName}</h2>

        <div className={styles.filter}>
          <TextField
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Filter by name or address (0x2A)"
            aria-label={`Filter ${spaceName.toLowerCase()} by name or address`}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <Select
          value={format}
          onValueChange={onFormatChange}
          options={FORMAT_OPTIONS}
          aria-label="Value display format"
        />

        <Button size="sm" onClick={onRead} disabled={!connected || rows.length === 0}>
          Read
        </Button>

        <span className={styles.liveToggle}>
          <label className={styles.liveLabel} htmlFor={liveId}>
            Live
          </label>
          <Switch
            id={liveId}
            checked={live}
            onCheckedChange={onLiveChange}
            disabled={!connected}
          />
        </span>
      </div>

      <p className={styles.status} role="status">
        <span>
          {rows.length} of {map.entries.length} {spaceName.toLowerCase()}
        </span>
        {live && connected ? (
          <span className={styles.liveNote}>live · following {rows.length}</span>
        ) : null}
        {stale ? (
          <span className={styles.staleNote}>
            {link === 'reconnecting'
              ? 'The Device stopped answering. Every value below is from before the link dropped.'
              : 'Disconnected. Nothing below is being updated.'}
          </span>
        ) : null}
        {link === 'no device' ? (
          <span className={styles.idleNote}>Connect from the chrome above to read values.</span>
        ) : null}
      </p>

      {readOnlyReason !== null ? (
        // Standing, rather than raised when someone tries to write. The missing
        // write bar is what this Pane is *for*, and a surface that simply lacks
        // a control reads as one that forgot it.
        <p className={styles.readOnlySpace}>{readOnlyReason}</p>
      ) : (
        // A quieter, symmetric line for the two writable spaces: what a
        // Register write changes and what a Parameter write changes look
        // identical on screen, and only this line says a Parameter's outlives
        // the session it was written in.
        <p className={styles.spaceDescription}>{ADDRESS_SPACE_DESCRIPTION[space]}</p>
      )}

      {/* Keyed on the entry, so selecting a different one abandons a half-typed
          value rather than carrying it across to an entry it was never meant
          for. */}
      {write !== null ? <WriteBar key={write.entry.address} {...write} /> : null}

      {notice !== null ? (
        <p className={styles.notice}>{notice}</p>
      ) : (
        <div className={styles.tableHost}>
          <Table
            columns={columns}
            rows={rows}
            rowKey={row => String(row.entry.address)}
            selectedKey={selectedAddress === null ? undefined : String(selectedAddress)}
            onSelect={row => onSelect(row.entry)}
            emptyMessage={`No ${entryName} matches “${query.trim()}”.`}
          />
        </div>
      )}
    </div>
  );
}
