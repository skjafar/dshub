import type { MapEntry } from '../../maps/mapParser';
import { Button, cx } from '../../ui';
import { ADDRESS_SPACE_ENTRY_NAME, accessLabel } from '../addressSpace';
import type { EntrySelection } from '../SelectionContext';
import { decodeValue, toHexAddress } from '../valueFormat';
import styles from './Inspector.module.css';

export interface InspectorProps {
  /** What was selected last, in any Pane. Null before anything has been. */
  readonly selection: EntrySelection | null;
  /**
   * The Map entry the selection names, or null when this Profile's Map no
   * longer declares it — which happens when the Profile is switched while a
   * selection is standing.
   */
  readonly entry: MapEntry | null;
  /** The last value read, or null when the entry has never answered. */
  readonly value: number | null;
  readonly valid: boolean;
  /** When that value arrived. Zero when nothing has. */
  readonly timestamp: number;
  /** True while readings are not being refreshed, whatever the reason. */
  readonly stale: boolean;
  readonly canRead: boolean;
  readonly onRead: () => void;
}

/** `HH:MM:SS` in 24-hour form; a reading's age is read, not compared. */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * One Pane that decodes whatever was selected last, anywhere.
 *
 * Every data surface used to embed its own copy of this, so the same decoding
 * was built three times and held a third of each surface's width whether or not
 * anything was selected. There is one now, and it follows the selection instead
 * of the selection being confined to the surface that made it.
 *
 * It states the Address Space alongside the address on purpose: address 2 exists
 * in all three spaces and means something different in each, so an address shown
 * without its space is not an identification.
 */
export function Inspector({
  selection,
  entry,
  value,
  valid,
  timestamp,
  stale,
  canRead,
  onRead,
}: InspectorProps): React.JSX.Element {
  if (selection === null) {
    return (
      <div className={styles.pane}>
        <p className={styles.empty}>
          Nothing selected. Choose a row in any data pane and it will be decoded here.
        </p>
      </div>
    );
  }

  if (entry === null) {
    return (
      <div className={styles.pane}>
        <p className={styles.empty}>
          Address {selection.address} is no longer declared in this Profile’s Map.
        </p>
      </div>
    );
  }

  const decoded = value === null ? null : decodeValue(value, entry.type);

  return (
    <div className={styles.pane}>
      <header className={styles.header}>
        <h2 className={styles.name}>{entry.name}</h2>
        <p className={styles.source}>
          {ADDRESS_SPACE_ENTRY_NAME[selection.space]} · selected in {selection.paneTitle}
        </p>
        {entry.description ? <p className={styles.description}>{entry.description}</p> : null}
      </header>

      <section className={styles.section} aria-labelledby="inspector-identity">
        <h3 className={styles.sectionTitle} id="inspector-identity">
          Identity
        </h3>
        <dl className={styles.rows}>
          <dt className={styles.label}>Address Space</dt>
          <dd className={styles.value}>{ADDRESS_SPACE_ENTRY_NAME[selection.space]}</dd>

          <dt className={styles.label}>Address</dt>
          <dd className={styles.mono}>
            {entry.address} · {toHexAddress(entry.address)}
          </dd>

          <dt className={styles.label}>Type</dt>
          <dd className={styles.mono}>{entry.type}</dd>

          <dt className={styles.label}>Access</dt>
          <dd className={styles.value}>{accessLabel(selection.space, entry)}</dd>

          {entry.unit ? (
            <>
              <dt className={styles.label}>Unit</dt>
              <dd className={styles.value}>{entry.unit}</dd>
            </>
          ) : null}

          {entry.isArray ? (
            <>
              <dt className={styles.label}>Array</dt>
              <dd className={styles.value}>element of {entry.arraySize}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="inspector-readings">
        <h3 className={styles.sectionTitle} id="inspector-readings">
          Readings
        </h3>

        {decoded === null ? (
          <p className={styles.empty}>Not read yet.</p>
        ) : (
          <dl className={cx(styles.rows, stale && styles.staleRows)}>
            <dt className={styles.label}>Decimal</dt>
            <dd className={styles.reading}>{decoded.decimal}</dd>

            <dt className={styles.label}>Hexadecimal</dt>
            <dd className={styles.mono}>{decoded.hexadecimal}</dd>

            <dt className={styles.label}>Binary</dt>
            <dd className={styles.bits}>{decoded.binary}</dd>

            <dt className={styles.label}>Float</dt>
            <dd className={styles.mono}>{decoded.float}</dd>
          </dl>
        )}

        {decoded !== null && !valid ? (
          <p className={styles.invalid}>
            The Device answered, but marked this reading invalid. Do not act on it.
          </p>
        ) : null}

        {decoded !== null && stale ? (
          <p className={styles.staleNote}>
            The link is down. This reading is from {formatTime(timestamp)} and is not current.
          </p>
        ) : null}

        {decoded !== null && !stale && timestamp > 0 ? (
          <p className={styles.readAt}>Read at {formatTime(timestamp)}</p>
        ) : null}
      </section>

      <Button size="sm" onClick={onRead} disabled={!canRead}>
        Read
      </Button>
    </div>
  );
}
