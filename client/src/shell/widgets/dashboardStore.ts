/**
 * Dashboards belonging to a Profile.
 *
 * A Dashboard stays a discrete artifact rather than dissolving into Panes
 * (spec.md, "Dashboard and Focus Mode") — it owns its own Widget grid, and a
 * Profile owns several of them. This module holds the shape and the pure
 * collection operations a Dashboard Pane's switch/add/rename/delete flow
 * needs, mirroring `workspaceStore.ts`'s split between shape, validation and
 * operations — but a Dashboard collection has no "default" a Profile opens
 * into and no invariant against reaching zero entries, so it does not mirror
 * that module's default-Workspace protections.
 */

import type { BoundWidgetKind, WidgetKind } from './widgetRegistry';
import { isBoundWidgetKind, isKnownWidgetKind, widgetDefinition } from './widgetRegistry';
import type {
  AlarmListWidgetConfig,
  BoundWidgetConfig,
  ButtonWidgetConfig,
  ContainerWidgetConfig,
  DataTableWidgetConfig,
  MiniPlotWidgetConfig,
  WidgetBinding,
  WidgetConfig,
  WidgetLayout,
  WidgetTarget,
  StoredWidget,
} from './widgetConfig';
import type { ThresholdRule } from './threshold';
import { backfillSnapshot, isValidBindingSnapshot } from '../bindingIdentity';
import type { EntriesBySpace } from '../bindingIdentity';

export type { WidgetLayout, StoredWidget } from './widgetConfig';

export interface StoredDashboard {
  readonly id: string;
  readonly name: string;
  readonly widgets: readonly StoredWidget[];
}

export interface ProfileDashboards {
  readonly dashboards: readonly StoredDashboard[];
}

