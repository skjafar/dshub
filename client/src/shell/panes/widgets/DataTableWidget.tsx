import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { PaperPlaneRight } from '@phosphor-icons/react';
import { cx } from '../../../ui';
import { entryWriteBlockReason } from '../../addressSpace';
import { editableEntryValue } from '../../valueFormat';
import { parseEntryValue } from '../../valueParse';
import { evaluateThresholds } from '../../widgets/threshold';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import { useWidgetWrite } from '../../widgets/useWidgetWrite';
import type { DataTableRow, DataTableWidgetConfig, WidgetTarget } from '../../widgets/widgetConfig';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { roleClassMap } from './statusRoleClass';
import { rowStatusText } from './rowStatusText';
import styles from './DataTableWidget.module.css';

const ROLE_CLASS = roleClassMap(styles);

/**
 * One row: its own binding, its own reading, its own write cell where
 * writable. A row is its own component rather than a loop body inside
 * `DataTableWidget` because `useWidgetReading`/`useWidgetWrite` are hooks —
 * a variable-length `rows` array can only call them once per row by giving
 * each row its own component instance, the same reason `AlarmRow` and the
 * Control family's per-target handling are each their own instance.
 *
 * The write cell inherits `ValueWriteWidget`'s exact contract rather than a
 * simplified one: the typed value lives in this component's state, a live
 * reading mirrors it only while nothing has been typed, and Enter and the
 * Send button both go through this one form's `submit` — this is the surface
 * the legacy `DataTableWriteCell` regression test was written against, and
 * the mid-edit guard (`committed`, advanced only once a send actually
 * settles) is what that test pins.
 */
function DataTableRowView({ row }: { readonly row: DataTableRow }): React.JSX.Element {
  const reading = useWidgetReading(row.binding, row.format);
  const { blockedReason, send, statusFor } = useWidgetWrite();

  const [editing, setEditing] = useState<{ readonly text: string; readonly invalid: string | null; readonly at: number } | null>(null);
  const [committed, setCommitted] = useState(0);
  const wasPending = useRef(false);
  const messageId = useId();

  const target: WidgetTarget | null =
    row.binding !== null && (row.binding.space === 'register' || row.binding.space === 'parameter')
      ? { kind: 'address', space: row.binding.space, address: row.binding.address }
      : null;
  const status = target ? statusFor(target) : { pending: false, failure: null };

  useEffect(() => {
    if (wasPending.current && !status.pending && status.failure === null) {
      setCommitted(count => count + 1);
    }
    wasPending.current = status.pending;
  }, [status.pending, status.failure]);

  const entry = reading.entry;
  const writable = target !== null && entry !== null && entryWriteBlockReason(target.space, entry) === null;

  const role =
    reading.status === 'ready' && reading.value !== null ? evaluateThresholds(reading.value, row.thresholds) : null;
  const valueText = reading.status === 'ready' ? reading.formatted : rowStatusText(reading.status);

  const active = editing !== null && editing.at === committed ? editing : null;
  const invalid = active?.invalid ?? null;
  const shown =
    active?.text ??
    (writable && entry !== null && reading.status === 'ready' && reading.raw !== null
      ? editableEntryValue(reading.raw, entry.type, row.format)
      : '');

  const commit = (event: FormEvent): void => {
    event.preventDefault();
    if (!writable || !target || !entry || blockedReason !== null || status.pending) return;

    const result = parseEntryValue(shown, entry.type, row.format);
    if (result.ok === false) {
      setEditing({ text: shown, invalid: result.error, at: committed });
      return;
    }
    setEditing({ text: shown, invalid: null, at: committed });
    send(target, result.raw);
  };

  const message = invalid ?? status.failure ?? blockedReason;

  return (
    <tr>
      <td className={styles.nameCell}>{row.label}</td>
      <td
        className={cx(styles.valueCell, role !== null && ROLE_CLASS[role])}
        title={role !== null ? `Status: ${role}` : undefined}
      >
        {valueText}
      </td>
      <td className={styles.writeCell}>
        {writable ? (
          <form className={styles.writeForm} onSubmit={commit}>
            <input
              className={styles.writeInput}
              value={shown}
              onChange={event => setEditing({ text: event.target.value, invalid: null, at: committed })}
              aria-label={`Write ${row.label}`}
              aria-invalid={invalid !== null || status.failure !== null ? true : undefined}
              aria-describedby={message !== null ? messageId : undefined}
              disabled={blockedReason !== null}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="submit"
              className={styles.sendButton}
              aria-label={`Send ${row.label}`}
              title={message ?? undefined}
              disabled={blockedReason !== null || status.pending}
              // Keeps focus in the field while Send is pressed — a mousedown-driven
              // blur would let the live-value mirror overwrite what was just typed
              // before the click's own submit fires. Same fix `ValueWriteWidget`'s
              // form/Enter pairing gets for free from staying in one `<form>`.
              onMouseDown={event => event.preventDefault()}
            >
              <PaperPlaneRight size={12} />
            </button>
          </form>
        ) : null}
        {message !== null ? (
          <span id={messageId} className={styles.srMessage} role={status.failure !== null ? 'alert' : undefined}>
            {message}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Many bound entries at once, in a table — the shared surface's
 * label/binding/format/thresholds, one row per entry, rather than a
 * kind-specific row shape. Writability is not configured; it is read
 * straight off the Map through `entryWriteBlockReason`, the same rule every
 * other write-mirroring kind uses, so a row's write cell appears exactly
 * where a write would actually be accepted.
 */
export function DataTableWidget({ config }: WidgetProps): React.JSX.Element {
  const { rows } = config as DataTableWidgetConfig;

  if (rows.length === 0) {
    return <p className={styles.notice}>No rows configured — add rows from the gear icon.</p>;
  }

  return (
    <div className={styles.host}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.nameCell}>Name</th>
            <th className={styles.valueCell}>Value</th>
            <th className={styles.writeCell}>Write</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <DataTableRowView key={index} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
