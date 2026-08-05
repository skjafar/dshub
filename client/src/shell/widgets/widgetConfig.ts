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

import type { AddressSpace } from '../addressSpace';
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

/** Every kind-specific Widget configuration, `valueRead`/`stateLED`/`statusMatrix`'s bare `BoundWidgetConfig` included. */
export type WidgetConfig =
  | BoundWidgetConfig
  | GaugeWidgetConfig
  | ProgressBarWidgetConfig
  | EncoderDisplayWidgetConfig
  | LedIndicatorWidgetConfig;