export function createDashboardId(): string {
  return `dashboard_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createWidgetId(): string {
  return `widget_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Validation ─────────────────────────────────────────────────────────────
//
// A stored Dashboard can be hand-edited, dropped by a future settings-shape
// change, or name a Widget kind this build has since retired. Every check runs
// before a stored collection reaches a live Dashboard Pane, the same
// discipline `workspaceStore.ts` applies to a stored Workspace.

const COMPARATORS = new Set(['<', '<=', '>', '>=', '==']);
const ROLES = new Set(['ok', 'warn', 'error', 'idle']);
const SPACES = new Set(['register', 'parameter', 'sysRegister']);
const FORMATS = new Set(['decimal', 'hexadecimal', 'binary']);
const WRITABLE_SPACES = new Set(['register', 'parameter']);
const DIRECTIONS = new Set(['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight']);
const LAYOUTS = new Set(['4way', '8way']);
const PLOTTABLE_SPACES = new Set(['register', 'sysRegister']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidLayout(value: unknown): value is WidgetLayout {
  if (!isPlainObject(value)) return false;
  return isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.w) && isFiniteNumber(value.h);
}

function isValidBinding(value: unknown): value is WidgetBinding | null {
  if (value === null) return true;
  if (!isPlainObject(value)) return false;
  if (typeof value.space !== 'string' || !SPACES.has(value.space)) return false;
  if (!isFiniteNumber(value.address)) return false;
  return isValidBindingSnapshot(value.snapshot);
}

function isValidThresholdRule(value: unknown): value is ThresholdRule {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'string' || value.id === '') return false;
  if (typeof value.comparator !== 'string' || !COMPARATORS.has(value.comparator)) return false;
  if (!isFiniteNumber(value.value)) return false;
  if (typeof value.role !== 'string' || !ROLES.has(value.role)) return false;
  if (value.label !== undefined && typeof value.label !== 'string') return false;
  return true;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

/** The shared shape every kind carries — checked regardless of kind. */
function isValidSharedConfig(value: Record<string, unknown>): boolean {
  if (typeof value.label !== 'string') return false;
  if (!isValidBinding(value.binding)) return false;
  if (typeof value.format !== 'string' || !FORMATS.has(value.format)) return false;
  if (!Array.isArray(value.thresholds) || !value.thresholds.every(isValidThresholdRule)) return false;
  return true;
}

/**
 * A kind's own fields beyond the shared shape. `valueRead`, `stateLED` and
 * `statusMatrix` carry nothing extra, so every field access here is optional
 * — a present-but-wrong-typed field still fails, an absent one does not.
 *
 * `kind: BoundWidgetKind` rather than `WidgetKind` is what makes this switch
 * exhaustive without a `button`/`directionalControl` case that would just
 * return `false` — those two are validated separately below, by
 * `isValidButtonConfig`/`isValidDirectionalControlConfig`.
 */
function isValidKindFields(kind: BoundWidgetKind, value: Record<string, unknown>): boolean {
  switch (kind) {
    case 'gauge':
    case 'progressBar':
      if (!isFiniteNumber(value.min) || !isFiniteNumber(value.max)) return false;
      if (!isOptionalString(value.unit)) return false;
      if (kind === 'progressBar' && value.orientation !== undefined) {
        if (value.orientation !== 'horizontal' && value.orientation !== 'vertical') return false;
      }
      return true;
    case 'encoderDisplay':
      if (!isFiniteNumber(value.conversionFactor)) return false;
      if (!isOptionalString(value.primaryUnit) || !isOptionalString(value.secondaryUnit)) return false;
      if (value.showRawValue !== undefined && typeof value.showRawValue !== 'boolean') return false;
      if (!isOptionalFiniteNumber(value.decimals)) return false;
      return true;
    case 'ledIndicator':
      if (!isFiniteNumber(value.onValue)) return false;
      if (!isOptionalString(value.onLabel) || !isOptionalString(value.offLabel)) return false;
      return true;
    case 'dropdown':
      if (!Array.isArray(value.options) || !value.options.every(isValidDropdownOption)) return false;
      return isOptionalConfirmation(value.confirmationRequired);
    case 'valueWrite':
      return isOptionalConfirmation(value.confirmationRequired);
    case 'valueRead':
    case 'stateLED':
    case 'statusMatrix':
      return true;
  }
}

function isOptionalConfirmation(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isValidDropdownOption(value: unknown): value is { value: number; label: string } {
  if (!isPlainObject(value)) return false;
  return isFiniteNumber(value.value) && typeof value.label === 'string';
}

function isValidWidgetTarget(value: unknown): value is WidgetTarget | null {
  if (value === null) return true;
  if (!isPlainObject(value)) return false;
  if (value.kind === 'address') {
    if (typeof value.space !== 'string' || !WRITABLE_SPACES.has(value.space)) return false;
    if (!isFiniteNumber(value.address)) return false;
    return isValidBindingSnapshot(value.snapshot);
  }
  if (value.kind === 'command') return isFiniteNumber(value.code);
  return false;
}

function isValidButtonConfig(value: Record<string, unknown>): boolean {
  if (typeof value.label !== 'string') return false;
  if (!isValidWidgetTarget(value.target)) return false;
  if (!isFiniteNumber(value.value)) return false;
  return isOptionalConfirmation(value.confirmationRequired);
}

function isValidDirectionalControlEntry(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  if (typeof value.direction !== 'string' || !DIRECTIONS.has(value.direction)) return false;
  if (!isFiniteNumber(value.command)) return false;
  return isOptionalString(value.label);
}

function isValidDirectionalControlConfig(value: Record<string, unknown>): boolean {
  if (typeof value.label !== 'string') return false;
  if (!Array.isArray(value.directions) || !value.directions.every(isValidDirectionalControlEntry)) return false;
  if (value.layout !== undefined && (typeof value.layout !== 'string' || !LAYOUTS.has(value.layout))) return false;
  return true;
}

/** A Data Table row or Alarm List entry — the same shared bound shape a single-value kind uses, no kind fields of its own. */
function isValidBoundEntry(value: unknown): boolean {
  return isPlainObject(value) && isValidSharedConfig(value);
}

function isValidDataTableConfig(value: Record<string, unknown>): boolean {
  if (typeof value.label !== 'string') return false;
  return Array.isArray(value.rows) && value.rows.every(isValidBoundEntry);
}

function isValidAlarmListConfig(value: Record<string, unknown>): boolean {
  if (typeof value.label !== 'string') return false;
  if (!Array.isArray(value.alarms) || !value.alarms.every(isValidBoundEntry)) return false;
  return typeof value.showInactive === 'boolean';
}

function isValidDeviceInfoConfig(value: Record<string, unknown>): boolean {
  return typeof value.label === 'string';
}

function isValidMiniPlotSeries(value: unknown): value is { space: string; address: number } | null {
  if (value === null) return true;
  if (!isPlainObject(value)) return false;
  if (typeof value.space !== 'string' || !PLOTTABLE_SPACES.has(value.space)) return false;
  if (!isFiniteNumber(value.address)) return false;
  return isValidBindingSnapshot(value.snapshot);
}

function isValidMiniPlotConfig(value: Record<string, unknown>): boolean {
  if (typeof value.label !== 'string') return false;
  if (!isValidMiniPlotSeries(value.series)) return false;
  return isFiniteNumber(value.pollInterval) && isFiniteNumber(value.timeSpan);
}

/**
 * A Container's own child list — the same `StoredWidget` shape a Dashboard's
 * top-level list is validated with, `allowContainer: false` passed down so a
 * hand-edited or corrupted settings file cannot smuggle in a nested
 * Container. `widgetRegistry.ts` already keeps `container` off the kinds a
 * Container's own add-Widget menu offers; this is the same rule enforced
 * against data that never went through that menu at all.
 */
function isValidContainerConfig(value: Record<string, unknown>): boolean {
  if (typeof value.label !== 'string') return false;
  if (!isFiniteNumber(value.padding) || !isFiniteNumber(value.spacing)) return false;
  return (
    Array.isArray(value.childWidgets) &&
    value.childWidgets.every(child => isValidStoredWidget(child, false))
  );
}

/**
 * `button` and `directionalControl` carry no `binding`/`format`/`thresholds`
 * — a Button writes a fixed configured value and Directional Control only
 * ever sends Commands, so neither displays a formatted, thresholded reading —
 * and, along with the five ticket 17 kinds, are validated against their own
 * shape rather than the shared one. `isBoundWidgetKind` is the single place
 * that split is recorded; this and `WidgetConfigDialog.tsx` both read it
 * rather than each keeping its own list.
 */
function isValidConfig(value: unknown, kind: WidgetKind): value is WidgetConfig {
  if (!isPlainObject(value)) return false;
  if (isBoundWidgetKind(kind)) {
    return isValidSharedConfig(value) && isValidKindFields(kind, value);
  }
  switch (kind) {
    case 'button':
      return isValidButtonConfig(value);
    case 'directionalControl':
      return isValidDirectionalControlConfig(value);
    case 'dataTable':
      return isValidDataTableConfig(value);
    case 'alarmList':
      return isValidAlarmListConfig(value);
    case 'deviceInfo':
      return isValidDeviceInfoConfig(value);
    case 'container':
      return isValidContainerConfig(value);
    case 'miniPlot':
      return isValidMiniPlotConfig(value);
  }
}

/**
 * `allowContainer` defaults to `true` for a Dashboard's own top-level
 * widgets and is passed `false` for a Container's own children — see
 * {@link isValidContainerConfig}.
 */
function isValidStoredWidget(value: unknown, allowContainer = true): value is StoredWidget {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'string' || value.id === '') return false;
  if (typeof value.kind !== 'string' || !isKnownWidgetKind(value.kind)) return false;
  if (!allowContainer && value.kind === 'container') return false;
  if (!isValidLayout(value.layout)) return false;
  if (!isValidConfig(value.config, value.kind)) return false;
  return true;
}

export function isValidStoredDashboard(value: unknown): value is StoredDashboard {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'string' || value.id === '') return false;
  if (typeof value.name !== 'string' || value.name === '') return false;
  if (!Array.isArray(value.widgets) || !value.widgets.every(widget => isValidStoredWidget(widget))) return false;
  return true;
}

