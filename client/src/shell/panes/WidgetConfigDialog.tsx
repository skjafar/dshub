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
import type {
  EncoderDisplayWidgetConfig,
  GaugeWidgetConfig,
  LedIndicatorWidgetConfig,
  ProgressBarWidgetConfig,
  WidgetConfig,
} from '../widgets/widgetConfig';
import type { WidgetKind } from '../widgets/widgetRegistry';
import { Button, Dialog, NumericInput, Select, Switch, Table, TextField } from '../../ui';
import type { Column, SelectOption } from '../../ui';
import styles from './WidgetConfigDialog.module.css';

export interface WidgetConfigDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly kind: WidgetKind;
  readonly config: WidgetConfig;
  readonly onSave: (config: WidgetConfig) => void;
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
  '==': 'equals',
};
const COMPARATOR_OPTIONS: readonly SelectOption<ThresholdRule['comparator']>[] = (
  ['<', '<=', '>', '>=', '=='] as const
).map(comparator => ({ value: comparator, label: COMPARATOR_LABEL[comparator] }));

const ROLE_LABEL: Readonly<Record<ThresholdRule['role'], string>> = {
  ok: 'OK',
  warn: 'Warn',
  error: 'Error',
  idle: 'Idle',
};
const ROLE_OPTIONS: readonly SelectOption<ThresholdRule['role']>[] = (['ok', 'warn', 'error', 'idle'] as const).map(
  role => ({ value: role, label: ROLE_LABEL[role] })
);

const ORIENTATION_OPTIONS: readonly SelectOption<'horizontal' | 'vertical'>[] = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
];

/**
 * The kind-specific fields section's own heading, keyed by kind. Doubles as
 * the answer to whether that section shows at all — `valueRead`, `stateLED`
 * and `statusMatrix` carry no fields beyond the shared shape, so they have no
 * entry here rather than a heading nothing sits under.
 */
const KIND_FIELDS_SECTION_TITLE: Readonly<Partial<Record<WidgetKind, string>>> = {
  gauge: 'Range',
  progressBar: 'Range',
  encoderDisplay: 'Conversion',
  ledIndicator: 'On value',
};

/**
 * Whether Thresholds do anything for this kind. Every other kind reads
 * `config.thresholds` to colour or label its reading; Status Matrix decomposes
 * its one bound value bit by bit instead and gives every set bit the same
 * fixed colour (see `StatusMatrixWidget.tsx`), so showing the Thresholds
 * editor for it would be configuration with no effect.
 */
function thresholdsApplyTo(kind: WidgetKind): boolean {
  return kind !== 'statusMatrix';
}

