import { useId, useMemo, useState } from 'react';
import { DataForm } from '../../../maps/mapParser';
import { Button, cx } from '../../../ui';
import { entryWriteBlockReason } from '../../addressSpace';
import { isBindingDrifted } from '../../bindingResolver';
import { useMapEntries } from '../../useMapEntries';
import { parseEntryValue } from '../../valueParse';
import { useWidgetWrite } from '../../widgets/useWidgetWrite';
import type { ButtonWidgetConfig } from '../../widgets/widgetConfig';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import styles from './ButtonWidget.module.css';

/**
 * A fixed value, sent on click — to an address (a write) or a Command (a
 * send), per its target's own kind. Inherits the write path rather than
 * reimplementing it: `useWidgetWrite` is the same settling logic
 * `AddressSpacePane` and `CommandPane` use, so a rejected or failed send
 * reads exactly as plainly here as it does there.
 */
export function ButtonWidget({ config }: WidgetProps): React.JSX.Element {
  const { target, value, confirmationRequired } = config as ButtonWidgetConfig;
  const registerMap = useMapEntries('register');
  const parameterMap = useMapEntries('parameter');
  const { blockedReason, send, statusFor } = useWidgetWrite();
  const [confirming, setConfirming] = useState(false);
  const messageId = useId();

  const entry = useMemo(() => {
    if (target?.kind !== 'address') return null;
    const map = target.space === 'register' ? registerMap : parameterMap;
    return map.entries.find(candidate => candidate.address === target.address) ?? null;
  }, [target, registerMap, parameterMap]);

  /**
   * Drift, checked live the same way `useWidgetReading` checks a read
   * binding (`.scratch/map-binding-drift`, ticket 03) — a Button has no
   * `useWidgetReading` of its own to inherit this from, since its target is a
   * write-only `WidgetTarget`, not a `WidgetBinding`. Deliberately does not
   * gate on `entry` (the by-address lookup above): an earlier entry's
   * deletion or resize shifts every later address down, leaving the old one
   * genuinely vacant — a routine "moved" outcome `isBindingDrifted` still
   * catches, which a by-address-first check would misclassify as plain
   * "not found" instead. See `useWidgetReading.ts`'s own doc comment for
   * the same reasoning, pinned there first.
   */
  const needsReview = useMemo(() => {
    if (target?.kind !== 'address') return false;
    const map = target.space === 'register' ? registerMap : parameterMap;
    return isBindingDrifted(target.snapshot, target.address, map.entries);
  }, [target, registerMap, parameterMap]);

  if (target === null) {
    return <p className={styles.notice}>Not configured — pick a target to bind.</p>;
  }
  if (needsReview) {
    return <p className={styles.notice}>Needs review — the Map changed since this was bound.</p>;
  }
  if (target.kind === 'address' && entry === null) {
    return <p className={styles.notice}>Bound address is not in the active Map.</p>;
  }
  const entryReason = target.kind === 'address' && entry !== null ? entryWriteBlockReason(target.space, entry) : null;
  if (entryReason !== null) {
    return <p className={styles.notice}>{entryReason}</p>;
  }

  // The configured value is authored as a plain decimal number and encoded
  // through the same parser a typed field uses, so a float target's value
  // lands on the wire the same way a typed one would — one encoding rule, not
  // a second one for a Button's fixed value.
  const encoded = parseEntryValue(String(value), entry?.type ?? DataForm.INT, 'decimal');

  const status = statusFor(target);
  const reason = blockedReason ?? (encoded.ok === false ? encoded.error : null);
  const disabled = reason !== null || status.pending;

  const execute = (): void => {
    setConfirming(false);
    if (disabled || encoded.ok === false) return;
    send(target, encoded.raw);
  };

  const handleClick = (): void => {
    if (disabled) return;
    if (confirmationRequired && !confirming) {
      setConfirming(true);
      return;
    }
    execute();
  };

  const label = confirming ? 'Confirm?' : status.pending ? 'Sending…' : 'Send';

  return (
    <div className={styles.widget}>
      <Button
        variant={confirming ? 'danger' : 'primary'}
        className={styles.button}
        onClick={handleClick}
        onBlur={() => setConfirming(false)}
        disabled={disabled}
        aria-describedby={reason !== null || status.failure !== null ? messageId : undefined}
      >
        {label}
      </Button>
      {reason !== null || status.failure !== null ? (
        <span
          id={messageId}
          className={cx(styles.message, status.failure !== null && styles.failure)}
          role={status.failure !== null ? 'alert' : undefined}
        >
          {status.failure ?? reason}
        </span>
      ) : null}
    </div>
  );
}