/**
 * Repairs a stored Profile's Dashboard collection rather than only judging it.
 *
 * One corrupted Dashboard is dropped rather than costing every other saved
 * Dashboard, matching `sanitizeProfileWorkspaces`. Unlike that function, an
 * empty result here is a valid answer — `{ dashboards: [] }`, not
 * `undefined` — because a Profile may legitimately have deleted every
 * Dashboard it had; `undefined` is reserved for input that is not even
 * shaped like a collection, which is what tells a Dashboard Pane to seed a
 * first Dashboard rather than show an intentionally empty one.
 */
export function sanitizeProfileDashboards(value: unknown): ProfileDashboards | undefined {
  if (!isPlainObject(value)) return undefined;
  if (!Array.isArray(value.dashboards)) return undefined;
  return { dashboards: value.dashboards.filter(isValidStoredDashboard) };
}

// ── Building the first Dashboard a Profile opens into ───────────────────────

export function seedProfileDashboards(dashboard: StoredDashboard): ProfileDashboards {
  return { dashboards: [dashboard] };
}

// ── Collection operations ────────────────────────────────────────────────
//
// Pure and immutable, so a Dashboard Pane instance and its siblings can share
// one Profile's collection without any of them holding a second copy of what
// "the current Dashboards" means.

export function addDashboard(collection: ProfileDashboards, dashboard: StoredDashboard): ProfileDashboards {
  return { dashboards: [...collection.dashboards, dashboard] };
}

export function renameDashboard(collection: ProfileDashboards, id: string, name: string): ProfileDashboards {
  return { dashboards: collection.dashboards.map(d => (d.id === id ? { ...d, name } : d)) };
}

export function removeDashboard(collection: ProfileDashboards, id: string): ProfileDashboards {
  return { dashboards: collection.dashboards.filter(d => d.id !== id) };
}

