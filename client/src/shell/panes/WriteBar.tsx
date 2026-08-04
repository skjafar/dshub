import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { DataAccessPermit } from '../../maps/mapParser';
import type { MapEntry } from '../../maps/mapParser';
import { Button } from '../../ui';
import { editableEntryValue } from '../valueFormat';
import type { DisplayFormat } from '../valueFormat';
import { parseEntryValue } from '../valueParse';
import styles from './WriteBar.module.css';

export interface WriteBarProps {
  /** The selected entry. Writing is always aimed at exactly one. */
  readonly entry: MapEntry;
  /** Its live value, or null when it has never answered. */
  readonly value: number | null;
  readonly format: DisplayFormat;
  /** Null when writing is allowed; otherwise the reason it is not. */
  readonly blockedReason: string | null;
  readonly pending: boolean;
  /** What the transport or the Device said, when the last write failed. */
  readonly failure: string | null;
  /**
   * Bumped by the parent when a write succeeds, which is what returns the field
   * to following the Device.
   */
  readonly committed: number;
  readonly onWrite: (raw: number) => void;
}

/**
 * Writing one value to one entry.
 *
 * Deliberately not an editable cell in the table. A write reaches live hardware
 * and cannot be taken back, so the surface that sends one says out loud which
 * entry it is aimed at, what type that entry is, and what went wrong when
 * something does — none of which fits in a table cell, and all of which an
 * Operator standing next to a machine needs before pressing Enter.
 *
 * The typed value lives in this component's state, not in the DOM, and the live
 * value is only shown while nothing has been typed. Mirroring the Device on
 * *focus* instead is the bug this design exists to avoid: clicking a send button
 * blurs the field, so the mirror fired before the form submitted and wrote the
 * value already on the Device back to it — while pressing Enter, which never
 * blurs, wrote the new one. Two commit paths, two different values, no error.
 *
 * Both paths are the form's `submit`, so they are the same code and cannot
 * diverge again.
 */
export function WriteBar({
  entry,
  value,
  format,
  blockedReason,
  pending,
  failure,
  committed,
  onWrite,
}: WriteBarProps): React.JSX.Element {
  /**
   * What has been typed, and which commit it was typed against.
   *
   * Carrying the commit count means a successful write discards the draft by
   * derivation rather than by an effect that resets it — there is no render in
   * between where the field still shows a value that has already been sent.
   */
  const [editing, setEditing] = useState<{
    readonly text: string;
    readonly invalid: string | null;
    readonly at: number;
  } | null>(null);

  const active = editing !== null && editing.at === committed ? editing : null;
  const invalid = active?.invalid ?? null;

  // Tied to the field by id rather than merely sitting beside it, so the reason
  // a write was refused is announced with the field it belongs to.
  const messageId = useId();
  const message = invalid ?? failure ?? blockedReason;

  if (entry.accessPermit !== DataAccessPermit.READ_WRITE) {
    return (
      <p className={styles.readOnly}>
        <span className={styles.name}>{entry.name}</span> is read-only in this Profile’s Map.
      </p>
    );
  }

  // Seeded at editing precision, not display precision: a float register holding
  // 3.14159274 reads as "3.142" in the column, and a field started from that
  // would write 3.142 the moment Enter was pressed on a value nobody had touched.
  const shown =
    active?.text ?? (value === null ? '' : editableEntryValue(value, entry.type, format));
  const blocked = blockedReason !== null;

  const commit = (event: FormEvent): void => {
    event.preventDefault();
    if (blocked || pending) return;

    const result = parseEntryValue(shown, entry.type, format);
    // `result.ok === false` rather than `!result.ok`: this project compiles with
    // `strict: false`, where only the explicit comparison narrows the union.
    if (result.ok === false) {
      // The typed text is kept, so a value refused for being out of range can be
      // corrected rather than retyped from nothing.
      setEditing({ text: shown, invalid: result.error, at: committed });
      return;
    }
    setEditing({ text: shown, invalid: null, at: committed });
    onWrite(result.raw);
  };

  return (
    <form className={styles.bar} onSubmit={commit}>
      <div className={styles.target}>
        <span className={styles.label}>Write to</span>
        <span className={styles.name}>{entry.name}</span>
        <span className={styles.type}>{entry.type}</span>
      </div>

      <input
        className={styles.input}
        value={shown}
        onChange={event => setEditing({ text: event.target.value, invalid: null, at: committed })}
        onKeyDown={event => {
          // Escape abandons the edit and returns the field to the Device, so a
          // half-typed value is never left looking like the current one.
          if (event.key === 'Escape') setEditing(null);
        }}
        aria-label={`New value for ${entry.name}`}
        aria-invalid={invalid !== null || failure !== null ? true : undefined}
        aria-describedby={message !== null ? messageId : undefined}
        disabled={blocked}
        spellCheck={false}
        autoComplete="off"
      />

      <Button type="submit" variant="primary" size="sm" disabled={blocked || pending}>
        {pending ? 'Sending…' : 'Send'}
      </Button>

      {message !== null ? (
        <span
          id={messageId}
          className={invalid !== null || failure !== null ? styles.invalid : styles.blocked}
          role={invalid !== null || failure !== null ? 'alert' : undefined}
        >
          {message}
        </span>
      ) : null}
    </form>
  );
}
