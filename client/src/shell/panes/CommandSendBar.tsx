import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { DataForm } from '../../maps/mapParser';
import { Button } from '../../ui';
import { parseEntryValue } from '../valueParse';
import type { SysCommand } from '../../types/settings';
import styles from './CommandSendBar.module.css';

export interface CommandSendBarProps {
  /** The selected Command. Sending is always aimed at exactly one. */
  readonly command: SysCommand;
  /** Null when sending is allowed; otherwise the reason it is not. */
  readonly blockedReason: string | null;
  readonly pending: boolean;
  /** What the transport or the Device said, when the last send failed. */
  readonly failure: string | null;
  readonly onSend: (value: number) => void;
}

/**
 * Sending one Command, with an optional value parameter.
 *
 * Unlike {@link ../panes/WriteBar}, there is no Device value to mirror: a
 * Command is an instruction, not a reading, so nothing external ever overwrites
 * what has been typed here. The value parameter is signed decimal always — the
 * protocol carries it as `i32` and a Command has no Map-declared type to read a
 * notation from.
 */
export function CommandSendBar({
  command,
  blockedReason,
  pending,
  failure,
  onSend,
}: CommandSendBarProps): React.JSX.Element {
  const [text, setText] = useState('0');
  const [invalid, setInvalid] = useState<string | null>(null);

  // Tied to the field by id rather than merely sitting beside it, so the reason
  // a Command was refused is announced with the field it belongs to.
  const messageId = useId();
  const message = invalid ?? failure ?? blockedReason;
  const blocked = blockedReason !== null;

  const commit = (event: FormEvent): void => {
    event.preventDefault();
    if (blocked || pending) return;

    const result = parseEntryValue(text, DataForm.INT, 'decimal');
    // `result.ok === false` rather than `!result.ok`: this project compiles with
    // `strict: false`, where only the explicit comparison narrows the union.
    if (result.ok === false) {
      setInvalid(result.error);
      return;
    }
    setInvalid(null);
    onSend(result.raw);
  };

  return (
    <form className={styles.bar} onSubmit={commit}>
      <div className={styles.target}>
        <span className={styles.label}>Send</span>
        <span className={styles.name}>{command.name}</span>
        <span className={styles.code}>code {command.code}</span>
      </div>

      <input
        className={styles.input}
        value={text}
        onChange={event => {
          setText(event.target.value);
          setInvalid(null);
        }}
        aria-label={`Value for ${command.name}`}
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