function createThresholdRuleId(): string {
  return `threshold_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface FieldsProps<C extends WidgetConfig> {
  readonly draft: C;
  readonly onChange: (patch: Partial<C>) => void;
}

/** Gauge and Progress Bar share a min/max/unit shape — the fields differ only in the label above them. */
function RangeFields({
  draft,
  onChange,
}: FieldsProps<GaugeWidgetConfig | ProgressBarWidgetConfig>): React.JSX.Element {
  return (
    <>
      <NumericInput label="Minimum" value={draft.min} onCommit={min => onChange({ min })} />
      <NumericInput label="Maximum" value={draft.max} onCommit={max => onChange({ max })} />
      <TextField
        label="Unit (optional)"
        value={draft.unit ?? ''}
        onChange={event => onChange({ unit: event.target.value === '' ? undefined : event.target.value })}
      />
    </>
  );
}

function ProgressBarFields({ draft, onChange }: FieldsProps<ProgressBarWidgetConfig>): React.JSX.Element {
  return (
    <>
      <RangeFields draft={draft} onChange={onChange} />
      <Select
        value={draft.orientation ?? 'horizontal'}
        onValueChange={orientation => onChange({ orientation })}
        options={ORIENTATION_OPTIONS}
        aria-label="Orientation"
      />
    </>
  );
}

function EncoderDisplayFields({ draft, onChange }: FieldsProps<EncoderDisplayWidgetConfig>): React.JSX.Element {
  return (
    <>
      <NumericInput
        label="Conversion factor"
        value={draft.conversionFactor}
        onCommit={conversionFactor => onChange({ conversionFactor })}
      />
      <TextField
        label="Converted unit (optional)"
        value={draft.primaryUnit ?? ''}
        onChange={event => onChange({ primaryUnit: event.target.value === '' ? undefined : event.target.value })}
      />
      <TextField
        label="Raw unit (optional)"
        value={draft.secondaryUnit ?? ''}
        onChange={event => onChange({ secondaryUnit: event.target.value === '' ? undefined : event.target.value })}
      />
      <label className={styles.switchRow}>
        <Switch checked={draft.showRawValue ?? true} onCheckedChange={showRawValue => onChange({ showRawValue })} />
        Show the raw reading alongside the converted one
      </label>
    </>
  );
}

function LedIndicatorFields({ draft, onChange }: FieldsProps<LedIndicatorWidgetConfig>): React.JSX.Element {
  return (
    <>
      <NumericInput label="Value counted as “on”" value={draft.onValue} onCommit={onValue => onChange({ onValue })} />
      <TextField
        label="On label (optional)"
        value={draft.onLabel ?? ''}
        onChange={event => onChange({ onLabel: event.target.value === '' ? undefined : event.target.value })}
      />
      <TextField
        label="Off label (optional)"
        value={draft.offLabel ?? ''}
        onChange={event => onChange({ offLabel: event.target.value === '' ? undefined : event.target.value })}
      />
    </>
  );
}

/**
 * The one place a Widget's kind decides anything about this dialog. Every
 * field above and below this section is identical regardless of `kind`; only
 * a handful of kinds need fields beyond the shared shape at all, and this is
 * where each says what they are.
 */
function KindFields({
  kind,
  draft,
  onChange,
}: {
  readonly kind: WidgetKind;
  readonly draft: WidgetConfig;
  readonly onChange: (patch: Partial<WidgetConfig>) => void;
}): React.JSX.Element | null {
  switch (kind) {
    case 'gauge':
      return <RangeFields draft={draft as GaugeWidgetConfig} onChange={onChange} />;
    case 'progressBar':
      return <ProgressBarFields draft={draft as ProgressBarWidgetConfig} onChange={onChange} />;
    case 'encoderDisplay':
      return <EncoderDisplayFields draft={draft as EncoderDisplayWidgetConfig} onChange={onChange} />;
    case 'ledIndicator':
      return <LedIndicatorFields draft={draft as LedIndicatorWidgetConfig} onChange={onChange} />;
    case 'valueRead':
    case 'stateLED':
    case 'statusMatrix':
      return null;
  }
}

/**
 * The one surface every bound Widget kind configures through: what address it
 * reads, how the reading is displayed, and what threshold rules judge it.
 *
 * A single form for all three rather than a kind-specific dialog is the point
 * — "learning one Widget teaches you the others" is a property of this
 * component, not of any one Widget kind's own code. `kind` only ever reaches
 * {@link KindFields}, the one section that legitimately varies.
 */
export function WidgetConfigDialog({
  open,
  onOpenChange,
  kind,
  config,
  onSave,
}: WidgetConfigDialogProps): React.JSX.Element {
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

  const handleKindFieldsChange = (patch: Partial<WidgetConfig>): void => {
    setDraft(previous => ({ ...previous, ...patch }));
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

        {KIND_FIELDS_SECTION_TITLE[kind] ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{KIND_FIELDS_SECTION_TITLE[kind]}</h3>
            <div className={styles.kindFields}>
              <KindFields kind={kind} draft={draft} onChange={handleKindFieldsChange} />
            </div>
          </section>
        ) : null}

        {thresholdsApplyTo(kind) ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Thresholds</h3>
            {draft.thresholds.length === 0 ? (
              <p className={styles.boundText}>No thresholds — the reading shows with no condition colouring.</p>
            ) : (
              <ul className={styles.rules}>
                {draft.thresholds.map(rule => (
                  <li key={rule.id} className={styles.rule}>
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
                    <TextField
                      value={rule.label ?? ''}
                      onChange={event =>
                        handleUpdateRule(rule.id, {
                          label: event.target.value === '' ? undefined : event.target.value,
                        })
                      }
                      placeholder="Name (optional)"
                      aria-label="Name shown for this rule, used by State LED"
                      className={styles.ruleLabelField}
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
        ) : null}
      </div>
    </Dialog>
  );
}
