/**
 * The configuration surface every bound Widget kind shares.
 *
 * Today's sixteen Widget kinds each re-implemented address binding, value
 * formatting and threshold evaluation, and that duplication — not the sixteen
 * kinds themselves — is what this rebuild factors away. A kind's own config
 * extends this shape with whatever it alone needs (a gauge's min/max, a
 * dropdown's options); `valueRead`, delivered here as the proof the path
 * works end to end, needs nothing beyond it.
 */

import type { AddressSpace, WritableAddressSpace } from '../addressSpace';
import type { BindingSnapshot } from '../bindingIdentity';
import type { PlottableSpace } from '../plotStream';
import type { DisplayFormat } from '../valueFormat';
import type { ThresholdRule } from './threshold';
import type { WidgetKind } from './widgetRegistry';

/**
 * Which Device address a Widget reads, from which Address Space, and a
 * snapshot of the entry it was bound to (`.scratch/map-binding-drift`) — the
 * address remains the only value actually used for a read; `snapshot` is
 * what a later Map edit is diffed against. `null` only ever means "backfilled
 * from a pre-feature binding and nothing was found at this address" — a fresh
 * bind always captures a real snapshot.
 */
export interface WidgetBinding {
  readonly space: AddressSpace;
  readonly address: number;
  readonly snapshot: BindingSnapshot | null;
}

export interface BoundWidgetConfig {
  readonly label: string;
  /** Null until an Operator has picked an address — a Widget starts unbound, not bound to address zero. */
  readonly binding: WidgetBinding | null;
  readonly format: DisplayFormat;
  readonly thresholds: readonly ThresholdRule[];
}

export function defaultBoundWidgetConfig(label: string): BoundWidgetConfig {
  return { label, binding: null, format: 'decimal', thresholds: [] };
}

// ── Kind-specific extensions ─────────────────────────────────────────────
//
// A kind needs its own interface only when it carries fields beyond the
// shared shape. `stateLED` and `statusMatrix` do not — a state's colour and
// name come from `thresholds` (via `'=='` rules) and a bit's condition comes
// from decomposing the one bound reading — so both use `BoundWidgetConfig`
// directly rather than an empty extension of it.

export interface GaugeWidgetConfig extends BoundWidgetConfig {
  readonly min: number;
  readonly max: number;
  readonly unit?: string;
}

export function defaultGaugeWidgetConfig(label: string): GaugeWidgetConfig {
  return { ...defaultBoundWidgetConfig(label), min: 0, max: 100 };
}

export interface ProgressBarWidgetConfig extends BoundWidgetConfig {
  readonly min: number;
  readonly max: number;
  readonly unit?: string;
  readonly orientation?: 'horizontal' | 'vertical';
}

export function defaultProgressBarWidgetConfig(label: string): ProgressBarWidgetConfig {
  return { ...defaultBoundWidgetConfig(label), min: 0, max: 100 };
}

/**
 * Converts a raw reading into a physical measurement — an encoder's steps
 * into millimetres, say. The legacy widget could also read the factor live
 * from a Parameter; this keeps the constant case only; a live-sourced factor
 * is a real capability but not one this ticket's scope covers.
 */
export interface EncoderDisplayWidgetConfig extends BoundWidgetConfig {
  readonly conversionFactor: number;
  readonly primaryUnit?: string;
  readonly secondaryUnit?: string;
  readonly showRawValue?: boolean;
  readonly decimals?: number;
}

export function defaultEncoderDisplayWidgetConfig(label: string): EncoderDisplayWidgetConfig {
  return { ...defaultBoundWidgetConfig(label), conversionFactor: 1 };
}

export interface LedIndicatorWidgetConfig extends BoundWidgetConfig {
  /** The decoded reading counted as "on" — the LED's weight (filled vs outline) follows this; its colour follows `thresholds`, same as every other kind. */
  readonly onValue: number;
  readonly onLabel?: string;
  readonly offLabel?: string;
}

export function defaultLedIndicatorWidgetConfig(label: string): LedIndicatorWidgetConfig {
  return { ...defaultBoundWidgetConfig(label), onValue: 1 };
}

