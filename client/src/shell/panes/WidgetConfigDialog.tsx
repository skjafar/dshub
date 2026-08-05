import { useEffect, useMemo, useState } from 'react';
import { Plus, TrashSimple } from '@phosphor-icons/react';
import { ADDRESS_SPACE_NAME } from '../addressSpace';
import type { AddressSpace } from '../addressSpace';
import { filterEntries } from '../entryFilter';
import type { MapEntry } from '../../maps/mapParser';
import { useMapEntries } from '../useMapEntries';
import { DISPLAY_FORMATS } from '../valueFormat';
import type { DisplayFormat } from '../valueFormat';
import type { ThresholdRule } from '../widgets/threshold';
import type { BoundWidgetConfig } from '../widgets/widgetConfig';
import { Button, Dialog, NumericInput, Select, Table, TextField } from '../../ui';
import type { Column, SelectOption } from '../../ui';
import styles from './WidgetConfigDialog.module.css';

export interface WidgetConfigDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly config: BoundWidgetConfig;
  readonly onSave: (config: BoundWidgetConfig) => void;
}

const SPACE_OPTIONS: readonly SelectOption<AddressSpace>[] = (
  ['register', 'parameter', 'sysRegister'] as const
).map(space => ({ value: space, label: ADDRESS_SPACE_NAME[space] }));

const FORMAT_LABEL: Readonly<Record<DisplayFormat, string>> = {
  decimal: 'Decimal',
  hexadecimal: 'Hexadecimal',
  binary: 'Binary',
};
const FORMAT_OPTIONS: readonly SelectOption<DisplayFormat>[] = DISPLAY_FORMATS.map(format => ({
  value: format,
  label: FORMAT_LABEL[format],
}));

const COMPARATOR_LABEL: Readonly<Record<ThresholdRule['comparator'], string>> = {
  '<': 'is below',
  '<=': 'is at or below',
  '>': 'is above',
  '>=': 'is at or above',
};
const COMPARATOR_OPTIONS: readonly SelectOption<ThresholdRule['comparator']>[] = (
  ['<', '<=', '>', '>='] as const
).map(comparator => ({ value: comparator, label: COMPARATOR_LABEL[comparator] }));

const ROLE_LABEL: Readonly<Record<ThresholdRule['role'], string>> = {
  ok: 'OK',
  warn: 'Warn',
  error: 'Error',
};
const ROLE_OPTIONS: readonly SelectOption<ThresholdRule['role']>[] = (['ok', 'warn', 'error'] as const).map(
  role => ({ value: role, label: ROLE_LABEL[role] })
);

