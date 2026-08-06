import { useEffect, useMemo, useState } from 'react';
import { Plus, TrashSimple } from '@phosphor-icons/react';
import { useSettings } from '../../contexts/SettingsContext';
import { ADDRESS_SPACE_NAME } from '../addressSpace';
import type { AddressSpace, WritableAddressSpace } from '../addressSpace';
import { filterEntries } from '../entryFilter';
import type { MapEntry } from '../../maps/mapParser';
import type { PlottableSpace } from '../plotStream';
import type { SysCommand } from '../../types/settings';
import { useMapEntries } from '../useMapEntries';
import { DISPLAY_FORMATS } from '../valueFormat';
import type { DisplayFormat } from '../valueFormat';
import type { ThresholdRule } from '../widgets/threshold';
import { defaultBoundWidgetConfig } from '../widgets/widgetConfig';
import type {
  AlarmListWidgetConfig,
  BoundWidgetConfig,
  ButtonWidgetConfig,
  ContainerWidgetConfig,
  DataTableWidgetConfig,
  Direction,
  DirectionalControlEntry,
  DirectionalControlWidgetConfig,
  DropdownOption,
  DropdownWidgetConfig,
  EncoderDisplayWidgetConfig,
  GaugeWidgetConfig,
  LedIndicatorWidgetConfig,
  MiniPlotWidgetConfig,
  ProgressBarWidgetConfig,
  ValueWriteWidgetConfig,
  WidgetConfig,
  WidgetTarget,
} from '../widgets/widgetConfig';
import { isBoundWidgetKind } from '../widgets/widgetRegistry';
import type { BoundWidgetKind, WidgetKind } from '../widgets/widgetRegistry';
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

/** Register and Parameter only — offered where a write is the point (a Button's address target), since System Registers refuse every write. */
const WRITABLE_SPACE_OPTIONS: readonly SelectOption<WritableAddressSpace>[] = (
  ['register', 'parameter'] as const
).map(space => ({ value: space, label: ADDRESS_SPACE_NAME[space] }));

/** Register and System Register only — the two spaces `plotStream` can stream at all, offered to Mini-Plot's own address picker. */
const PLOTTABLE_SPACE_OPTIONS: readonly SelectOption<PlottableSpace>[] = (
  ['register', 'sysRegister'] as const
).map(space => ({ value: space, label: ADDRESS_SPACE_NAME[space] }));

/**
 * The bound kinds whose whole point is writing, not just displaying — unlike
 * a Gauge or Value Readout, a Dropdown or Value Write bound to a System
 * Register can never do the one thing it exists for. Their Binding sections
 * offer {@link WRITABLE_SPACE_OPTIONS} rather than every space for the same
 * reason `ButtonFields`'s target picker does.
 */
const WRITABLE_BOUND_KINDS: ReadonlySet<BoundWidgetKind> = new Set(['dropdown', 'valueWrite']);

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

const TARGET_KIND_OPTIONS: readonly SelectOption<'address' | 'command'>[] = [
  { value: 'address', label: 'Address' },
  { value: 'command', label: 'Command' },
];

const LAYOUT_OPTIONS: readonly SelectOption<'4way' | '8way'>[] = [
  { value: '4way', label: '4-way' },
  { value: '8way', label: '8-way (with diagonals)' },
];

const DIRECTION_LABEL: Readonly<Record<Direction, string>> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  upLeft: 'Up-left',
  upRight: 'Up-right',
  downLeft: 'Down-left',
  downRight: 'Down-right',
};
const FOUR_WAY_DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];
const EIGHT_WAY_DIRECTIONS: readonly Direction[] = [
  'up',
  'down',
  'left',
  'right',
  'upLeft',
  'upRight',
  'downLeft',
  'downRight',
];