// ── Control family (ticket 16) ───────────────────────────────────────────
//
// These four write to the Device rather than only reading from it. A read
// binding names an address; a write needs to say more, because a Command is
// not an address — {@link WidgetTarget} is the write-side counterpart of
// {@link WidgetBinding} for exactly that reason.

/**
 * Where a control Widget's write goes: one address in a writable Space, or a
 * Command by its code. Never System Registers — the protocol refuses every
 * write there, so a Widget offering one would be an affordance for a write
 * that can only fail.
 *
 * A Command target carries no `snapshot` at all — its identity is a code the
 * Engineer assigns themselves, not a derived address, so it is never subject
 * to binding drift (`.scratch/map-binding-drift`, user story 27).
 */
export type WidgetTarget =
  | { readonly kind: 'address'; readonly space: WritableAddressSpace; readonly address: number; readonly snapshot: BindingSnapshot | null }
  | { readonly kind: 'command'; readonly code: number };

/**
 * A fixed value, sent on click. Not a `BoundWidgetConfig` — a Button
 * neither displays nor formats a live reading, so `format`/`thresholds` would
 * be fields with nothing to act on.
 */
export interface ButtonWidgetConfig {
  readonly label: string;
  /** Null until an Operator has picked a target — a Button starts unbound, the same as a read Widget's `binding`. */
  readonly target: WidgetTarget | null;
  readonly value: number;
  readonly confirmationRequired?: boolean;
}

export function defaultButtonWidgetConfig(label: string): ButtonWidgetConfig {
  return { label, target: null, value: 0 };
}

export interface DropdownOption {
  readonly value: number;
  readonly label: string;
}

/**
 * Extends `BoundWidgetConfig` rather than carrying its own target: a Dropdown
 * mirrors the address it writes, the same one address doing double duty as
 * read and write, so the shared binding/format machinery already fits it —
 * only System Registers make no sense to offer, since a write there always
 * fails.
 */
export interface DropdownWidgetConfig extends BoundWidgetConfig {
  readonly options: readonly DropdownOption[];
  readonly confirmationRequired?: boolean;
}

export function defaultDropdownWidgetConfig(label: string): DropdownWidgetConfig {
  return { ...defaultBoundWidgetConfig(label), options: [] };
}

/** Same reasoning as {@link DropdownWidgetConfig}: one address, read and written through the shared binding. */
export interface ValueWriteWidgetConfig extends BoundWidgetConfig {
  readonly confirmationRequired?: boolean;
}

export function defaultValueWriteWidgetConfig(label: string): ValueWriteWidgetConfig {
  return defaultBoundWidgetConfig(label);
}

/** The eight directions a pad can offer a Command for. Diagonals are `8way`-layout only. */
export type Direction = 'up' | 'down' | 'left' | 'right' | 'upLeft' | 'upRight' | 'downLeft' | 'downRight';

export interface DirectionalControlEntry {
  readonly direction: Direction;
  readonly command: number;
  readonly label?: string;
}

/**
 * Command-only — every direction sends a numbered instruction, never writes
 * an address — so this carries no `WidgetTarget`/`WidgetBinding` at all, just
 * the codes themselves.
 */
export interface DirectionalControlWidgetConfig {
  readonly label: string;
  readonly directions: readonly DirectionalControlEntry[];
  readonly layout?: '4way' | '8way';
}

export function defaultDirectionalControlWidgetConfig(label: string): DirectionalControlWidgetConfig {
  return { label, directions: [], layout: '4way' };
}

// ── Composite family (ticket 17) ─────────────────────────────────────────
//
// Data Table and Alarm List are both, at heart, a list of the same
// {@link BoundWidgetConfig} shape every single-value kind already uses — a
// row is a label, a binding, a format and thresholds, exactly like a Value
// Readout. Reusing the shape rather than inventing a row-specific one is what
// keeps "no duplicated binding or formatting logic" true for a multi-entry
// kind too. Device Info and Mini-Plot are not bound at all — the former shows
// the connection's own identity and health rather than any addressed value,
// the latter names one address but has no formatted text or threshold colour
// to carry, only a traced line — so both are their own minimal shapes,
// alongside {@link ButtonWidgetConfig} and {@link DirectionalControlWidgetConfig}.

