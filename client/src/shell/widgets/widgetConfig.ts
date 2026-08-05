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
import type { DisplayFormat } from '../valueFormat';
import type { ThresholdRule } from './threshold';

/** Which Device address a Widget reads, and from which Address Space. */
export interface WidgetBinding {
  readonly space: AddressSpace;
  readonly address: number;
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
 */
export type WidgetTarget =
  | { readonly kind: 'address'; readonly space: WritableAddressSpace; readonly address: number }
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
  | DirectionalControlWidgetConfig;