function createThresholdRuleId(): string {
  return `threshold_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** A Command Select, sourced from the active Profile's own catalogue — the same "presented by name" reasoning `CommandPane` was built on. */
function CommandSelect({
  commands,
  value,
  onValueChange,
  disabled,
  ariaLabel,
}: {
  readonly commands: readonly SysCommand[];
  readonly value: number | null;
  readonly onValueChange: (code: number) => void;
  readonly disabled?: boolean;
  readonly ariaLabel: string;
}): React.JSX.Element {
  if (commands.length === 0) {
    return <p className={styles.boundText}>This Profile declares no Commands.</p>;
  }
  const options: readonly SelectOption<string>[] = commands.map(command => ({
    value: String(command.code),
    label: `${command.name} (code ${command.code})`,
  }));
  return (
    <Select
      value={value === null ? '' : String(value)}
      onValueChange={raw => onValueChange(Number(raw))}
      options={options}
      disabled={disabled}
      placeholder="Select a Command…"
      aria-label={ariaLabel}
    />
  );
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

function DropdownFields({ draft, onChange }: FieldsProps<DropdownWidgetConfig>): React.JSX.Element {
  const handleAdd = (): void => {
    onChange({ options: [...draft.options, { value: 0, label: '' }] });
  };
  const handleRemove = (index: number): void => {
    onChange({ options: draft.options.filter((_, i) => i !== index) });
  };
  const handleUpdate = (index: number, patch: Partial<DropdownOption>): void => {
    onChange({ options: draft.options.map((option, i) => (i === index ? { ...option, ...patch } : option)) });
  };

  return (
    <div className={styles.optionsEditor}>
      {draft.options.length === 0 ? (
        <p className={styles.boundText}>No options yet.</p>
      ) : (
        <ul className={styles.rules}>
          {/* Index keys: options carry no id of their own — `value` is the only
              thing written to the Device, and reusing it as a key would break
              two options sharing a value while the row order itself never
              reorders except by explicit add/remove. */}
          {draft.options.map((option, index) => (
            <li key={index} className={styles.optionRow}>
              <NumericInput
                value={option.value}
                onCommit={value => handleUpdate(index, { value })}
                className={styles.ruleValue}
                aria-label="Option value"
              />
              <TextField
                value={option.label}
                onChange={event => handleUpdate(index, { label: event.target.value })}
                placeholder="Label"
                aria-label="Option label"
              />
              <Button variant="ghost" size="sm" aria-label="Remove this option" onClick={() => handleRemove(index)}>
                <TrashSimple size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" onClick={handleAdd}>
        <Plus size={14} weight="bold" /> Add option
      </Button>
      <label className={styles.switchRow}>
        <Switch
          checked={draft.confirmationRequired ?? false}
          onCheckedChange={confirmationRequired => onChange({ confirmationRequired })}
        />
        Require confirmation before writing
      </label>
    </div>
  );
}

function ValueWriteFields({ draft, onChange }: FieldsProps<ValueWriteWidgetConfig>): React.JSX.Element {
  return (
    <label className={styles.switchRow}>
      <Switch
        checked={draft.confirmationRequired ?? false}
        onCheckedChange={confirmationRequired => onChange({ confirmationRequired })}
      />
      Require confirmation before writing
    </label>
  );
}

/**
 * The one place a bound Widget's kind decides anything about this dialog.
 * Every field above and below this section is identical regardless of
 * `kind`; only a handful of kinds need fields beyond the shared shape at all,
 * and this is where each says what they are.
 */
function KindFields({
  kind,
  draft,
  onChange,
}: {
  readonly kind: BoundWidgetKind;
  readonly draft: BoundWidgetConfig;
  readonly onChange: (patch: Partial<BoundWidgetConfig>) => void;
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
    case 'dropdown':
      return <DropdownFields draft={draft as DropdownWidgetConfig} onChange={onChange} />;
    case 'valueWrite':
      return <ValueWriteFields draft={draft as ValueWriteWidgetConfig} onChange={onChange} />;
    case 'valueRead':
    case 'stateLED':
    case 'statusMatrix':
      return null;
  }
}

/** `KIND_FIELDS_SECTION_TITLE`'s heading also decides whether the section shows at all — see its own doc comment. */
const KIND_FIELDS_SECTION_TITLE: Readonly<Partial<Record<BoundWidgetKind, string>>> = {
  gauge: 'Range',
  progressBar: 'Range',
  encoderDisplay: 'Conversion',
  ledIndicator: 'On value',
  dropdown: 'Options',
  valueWrite: 'Write',
};

/**
 * Whether Thresholds do anything for this kind. Status Matrix decomposes its
 * one bound value bit by bit instead (see `StatusMatrixWidget.tsx`), and
 * Value Write's field is an editable draft rather than a coloured reading —
 * showing either editor would be configuration with no visible effect.
 */
function thresholdsApplyTo(kind: BoundWidgetKind): boolean {
  return kind !== 'statusMatrix' && kind !== 'valueWrite';
}

/**
 * The address-picker half of the Binding section, generic over which spaces
 * are offered — a plain `binding` (every space, or writable-only for a
 * write-mirroring bound kind) and a Mini-Plot's `series` (register/system
 * register only, the two `plotStream` can stream) are the same shape with a
 * different `S`, so this is the one place "pick an address" is built rather
 * than three call sites each rebuilding their own Select/filter/Table.
 */
function BindingPicker<S extends AddressSpace>({
  binding,
  spaceOptions,
  onPick,
  onClear,
}: {
  readonly binding: { readonly space: S; readonly address: number } | null;
  readonly spaceOptions: readonly SelectOption<S>[];
  readonly onPick: (entry: MapEntry, space: S) => void;
  readonly onClear: () => void;
}): React.JSX.Element {
  const [space, setSpace] = useState<S>(binding?.space ?? spaceOptions[0].value);
  const [query, setQuery] = useState('');

  const map = useMapEntries(space);
  const boundEntry = useMemo(
    () =>
      binding && binding.space === space ? (map.entries.find(entry => entry.address === binding.address) ?? null) : null,
    [binding, map.entries, space]
  );
  const matches = useMemo(() => filterEntries(map.entries, query), [map.entries, query]);

  const pickerColumns: readonly Column<MapEntry>[] = [
    { key: 'name', header: 'Name', render: entry => entry.name },
    { key: 'address', header: 'Addr', numeric: true, mono: true, width: '5.5rem', render: entry => entry.address },
  ];

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Binding</h3>
      {binding ? (
        <div className={styles.boundRow}>
          <span className={styles.boundText}>
            Bound to {boundEntry?.name ?? `address ${binding.address}`} · {ADDRESS_SPACE_NAME[binding.space]}
          </span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </div>
      ) : (
        <p className={styles.boundText}>Not bound to an address.</p>
      )}

      <div className={styles.picker}>
        <Select value={space} onValueChange={setSpace} options={spaceOptions} aria-label="Address Space" />
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
          onSelect={entry => onPick(entry, space)}
          emptyMessage="Nothing matches."
        />
      </div>
    </section>
  );
}

/**
 * The Thresholds section every bound kind that reads it shares — Data Table
 * and Alarm List's own per-row/per-alarm thresholds included, which is why
 * this takes the rule list and a setter rather than a `BoundWidgetConfig`
 * draft directly.
 */
function ThresholdEditor({
  thresholds,
  onChange,
}: {
  readonly thresholds: readonly ThresholdRule[];
  readonly onChange: (next: readonly ThresholdRule[]) => void;
}): React.JSX.Element {
  const handleAddRule = (): void => {
    onChange([...thresholds, { id: createThresholdRuleId(), comparator: '>', value: 0, role: 'warn' }]);
  };
  const handleRemoveRule = (id: string): void => {
    onChange(thresholds.filter(rule => rule.id !== id));
  };
  const handleUpdateRule = (id: string, patch: Partial<ThresholdRule>): void => {
    onChange(thresholds.map(rule => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Thresholds</h3>
      {thresholds.length === 0 ? (
        <p className={styles.boundText}>No thresholds — the reading shows with no condition colouring.</p>
      ) : (
        <ul className={styles.rules}>
          {thresholds.map(rule => (
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
  );
}

/**
 * The Binding/Format/Thresholds section every kind in {@link BoundWidgetKind}
 * shares — unchanged since ticket 14 beyond growing the `kind`-specific
 * fields and thresholds-applicability switches above. Extracted so the top
 * level dialog can put it beside the write-target sections `button` and
 * `directionalControl` need instead.
 */
function BoundFields({
  kind,
  draft,
  onChange,
}: {
  readonly kind: BoundWidgetKind;
  readonly draft: BoundWidgetConfig;
  readonly onChange: (patch: Partial<BoundWidgetConfig>) => void;
}): React.JSX.Element {
  const spaceOptions: readonly SelectOption<AddressSpace>[] = WRITABLE_BOUND_KINDS.has(kind)
    ? WRITABLE_SPACE_OPTIONS
    : SPACE_OPTIONS;

  const handlePickEntry = (entry: MapEntry, space: AddressSpace): void => {
    onChange({
      binding: { space, address: entry.address },
      // Only on the first binding — an Operator who has already bound and
      // named this Widget is not asking to have that name overwritten by
      // pointing it at a different address later.
      label: draft.binding === null ? entry.name : draft.label,
    });
  };

  return (
    <>
      <BindingPicker
        binding={draft.binding}
        spaceOptions={spaceOptions}
        onPick={handlePickEntry}
        onClear={() => onChange({ binding: null })}
      />

      <Select
        value={draft.format}
        onValueChange={format => onChange({ format })}
        options={FORMAT_OPTIONS}
        aria-label="Display format"
      />

      {KIND_FIELDS_SECTION_TITLE[kind] ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{KIND_FIELDS_SECTION_TITLE[kind]}</h3>
          <div className={styles.kindFields}>
            <KindFields kind={kind} draft={draft} onChange={onChange} />
          </div>
        </section>
      ) : null}

      {thresholdsApplyTo(kind) ? (
        <ThresholdEditor thresholds={draft.thresholds} onChange={thresholds => onChange({ thresholds })} />
      ) : null}
    </>
  );
}

/**
 * One Data Table row or Alarm List entry — a label, a collapsed summary of
 * its binding, and (expanded) the same `BindingPicker`/format/
 * `ThresholdEditor` a single-value bound kind's own dialog section uses.
 * Collapsed by default so a Widget with several rows does not open with
 * every row's full picker and Table already expanded.
 */
function BoundEntryEditor({
  entry,
  onChange,
  onRemove,
}: {
  readonly entry: BoundWidgetConfig;
  readonly onChange: (patch: Partial<BoundWidgetConfig>) => void;
  readonly onRemove: () => void;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const handlePickEntry = (mapEntry: MapEntry, space: AddressSpace): void => {
    onChange({
      binding: { space, address: mapEntry.address },
      label: entry.binding === null ? mapEntry.name : entry.label,
    });
  };

  return (
    <li className={styles.entryRow}>
      <div className={styles.entryRowHeader}>
        <TextField
          value={entry.label}
          onChange={event => onChange({ label: event.target.value })}
          placeholder="Label"
          aria-label="Row label"
        />
        <Button variant="ghost" size="sm" onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Done' : 'Configure'}
        </Button>
        <Button variant="ghost" size="sm" aria-label="Remove this row" onClick={onRemove}>
          <TrashSimple size={14} />
        </Button>
      </div>
      {expanded ? (
        <div className={styles.entryRowBody}>
          <BindingPicker
            binding={entry.binding}
            spaceOptions={SPACE_OPTIONS}
            onPick={handlePickEntry}
            onClear={() => onChange({ binding: null })}
          />
          <Select
            value={entry.format}
            onValueChange={format => onChange({ format })}
            options={FORMAT_OPTIONS}
            aria-label="Display format"
          />
          <ThresholdEditor thresholds={entry.thresholds} onChange={thresholds => onChange({ thresholds })} />
        </div>
      ) : (
        <p className={styles.boundText}>
          {entry.binding
            ? `Bound to address ${entry.binding.address} · ${ADDRESS_SPACE_NAME[entry.binding.space]}`
            : 'Not bound to an address.'}
        </p>
      )}
    </li>
  );
}

/** The row-list editor Data Table's `rows` and Alarm List's `alarms` both share — the same `BoundWidgetConfig` shape, differing only in what a fresh row is named and what its "add" button reads. */
function BoundEntryListEditor({
  entries,
  onChange,
  addLabel,
  defaultLabel,
}: {
  readonly entries: readonly BoundWidgetConfig[];
  readonly onChange: (next: readonly BoundWidgetConfig[]) => void;
  readonly addLabel: string;
  readonly defaultLabel: string;
}): React.JSX.Element {
  const handleAdd = (): void => {
    onChange([...entries, defaultBoundWidgetConfig(`${defaultLabel} ${entries.length + 1}`)]);
  };
  const handleUpdate = (index: number, patch: Partial<BoundWidgetConfig>): void => {
    onChange(entries.map((current, i) => (i === index ? { ...current, ...patch } : current)));
  };
  const handleRemove = (index: number): void => {
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.optionsEditor}>
      {entries.length === 0 ? (
        <p className={styles.boundText}>None yet.</p>
      ) : (
        <ul className={styles.rules}>
          {/* Index keys: an entry carries no id of its own, matching `DropdownOption`'s own precedent — order changes only by explicit add/remove. */}
          {entries.map((entry, index) => (
            <BoundEntryEditor
              key={index}
              entry={entry}
              onChange={patch => handleUpdate(index, patch)}
              onRemove={() => handleRemove(index)}
            />
          ))}
        </ul>
      )}
      <Button size="sm" onClick={handleAdd}>
        <Plus size={14} weight="bold" /> {addLabel}
      </Button>
    </div>
  );
}

function DataTableFields({ draft, onChange }: FieldsProps<DataTableWidgetConfig>): React.JSX.Element {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Rows</h3>
      <BoundEntryListEditor entries={draft.rows} onChange={rows => onChange({ rows })} addLabel="Add row" defaultLabel="Row" />
    </section>
  );
}

function AlarmListFields({ draft, onChange }: FieldsProps<AlarmListWidgetConfig>): React.JSX.Element {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Alarms</h3>
        <BoundEntryListEditor entries={draft.alarms} onChange={alarms => onChange({ alarms })} addLabel="Add alarm" defaultLabel="Alarm" />
      </section>
      <label className={styles.switchRow}>
        <Switch checked={draft.showInactive} onCheckedChange={showInactive => onChange({ showInactive })} />
        Show clear alarms too, not only active ones
      </label>
    </>
  );
}

function ContainerFields({ draft, onChange }: FieldsProps<ContainerWidgetConfig>): React.JSX.Element {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Layout</h3>
      <div className={styles.kindFields}>
        <NumericInput label="Padding" value={draft.padding} onCommit={padding => onChange({ padding })} />
        <NumericInput label="Spacing" value={draft.spacing} onCommit={spacing => onChange({ spacing })} />
      </div>
      <p className={styles.boundText}>
        Widgets inside are added, configured and removed directly on the Container itself, not from here.
      </p>
    </section>
  );
}

function MiniPlotFields({ draft, onChange }: FieldsProps<MiniPlotWidgetConfig>): React.JSX.Element {
  const handlePick = (entry: MapEntry, space: PlottableSpace): void => {
    onChange({
      series: { space, address: entry.address },
      label: draft.series === null ? entry.name : draft.label,
    });
  };

  return (
    <>
      <BindingPicker
        binding={draft.series}
        spaceOptions={PLOTTABLE_SPACE_OPTIONS}
        onPick={handlePick}
        onClear={() => onChange({ series: null })}
      />
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Trace</h3>
        <div className={styles.kindFields}>
          <NumericInput label="Poll (ms)" value={draft.pollInterval} onCommit={pollInterval => onChange({ pollInterval })} />
          <NumericInput label="Span (s)" value={draft.timeSpan} onCommit={timeSpan => onChange({ timeSpan })} />
        </div>
      </section>
    </>
  );
}

/**
 * A Button's write target: an address (a plain write) or a Command (a send)
 * — {@link WidgetTarget}'s own two kinds, picked here through the same
 * address-picker Table `BoundFields` uses, or the Profile's own Command
 * catalogue when the target is a Command.
 */
function ButtonFields({ draft, onChange }: FieldsProps<ButtonWidgetConfig>): React.JSX.Element {
  const { getActiveProfile } = useSettings();
  const commands = getActiveProfile()?.sysCommands ?? [];

  const [space, setSpace] = useState<WritableAddressSpace>(
    draft.target?.kind === 'address' ? draft.target.space : 'register'
  );
  const [query, setQuery] = useState('');
  const map = useMapEntries(space);
  const matches = useMemo(() => filterEntries(map.entries, query), [map.entries, query]);

  const targetKind = draft.target?.kind ?? 'address';

  const boundEntry = useMemo(() => {
    const target = draft.target;
    if (target?.kind !== 'address') return null;
    return map.entries.find(entry => entry.address === target.address) ?? null;
  }, [draft.target, map.entries]);

  const pickerColumns: readonly Column<MapEntry>[] = [
    { key: 'name', header: 'Name', render: entry => entry.name },
    { key: 'address', header: 'Addr', numeric: true, mono: true, width: '5.5rem', render: entry => entry.address },
  ];

  const handleTargetKindChange = (next: 'address' | 'command'): void => {
    onChange({ target: null });
    if (next === 'command') return;
    setSpace('register');
  };

  const handlePickAddress = (entry: MapEntry): void => {
    const target: WidgetTarget = { kind: 'address', space, address: entry.address };
    onChange({ target, label: draft.target === null ? entry.name : draft.label });
  };

  const handlePickCommand = (code: number): void => {
    const target: WidgetTarget = { kind: 'command', code };
    onChange({ target });
  };

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Target</h3>

      <Select
        value={targetKind}
        onValueChange={handleTargetKindChange}
        options={TARGET_KIND_OPTIONS}
        aria-label="Target kind"
      />

      {targetKind === 'address' ? (
        <>
          {draft.target?.kind === 'address' ? (
            <div className={styles.boundRow}>
              <span className={styles.boundText}>
                Writes {boundEntry?.name ?? `address ${draft.target.address}`} · {ADDRESS_SPACE_NAME[draft.target.space]}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onChange({ target: null })}>
                Clear
              </Button>
            </div>
          ) : (
            <p className={styles.boundText}>Not bound to an address.</p>
          )}
          <div className={styles.picker}>
            <Select
              value={space}
              onValueChange={setSpace}
              options={WRITABLE_SPACE_OPTIONS}
              aria-label="Target Address Space"
            />
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
              onSelect={handlePickAddress}
              emptyMessage="Nothing matches."
            />
          </div>
        </>
      ) : (
        <CommandSelect
          commands={commands}
          value={draft.target?.kind === 'command' ? draft.target.code : null}
          onValueChange={handlePickCommand}
          ariaLabel="Target Command"
        />
      )}

      <div className={styles.kindFields}>
        <NumericInput label="Value" value={draft.value} onCommit={value => onChange({ value })} />
      </div>
      <label className={styles.switchRow}>
        <Switch
          checked={draft.confirmationRequired ?? false}
          onCheckedChange={confirmationRequired => onChange({ confirmationRequired })}
        />
        Require confirmation before sending
      </label>
    </section>
  );
}

/**
 * Directional Control's directions: each one a Command code from the
 * Profile's own catalogue, entirely separate from `BoundFields` — a pad sends
 * Commands only, never writes an address, so there is no binding here at all.
 */
function DirectionalControlFields({ draft, onChange }: FieldsProps<DirectionalControlWidgetConfig>): React.JSX.Element {
  const { getActiveProfile } = useSettings();
  const commands = getActiveProfile()?.sysCommands ?? [];
  const layout = draft.layout ?? '4way';
  const activeDirections = layout === '8way' ? EIGHT_WAY_DIRECTIONS : FOUR_WAY_DIRECTIONS;

  const entryFor = (direction: Direction): DirectionalControlEntry | undefined =>
    draft.directions.find(entry => entry.direction === direction);

  const setDirection = (direction: Direction, patch: Partial<Omit<DirectionalControlEntry, 'direction'>> | null): void => {
    const existing = entryFor(direction);
    let directions: readonly DirectionalControlEntry[];
    if (patch === null) {
      directions = draft.directions.filter(entry => entry.direction !== direction);
    } else if (existing) {
      directions = draft.directions.map(entry => (entry.direction === direction ? { ...entry, ...patch } : entry));
    } else {
      directions = [...draft.directions, { direction, command: 0, ...patch }];
    }
    onChange({ directions });
  };

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Directions</h3>

      <Select
        value={layout}
        onValueChange={next => onChange({ layout: next })}
        options={LAYOUT_OPTIONS}
        aria-label="Pad layout"
      />

      <ul className={styles.rules}>
        {activeDirections.map(direction => {
          const entry = entryFor(direction);
          return (
            <li key={direction} className={styles.optionRow}>
              <span className={styles.boundText}>{DIRECTION_LABEL[direction]}</span>
              <CommandSelect
                commands={commands}
                value={entry?.command ?? null}
                onValueChange={command => setDirection(direction, { command, label: entry?.label })}
                ariaLabel={`${DIRECTION_LABEL[direction]} Command`}
              />
              {entry ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Clear ${DIRECTION_LABEL[direction]}`}
                  onClick={() => setDirection(direction, null)}
                >
                  <TrashSimple size={14} />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The one place a Widget kind decides what beyond the Label field this
 * dialog shows. `deviceInfo` returns `null` — every field it renders comes
 * from the connection itself, not from anything an Operator configures, so
 * Label is the whole of its section.
 */