function createThresholdRuleId(): string {
  return `threshold_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * The one surface every bound Widget kind configures through: what address it
 * reads, how the reading is displayed, and what threshold rules judge it.
 *
 * A single form for all three rather than a kind-specific dialog is the point
 * — "learning one Widget teaches you the others" is a property of this
 * component, not of any one Widget kind's own code.
 */
export function WidgetConfigDialog({ open, onOpenChange, config, onSave }: WidgetConfigDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState(config);
  const [space, setSpace] = useState<AddressSpace>(config.binding?.space ?? 'register');
  const [query, setQuery] = useState('');

  // Reseeded every time the dialog opens, so a previous edit abandoned by
  // Cancel never leaks into the next Widget this dialog is opened for.
  useEffect(() => {
    if (!open) return;
    setDraft(config);
    setSpace(config.binding?.space ?? 'register');
    setQuery('');
  }, [open, config]);

  const map = useMapEntries(space);
  const boundEntry = useMemo(
    () =>
      draft.binding && draft.binding.space === space
        ? (map.entries.find(entry => entry.address === draft.binding?.address) ?? null)
        : null,
    [draft.binding, map.entries, space]
  );

  const matches = useMemo(() => filterEntries(map.entries, query), [map.entries, query]);

  const pickerColumns: readonly Column<MapEntry>[] = [
    { key: 'name', header: 'Name', render: entry => entry.name },
    { key: 'address', header: 'Addr', numeric: true, mono: true, width: '5.5rem', render: entry => entry.address },
  ];

  const handlePickEntry = (entry: MapEntry): void => {
    setDraft(previous => ({
      ...previous,
      binding: { space, address: entry.address },
      // Only on the first binding — an Operator who has already bound and
      // named this Widget is not asking to have that name overwritten by
      // pointing it at a different address later.
      label: previous.binding === null ? entry.name : previous.label,
    }));
  };

  const handleClearBinding = (): void => {
    setDraft(previous => ({ ...previous, binding: null }));
  };

  const handleAddRule = (): void => {
    setDraft(previous => ({
      ...previous,
      thresholds: [...previous.thresholds, { id: createThresholdRuleId(), comparator: '>', value: 0, role: 'warn' }],
    }));
  };

  const handleRemoveRule = (id: string): void => {
    setDraft(previous => ({ ...previous, thresholds: previous.thresholds.filter(rule => rule.id !== id) }));
  };

  const handleUpdateRule = (id: string, patch: Partial<ThresholdRule>): void => {
    setDraft(previous => ({
      ...previous,
      thresholds: previous.thresholds.map(rule => (rule.id === id ? { ...rule, ...patch } : rule)),
    }));
  };

  const handleSave = (): void => {
    onSave(draft);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Configure Widget"
      description="Bind an address, choose how its value is displayed, and set the thresholds that colour it."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <TextField
          label="Label"
          value={draft.label}
          onChange={event => setDraft(previous => ({ ...previous, label: event.target.value }))}
        />

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Binding</h3>
          {draft.binding ? (
            <div className={styles.boundRow}>
              <span className={styles.boundText}>
                Bound to {boundEntry?.name ?? `address ${draft.binding.address}`} ·{' '}
                {ADDRESS_SPACE_NAME[draft.binding.space]}
              </span>
              <Button variant="ghost" size="sm" onClick={handleClearBinding}>
                Clear
              </Button>
            </div>
          ) : (
            <p className={styles.boundText}>Not bound to an address.</p>
          )}

          <div className={styles.picker}>
            <Select value={space} onValueChange={setSpace} options={SPACE_OPTIONS} aria-label="Address Space" />
            <TextField
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Filter by name or address (0x2A)"
              aria-label="Filter addresses to bind"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className={styles.pickerTableHost}>
            <Table
              columns={pickerColumns}
              rows={matches}
              rowKey={entry => entry.name}
              selectedKey={boundEntry?.name}
              onSelect={handlePickEntry}
              emptyMessage="Nothing matches."
            />
          </div>
        </section>

        <Select
          value={draft.format}
          onValueChange={format => setDraft(previous => ({ ...previous, format }))}
          options={FORMAT_OPTIONS}
          aria-label="Display format"
        />

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Thresholds</h3>
          {draft.thresholds.length === 0 ? (
            <p className={styles.boundText}>No thresholds — the reading shows with no condition colouring.</p>
          ) : (
            <ul className={styles.rules}>
              {draft.thresholds.map(rule => (
                <li key={rule.id} className={styles.rule}>
                  <span className={styles.ruleLabel}>Value</span>
                  <Select
                    value={rule.comparator}
                    onValueChange={comparator => handleUpdateRule(rule.id, { comparator })}
                    options={COMPARATOR_OPTIONS}
                    aria-label="Comparator"
                  />
                  <NumericInput
                    value={rule.value}
                    onCommit={value => handleUpdateRule(rule.id, { value })}
                    className={styles.ruleValue}
                    aria-label="Threshold value"
                  />
                  <Select
                    value={rule.role}
                    onValueChange={role => handleUpdateRule(rule.id, { role })}
                    options={ROLE_OPTIONS}
                    aria-label="Status when this rule matches"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Remove this threshold rule"
                    onClick={() => handleRemoveRule(rule.id)}
                  >
                    <TrashSimple size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" onClick={handleAddRule}>
            <Plus size={14} weight="bold" /> Add rule
          </Button>
        </section>
      </div>
    </Dialog>
  );
}
