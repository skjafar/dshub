import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, cx } from '../../../ui';
import { ADDRESS_SPACE_READ_ONLY_REASON, entryWriteBlockReason } from '../../addressSpace';
import { editableEntryValue } from '../../valueFormat';
import { parseEntryValue } from '../../valueParse';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import { useWidgetWrite } from '../../widgets/useWidgetWrite';
import type { ValueWriteWidgetConfig, WidgetTarget } from '../../widgets/widgetConfig';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { WidgetStatusNotice } from './WidgetStatusNotice';
import styles from './ValueWriteWidget.module.css';

/**
 * One typed value, written to the address it mirrors — the Widget-sized
 * equivalent of `WriteBar`, carrying the exact same contract: the typed value
 * lives in this component's state rather than the DOM, a live reading is
 * shown only while nothing has been typed, and Enter and the Send button both
 * go through this one form's `submit`, so the two commit paths cannot diverge
 * into different values. See `WriteBar.tsx` for the failure this shape
 * prevents — mirroring the Device on *focus* instead of on an untouched field
 * lets a click-triggered blur write the Device's own value back to it.
 */
export function ValueWriteWidget({ config }: WidgetProps): React.JSX.Element {
  const { binding, format, confirmationRequired } = config as ValueWriteWidgetConfig;
  const reading = useWidgetReading(binding, format);
  const { blockedReason, send, statusFor } = useWidgetWrite();

  const [editing, setEditing] = useState<{ readonly text: string; readonly invalid: string | null; readonly at: number } | null>(null);
  const [committed, setCommitted] = useState(0);
  const [confirming, setConfirming] = useState<number | null>(null);
  const wasPending = useRef(false);
  const messageId = useId();

  // Derived from `binding` rather than from `reading.entry`, so this is
  // available — and the settle effect below can be called — before the
  // unbound/not-found guard, which every hook in this component must sit
  // above.
  const target: WidgetTarget | null =
    binding !== null && (binding.space === 'register' || binding.space === 'parameter')
      ? { kind: 'address', space: binding.space, address: binding.address }
      : null;
  const status = target ? statusFor(target) : { pending: false, failure: null };

  /**
   * A write that just settled with no failure is what returns the field to
   * mirroring the Device. An effect rather than a derivation, matching
   * `AddressSpacePane`'s own write-settling effect: it has to fire exactly
   * once per settle rather than on every render past it.
   */
  useEffect(() => {
    if (wasPending.current && !status.pending && status.failure === null) {
      setCommitted(count => count + 1);
    }
    wasPending.current = status.pending;
  }, [status.pending, status.failure]);

  if (binding === null) return <WidgetStatusNotice status="unbound" />;
  if (reading.entry === null) return <WidgetStatusNotice status="not-found" />;
  const entry = reading.entry;

  const entryReason = entryWriteBlockReason(binding.space, entry);
  if (entryReason !== null || target === null) {
    // `target` is only null here when `entryReason` already named the space's
    // own reason — entryWriteBlockReason checks the space before the entry —
    // so this fallback is unreachable in practice; it exists to narrow
    // `target` to non-null below without asserting past the type checker.
    return <p className={styles.readOnly}>{entryReason ?? ADDRESS_SPACE_READ_ONLY_REASON[binding.space]}</p>;
  }

  const active = editing !== null && editing.at === committed ? editing : null;
  const invalid = active?.invalid ?? null;
  const message = invalid ?? status.failure ?? blockedReason;
  const blocked = blockedReason !== null;

  const shown = active?.text ?? (reading.status === 'ready' && reading.raw !== null ? editableEntryValue(reading.raw, entry.type, format) : '');

  const execute = (raw: number): void => {
    setConfirming(null);
    send(target, raw);
  };

  const commit = (event: FormEvent): void => {
    event.preventDefault();
    if (blocked || status.pending) return;

    const result = parseEntryValue(shown, entry.type, format);
    if (result.ok === false) {
      setEditing({ text: shown, invalid: result.error, at: committed });
      return;
    }
    setEditing({ text: shown, invalid: null, at: committed });

    if (confirmationRequired) {
      setConfirming(result.raw);
      return;
    }
    execute(result.raw);
  };

  return (
    <div className={styles.widget}>
      <form className={styles.bar} onSubmit={commit}>
        <input
          className={styles.input}
          value={shown}
          onChange={event => setEditing({ text: event.target.value, invalid: null, at: committed })}
          onKeyDown={event => {
            if (event.key === 'Escape') setEditing(null);
          }}
          aria-label={config.label}
          aria-invalid={invalid !== null || status.failure !== null ? true : undefined}
          aria-describedby={message !== null ? messageId : undefined}
          disabled={blocked}
          spellCheck={false}
          autoComplete="off"
        />
        <Button type="submit" variant="primary" size="sm" disabled={blocked || status.pending}>
          {status.pending ? 'Sending…' : 'Send'}
        </Button>
      </form>

      {confirming !== null ? (
        <div className={styles.confirmBar}>
          <span className={styles.confirmText}>Write this value to {entry.name}?</span>
          <Button size="sm" variant="primary" onClick={() => execute(confirming)}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {message !== null ? (
        <span
          id={messageId}
          className={cx(styles.message, (invalid !== null || status.failure !== null) && styles.failure)}
          role={invalid !== null || status.failure !== null ? 'alert' : undefined}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