function KindSection({
  kind,
  draft,
  onChange,
}: {
  readonly kind: WidgetKind;
  readonly draft: WidgetConfig;
  readonly onChange: (patch: Partial<WidgetConfig>) => void;
}): React.JSX.Element | null {
  if (isBoundWidgetKind(kind)) {
    return <BoundFields kind={kind} draft={draft as BoundWidgetConfig} onChange={onChange} />;
  }
  switch (kind) {
    case 'button':
      return <ButtonFields draft={draft as ButtonWidgetConfig} onChange={onChange} />;
    case 'directionalControl':
      return <DirectionalControlFields draft={draft as DirectionalControlWidgetConfig} onChange={onChange} />;
    case 'dataTable':
      return <DataTableFields draft={draft as DataTableWidgetConfig} onChange={onChange} />;
    case 'alarmList':
      return <AlarmListFields draft={draft as AlarmListWidgetConfig} onChange={onChange} />;
    case 'deviceInfo':
      return null;
    case 'container':
      return <ContainerFields draft={draft as ContainerWidgetConfig} onChange={onChange} />;
    case 'miniPlot':
      return <MiniPlotFields draft={draft as MiniPlotWidgetConfig} onChange={onChange} />;
  }
}

/**
 * The one surface every Widget kind configures through, bound and control
 * alike: a label, plus whatever that kind's own write-or-read target needs.
 *
 * A single form for all sixteen kinds — not a kind-specific dialog — is the
 * point, "learning one Widget teaches you the others" being a property of
 * this component rather than of any one Widget kind's own code. `kind` only
 * ever decides what {@link KindSection} renders below the Label field.
 */
export function WidgetConfigDialog({
  open,
  onOpenChange,
  kind,
  config,
  onSave,
}: WidgetConfigDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState(config);

  // Reseeded every time the dialog opens, so a previous edit abandoned by
  // Cancel never leaks into the next Widget this dialog is opened for.
  useEffect(() => {
    if (!open) return;
    setDraft(config);
  }, [open, config]);

  const handleChange = (patch: Partial<WidgetConfig>): void => {
    setDraft(previous => ({ ...previous, ...patch }) as WidgetConfig);
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

        <KindSection kind={kind} draft={draft} onChange={handleChange} />
      </div>
    </Dialog>
  );
}
