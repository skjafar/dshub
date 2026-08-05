import { useId, useState } from 'react';
import { Button, Select, cx } from '../../../ui';
import type { SelectOption } from '../../../ui';
import { ADDRESS_SPACE_READ_ONLY_REASON, entryWriteBlockReason } from '../../addressSpace';
import { parseEntryValue } from '../../valueParse';
import { evaluateThresholds } from '../../widgets/threshold';
import { useWidgetReading } from '../../widgets/useWidgetReading';
import { useWidgetWrite } from '../../widgets/useWidgetWrite';
import type { DropdownOption, DropdownWidgetConfig, WidgetTarget } from '../../widgets/widgetConfig';
import type { WidgetProps } from '../../widgets/widgetRegistry';
import { roleClassMap } from './statusRoleClass';
import { WidgetStatusNotice } from './WidgetStatusNotice';
import styles from './DropdownWidget.module.css';

const ROLE_CLASS = roleClassMap(styles);

/**
 * A picklist over the same address it writes — the selection mirrors the
 * Device's own reading, the way `WriteBar`'s field does, so a value chosen
 * elsewhere on the link (another interface, firmware itself) shows up here
 * without anyone needing to reopen the Widget.
 */
export function DropdownWidget({ config }: WidgetProps): React.JSX.Element {
  const { binding, format, thresholds, options, confirmationRequired } = config as DropdownWidgetConfig;
  const reading = useWidgetReading(binding, format);
  const { blockedReason, send, statusFor } = useWidgetWrite();
  const [pending, setPending] = useState<DropdownOption | null>(null);
  const messageId = useId();

  if (binding === null) return <WidgetStatusNotice status="unbound" />;
  if (reading.entry === null) return <WidgetStatusNotice status="not-found" />;
  const entry = reading.entry;
  const { space } = binding;

  // Withheld entirely rather than offered disabled, matching `WriteBar`'s own
  // precedent (ticket 07: "read-only entries offer no write affordance") — a
  // control that cannot act is not this Widget's point.
  if (space !== 'register' && space !== 'parameter') {
    return <p className={styles.notice}>{ADDRESS_SPACE_READ_ONLY_REASON[space]}</p>;
  }
  const entryReason = entryWriteBlockReason(space, entry);
  if (entryReason !== null) {
    return <p className={styles.notice}>{entryReason}</p>;
  }

  const target: WidgetTarget = { kind: 'address', space, address: binding.address };
  const status = statusFor(target);

  const liveValue = reading.status === 'ready' ? reading.value : null;
  const selected = pending ?? options.find(option => option.value === liveValue) ?? null;
  const role = liveValue !== null ? evaluateThresholds(liveValue, thresholds) : null;

  const selectOptions: readonly SelectOption<string>[] = options.map(option => ({
    value: String(option.value),
    label: option.label,
  }));

  const commit = (option: DropdownOption): void => {
    setPending(null);
    const encoded = parseEntryValue(String(option.value), entry.type, 'decimal');
    if (encoded.ok === false) return;
    send(target, encoded.raw);
  };

  const handleChange = (raw: string): void => {
    const option = options.find(candidate => String(candidate.value) === raw);
    if (!option) return;
    if (confirmationRequired) {
      setPending(option);
      return;
    }
    commit(option);
  };

  const disabled = blockedReason !== null || status.pending || options.length === 0;
  const message = status.failure ?? blockedReason;

  return (
    <div className={styles.widget}>
      <div className={styles.row}>
        {role !== null ? (
          <span className={cx(styles.dot, ROLE_CLASS[role])} title={`Status: ${role}`} />
        ) : null}
        <Select
          value={selected ? String(selected.value) : ''}
          onValueChange={handleChange}
          options={selectOptions}
          disabled={disabled}
          placeholder={options.length === 0 ? 'No options configured' : 'Select…'}
          aria-label={config.label}
          aria-describedby={message !== null ? messageId : undefined}
        />
      </div>

      {pending !== null ? (
        <div className={styles.confirmBar}>
          <span className={styles.confirmText}>
            Write <strong>{pending.label}</strong> to {entry.name}?
          </span>
          <Button size="sm" variant="primary" onClick={() => commit(pending)}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {message !== null ? (
        <span
          id={messageId}
          className={cx(styles.message, status.failure !== null && styles.failure)}
          role={status.failure !== null ? 'alert' : undefined}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
