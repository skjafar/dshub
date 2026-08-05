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