/** Replaces one Dashboard's content in place, identified by id. A no-op if that id is not there. */
export function updateDashboard(
  collection: ProfileDashboards,
  id: string,
  updater: (dashboard: StoredDashboard) => StoredDashboard
): ProfileDashboards {
  if (!collection.dashboards.some(d => d.id === id)) return collection;
  return { dashboards: collection.dashboards.map(d => (d.id === id ? updater(d) : d)) };
}

// ── Widget operations within one Dashboard ──────────────────────────────────
//
// Composed with `updateDashboard` by the caller — e.g.
// `updateDashboard(collection, id, d => addWidget(d, widget))`.

export function addWidget(dashboard: StoredDashboard, widget: StoredWidget): StoredDashboard {
  return { ...dashboard, widgets: [...dashboard.widgets, widget] };
}

export function removeWidget(dashboard: StoredDashboard, widgetId: string): StoredDashboard {
  return { ...dashboard, widgets: dashboard.widgets.filter(w => w.id !== widgetId) };
}

export function updateWidgetConfig(
  dashboard: StoredDashboard,
  widgetId: string,
  config: WidgetConfig
): StoredDashboard {
  return { ...dashboard, widgets: dashboard.widgets.map(w => (w.id === widgetId ? { ...w, config } : w)) };
}

/** Applies a batch of layouts by Widget id — what a grid's own layout-change event hands back. */
export function applyWidgetLayouts(
  dashboard: StoredDashboard,
  layouts: ReadonlyMap<string, WidgetLayout>
): StoredDashboard {
  return {
    ...dashboard,
    widgets: dashboard.widgets.map(w => {
      const layout = layouts.get(w.id);
      return layout ? { ...w, layout } : w;
    }),
  };
}

// ── Placement ────────────────────────────────────────────────────────────

/** The first free row-major position a new Widget of this size fits, without overlapping any existing one. */
export function nextAvailablePosition(
  existing: readonly WidgetLayout[],
  size: { readonly w: number; readonly h: number },
  cols: number
): { readonly x: number; readonly y: number } {
  let y = 0;
  let x = 0;

  while (true) {
    const overlaps = existing.some(
      layout => x < layout.x + layout.w && x + size.w > layout.x && y < layout.y + layout.h && y + size.h > layout.y
    );
    if (!overlaps) return { x, y };

    x += size.w;
    if (x + size.w > cols) {
      x = 0;
      y += 1;
    }
  }
}

/**
 * A fresh Widget of this kind, at its default size and configuration, placed
 * at the next free position among `existing` layouts. Null when `kind` names
 * no known Widget kind.
 *
 * `DashboardPane`'s own add-Widget flow and a Container's — adding a child
 * from directly within itself, ticket 17 — are otherwise the same four
 * steps (look up the definition, find a free slot, generate an id, build the
 * `StoredWidget`) with only what the result is placed *into* differing, so
 * this is the one place that shape is built rather than two copies drifting
 * apart the way a third Widget-adding surface eventually would.
 */
// ── Backfilling pre-feature binding snapshots (`.scratch/map-binding-drift`, ticket 01) ──
//
// A Widget's own `binding`/`target`/`series` saved before this feature
// shipped has no captured snapshot at all. Walked once, against the entries
// active when it is first loaded under the new code, so every later Map edit
// has a real baseline to diff against — see `bindingIdentity.ts`'s own
// `backfillSnapshot` doc comment for why this must actually persist rather
// than being recomputed live on every read.

function backfillWidgetBinding(
  binding: WidgetBinding | null,
  entriesBySpace: EntriesBySpace
): { readonly binding: WidgetBinding | null; readonly changed: boolean } {
  if (binding === null) return { binding, changed: false };
  const snapshot = backfillSnapshot(binding.snapshot, binding.address, entriesBySpace[binding.space]);
  if (snapshot === binding.snapshot) return { binding, changed: false };
  return { binding: { ...binding, snapshot }, changed: true };
}

function backfillWidgetTarget(
  target: WidgetTarget | null,
  entriesBySpace: EntriesBySpace
): { readonly target: WidgetTarget | null; readonly changed: boolean } {
  if (target === null || target.kind === 'command') return { target, changed: false };
  const snapshot = backfillSnapshot(target.snapshot, target.address, entriesBySpace[target.space]);
  if (snapshot === target.snapshot) return { target, changed: false };
  return { target: { ...target, snapshot }, changed: true };
}