/** One Data Table row: the same label/binding/format/thresholds every bound kind shares. No id of its own — see `DropdownOption`'s own precedent; a row reorders only by explicit add/remove. */
export type DataTableRow = BoundWidgetConfig;

export interface DataTableWidgetConfig {
  readonly label: string;
  readonly rows: readonly DataTableRow[];
}

export function defaultDataTableWidgetConfig(label: string): DataTableWidgetConfig {
  return { label, rows: [] };
}

/** One Alarm List entry: a condition is "active" whenever its evaluated threshold role is `warn` or `error` — see `AlarmListWidget.tsx`. */
export type AlarmListEntry = BoundWidgetConfig;

export interface AlarmListWidgetConfig {
  readonly label: string;
  readonly alarms: readonly AlarmListEntry[];
  /** Whether a clear (non-active) alarm still shows in the list, or only active ones do. */
  readonly showInactive: boolean;
}

export function defaultAlarmListWidgetConfig(label: string): AlarmListWidgetConfig {
  return { label, alarms: [], showInactive: true };
}

/**
 * Carries nothing beyond the shared `label` — every field it shows (board
 * identity, link state, uptime) comes from the connection itself, not from an
 * addressed reading, so there is no binding, format or threshold to
 * configure. Mirrors `Overview.tsx`'s own identity/health surface at Widget
 * scale rather than reimplementing it.
 */
export interface DeviceInfoWidgetConfig {
  readonly label: string;
}

export function defaultDeviceInfoWidgetConfig(label: string): DeviceInfoWidgetConfig {
  return { label };
}

/**
 * Groups other Widgets in their own nested grid — a Dashboard-within-a-
 * Widget, deliberately: `childWidgets` reuses the exact `StoredWidget` shape
 * a Dashboard's own top-level list is made of, so placing, resizing,
 * configuring and removing a child works the same way it does one level up.
 * Not itself offered as a child kind — see `widgetRegistry.ts` — so nesting
 * cannot recurse.
 */
export interface ContainerWidgetConfig {
  readonly label: string;
  readonly padding: number;
  readonly spacing: number;
  readonly childWidgets: readonly StoredWidget[];
}

export function defaultContainerWidgetConfig(label: string): ContainerWidgetConfig {
  return { label, padding: 8, spacing: 8, childWidgets: [] };
}

/** The one address a Mini-Plot traces — register or system register, the two spaces `plotStream` can stream at all. */
export interface MiniPlotSeries {
  readonly space: PlottableSpace;
  readonly address: number;
  readonly snapshot: BindingSnapshot | null;
}

export interface MiniPlotWidgetConfig {
  readonly label: string;
  /** Null until an Operator has picked an address — the same starts-unbound convention every bound kind's own `binding` follows. */
  readonly series: MiniPlotSeries | null;
  readonly pollInterval: number;
  readonly timeSpan: number;
}

export function defaultMiniPlotWidgetConfig(label: string): MiniPlotWidgetConfig {
  return { label, series: null, pollInterval: 250, timeSpan: 60 };
}

/** Every kind-specific Widget configuration, `valueRead`/`stateLED`/`statusMatrix`'s bare `BoundWidgetConfig` included. */
export type WidgetConfig =
  | BoundWidgetConfig
  | GaugeWidgetConfig
  | ProgressBarWidgetConfig
  | EncoderDisplayWidgetConfig
  | LedIndicatorWidgetConfig
  | ButtonWidgetConfig
  | DropdownWidgetConfig
  | ValueWriteWidgetConfig
  | DirectionalControlWidgetConfig
  | DataTableWidgetConfig
  | AlarmListWidgetConfig
  | DeviceInfoWidgetConfig
  | ContainerWidgetConfig
  | MiniPlotWidgetConfig;

// ── The stored envelope around one Widget's configuration ────────────────
//
// Lives here rather than in `dashboardStore.ts` (which re-exports both)
// because `ContainerWidgetConfig.childWidgets` needs `StoredWidget` and
// `dashboardStore.ts` already imports this module for `WidgetConfig` — the
// dependency has to run one way, and this is the lower-level module of the
// two.

export interface WidgetLayout {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface StoredWidget {
  readonly id: string;
  readonly kind: WidgetKind;
  readonly layout: WidgetLayout;
  readonly config: WidgetConfig;
}
