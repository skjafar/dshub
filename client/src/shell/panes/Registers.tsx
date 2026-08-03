import { useId } from 'react';
import type { MapEntry } from '../../maps/mapParser';
import { Button, Select, Switch, Table, TextField, cx } from '../../ui';
import type { Column } from '../../ui';
import { ADDRESS_SPACE_NAME, accessLabel } from '../addressSpace';
import { isLive, isStale } from '../linkState';
import type { LinkState } from '../linkState';
import { DISPLAY_FORMATS, formatEntryValue } from '../valueFormat';
import type { DisplayFormat } from '../valueFormat';
import type { MapView } from '../useMapEntries';
import styles from './Registers.module.css';

/** One Map entry beside whatever the Device last said about it. */
export interface RegisterRow {
  readonly entry: MapEntry;
  /** The last value read, or null when this entry has never answered. */
  readonly value: number | null;
  /** False when the Device answered but the reading could not be trusted. */
  readonly valid: boolean;
}

export interface RegistersProps {
  /** The entries this Pane is showing, already filtered. */
  readonly rows: readonly RegisterRow[];
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly format: DisplayFormat;
  readonly onFormatChange: (format: DisplayFormat) => void;
  /** This Pane's own selected row. Another Pane's selection is not this one. */
  readonly selectedAddress: number | null;
  readonly onSelect: (entry: MapEntry) => void;
  readonly live: boolean;
  readonly onLiveChange: (live: boolean) => void;
  /**
   * How many of `rows` this Pane will actually read, which is fewer than all of
   * them once the filter is wide. The link answers one request at a time, so
   * this is a real limit rather than a rendering one.
   */
  readonly followedCount: number;
  readonly onRead: () => void;
  readonly link: LinkState;
  /** The Map this Pane is listing, and whether it has arrived. */
  readonly map: MapView;
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
 * A Map that has not loaded, a Profile that declares no Registers and a filter
 * that matched nothing all render as an empty table, and they call for three
 * different actions from whoever is looking at it.
 */
function mapNotice(map: MapView): string | null {
  switch (map.status) {
    case 'loading':
      return 'Loading this Profile’s Map…';
    case 'unavailable':
      return 'No Profile is active, so there is no Map to list.';
    case 'failed':
      return map.error ?? 'This Profile’s Map could not be loaded.';
    default:
      return map.entries.length === 0 ? 'This Profile’s Map declares no Registers.' : null;
  }
}

/**
 * The Registers of the active Profile's Map, with their current values.
 *
 * Entries are listed by the name the Map gives them rather than as bare
 * addresses, because an address is only meaningful alongside the space it
 * belongs to and the declaration of what lives there. Type and access sit beside
 * the name for the same reason: they are what say whether a reading means what
 * it appears to and whether writing to it is even permitted.
 */
export function Registers({
  rows,
  query,
  onQueryChange,
  format,
  onFormatChange,
  selectedAddress,
  onSelect,
  live,
  onLiveChange,
  followedCount,
  onRead,
  link,
  map,
}: RegistersProps): React.JSX.Element {
  const liveId = useId();
  const stale = isStale(link);
  const connected = isLive(link);
  const notice = mapNotice(map);

  const columns: readonly Column<RegisterRow>[] = [
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
      render: row => <span className={styles.meta}>{accessLabel(row.entry)}</span>,
    },
  ];

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <div className={styles.filter}>
          <TextField
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Filter by name or address (0x2A)"
            aria-label="Filter registers by name or address"
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
          {rows.length} of {map.entries.length} {ADDRESS_SPACE_NAME.register.toLowerCase()}
        </span>
        {live && connected ? (
          <span className={styles.liveNote}>live · following {followedCount}</span>
        ) : null}
        {connected && followedCount < rows.length ? (
          // Said out loud rather than silently truncated. The link answers one
          // request at a time, so a Pane that quietly read the first fifty of
          // four hundred would leave the rest showing a dash that reads as "the
          // Device has nothing to say" rather than "nobody asked".
          <span className={styles.capNote}>
            Only the first {followedCount} are read — narrow the filter to reach the rest.
          </span>
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
            emptyMessage={`No register matches “${query.trim()}”.`}
          />
        </div>
      )}
    </div>
  );
}