function backfillBoundEntries(
  entries: readonly BoundWidgetConfig[],
  entriesBySpace: EntriesBySpace
): { readonly entries: readonly BoundWidgetConfig[]; readonly changed: boolean } {
  let anyChanged = false;
  const next = (entries ?? []).map(row => {
    const result = backfillWidgetBinding(row.binding, entriesBySpace);
    if (!result.changed) return row;
    anyChanged = true;
    return { ...row, binding: result.binding };
  });
  return anyChanged ? { entries: next, changed: true } : { entries, changed: false };
}

function backfillWidgetConfigForKind(
  kind: WidgetKind,
  config: WidgetConfig,
  entriesBySpace: EntriesBySpace
): { readonly config: WidgetConfig; readonly changed: boolean } {
  if (isBoundWidgetKind(kind)) {
    const bound = config as BoundWidgetConfig;
    const result = backfillWidgetBinding(bound.binding, entriesBySpace);
    return result.changed ? { config: { ...bound, binding: result.binding }, changed: true } : { config, changed: false };
  }
  switch (kind) {
    case 'button': {
      const button = config as ButtonWidgetConfig;
      const result = backfillWidgetTarget(button.target, entriesBySpace);
      return result.changed ? { config: { ...button, target: result.target }, changed: true } : { config, changed: false };
    }
    case 'dataTable': {
      const table = config as DataTableWidgetConfig;
      const result = backfillBoundEntries(table.rows, entriesBySpace);
      return result.changed ? { config: { ...table, rows: result.entries }, changed: true } : { config, changed: false };
    }
    case 'alarmList': {
      const alarmList = config as AlarmListWidgetConfig;
      const result = backfillBoundEntries(alarmList.alarms, entriesBySpace);
      return result.changed
        ? { config: { ...alarmList, alarms: result.entries }, changed: true }
        : { config, changed: false };
    }
    case 'miniPlot': {
      const miniPlot = config as MiniPlotWidgetConfig;
      if (miniPlot.series === null) return { config, changed: false };
      const snapshot = backfillSnapshot(miniPlot.series.snapshot, miniPlot.series.address, entriesBySpace[miniPlot.series.space]);
      if (snapshot === miniPlot.series.snapshot) return { config, changed: false };
      return { config: { ...miniPlot, series: { ...miniPlot.series, snapshot } }, changed: true };
    }
    case 'directionalControl':
    case 'deviceInfo':
    case 'container':
      return { config, changed: false };
  }
}

/** Backfills one Widget's own binding-like fields, recursing into a Container's `childWidgets` — the only kind that nests. */
function backfillStoredWidget(
  widget: StoredWidget,
  entriesBySpace: EntriesBySpace
): { readonly widget: StoredWidget; readonly changed: boolean } {
  if (widget.kind === 'container') {
    const container = widget.config as ContainerWidgetConfig;
    let anyChanged = false;
    const childWidgets = (container.childWidgets ?? []).map(child => {
      const result = backfillStoredWidget(child, entriesBySpace);
      if (result.changed) anyChanged = true;
      return result.widget;
    });
    if (!anyChanged) return { widget, changed: false };
    return { widget: { ...widget, config: { ...container, childWidgets } }, changed: true };
  }

  const result = backfillWidgetConfigForKind(widget.kind, widget.config, entriesBySpace);
  if (!result.changed) return { widget, changed: false };
  return { widget: { ...widget, config: result.config }, changed: true };
}

/**
 * Backfills every Widget's own binding, write target and Mini-Plot series
 * snapshot in one Dashboard. Returns the same `dashboard` reference,
 * unchanged, when nothing needed it — the common case once a Profile's data
 * has already been backfilled once.
 */
export function backfillDashboardWidgets(
  dashboard: StoredDashboard,
  entriesBySpace: EntriesBySpace
): { readonly dashboard: StoredDashboard; readonly changed: boolean } {
  let anyChanged = false;
  const widgets = (dashboard.widgets ?? []).map(widget => {
    const result = backfillStoredWidget(widget, entriesBySpace);
    if (result.changed) anyChanged = true;
    return result.widget;
  });
  return anyChanged ? { dashboard: { ...dashboard, widgets }, changed: true } : { dashboard, changed: false };
}

export function createStoredWidget(
  kind: WidgetKind,
  existing: readonly WidgetLayout[],
  cols: number
): StoredWidget | null {
  const definition = widgetDefinition(kind);
  if (!definition) return null;
  const position = nextAvailablePosition(existing, definition.defaultSize, cols);
  return {
    id: createWidgetId(),
    kind: definition.kind,
    layout: { x: position.x, y: position.y, w: definition.defaultSize.w, h: definition.defaultSize.h },
    config: definition.defaultConfig(),
  };
}
