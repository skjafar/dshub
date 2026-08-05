/**
 * Every kind of Widget the Dashboard grid can host.
 *
 * Mirrors `paneRegistry.ts`'s shape and reasoning: one list, so what a saved
 * Dashboard can restore, what the add-Widget affordance offers, and what a
 * Widget's own default size and configuration are cannot drift apart into
 * three separate answers.
 *
 * Eleven kinds live here: `valueRead`, delivered in ticket 14 as proof the
 * shared surface works end to end, the six more from ticket 15 that round out
 * the Value and Indicator families, and the four from ticket 16 — button,
 * dropdown, value write and directional control — that write to the Device
 * rather than only reading from it. The remaining five join this list in a
 * later ticket without changing its shape.
 */

import type { ComponentType } from 'react';
import { ButtonWidget } from '../panes/widgets/ButtonWidget';
import { DirectionalControlWidget } from '../panes/widgets/DirectionalControlWidget';
import { DropdownWidget } from '../panes/widgets/DropdownWidget';
import { EncoderDisplayWidget } from '../panes/widgets/EncoderDisplayWidget';
import { GaugeWidget } from '../panes/widgets/GaugeWidget';
import { LedIndicatorWidget } from '../panes/widgets/LedIndicatorWidget';
import { ProgressBarWidget } from '../panes/widgets/ProgressBarWidget';
import { StateLedWidget } from '../panes/widgets/StateLedWidget';
import { StatusMatrixWidget } from '../panes/widgets/StatusMatrixWidget';
import { ValueReadWidget } from '../panes/widgets/ValueReadWidget';
import { ValueWriteWidget } from '../panes/widgets/ValueWriteWidget';
import {
  defaultBoundWidgetConfig,
  defaultButtonWidgetConfig,
  defaultDirectionalControlWidgetConfig,
  defaultDropdownWidgetConfig,
  defaultEncoderDisplayWidgetConfig,
  defaultGaugeWidgetConfig,
  defaultLedIndicatorWidgetConfig,
  defaultProgressBarWidgetConfig,
  defaultValueWriteWidgetConfig,
} from './widgetConfig';
import type { WidgetConfig } from './widgetConfig';

export type WidgetKind =
  | 'valueRead'
  | 'gauge'
  | 'progressBar'
  | 'encoderDisplay'
  | 'ledIndicator'
  | 'stateLED'
  | 'statusMatrix'
  | 'button'
  | 'dropdown'
  | 'valueWrite'
  | 'directionalControl';

/**
 * Kinds configured through the read side of the shared surface —
 * binding/format/thresholds. `button` and `directionalControl` are the only
 * two that are not: a Button writes a fixed configured value and Directional
 * Control only ever sends Commands, so neither displays a formatted,
 * thresholded reading. `WidgetConfigDialog.tsx` and `dashboardStore.ts` both
 * need this same split — one for which section to render, the other for
 * which shape to validate against — so it lives here once rather than as two
 * independently maintained exclusion lists that a future non-bound kind could
 * update inconsistently.
 */
const NON_BOUND_WIDGET_KINDS: ReadonlySet<WidgetKind> = new Set(['button', 'directionalControl']);

export type BoundWidgetKind = Exclude<WidgetKind, 'button' | 'directionalControl'>;

export function isBoundWidgetKind(kind: WidgetKind): kind is BoundWidgetKind {
  return !NON_BOUND_WIDGET_KINDS.has(kind);
}

export interface WidgetProps {
  readonly config: WidgetConfig;
}

export interface WidgetSize {
  readonly w: number;
  readonly h: number;
  readonly minW: number;
  readonly minH: number;
}

export interface WidgetDefinition {
  readonly kind: WidgetKind;
  /** Shown on the add-Widget affordance and as this Widget's default label. */
  readonly title: string;
  readonly description: string;
  readonly defaultSize: WidgetSize;
  readonly defaultConfig: () => WidgetConfig;
  readonly component: ComponentType<WidgetProps>;
}

export const WIDGETS: readonly WidgetDefinition[] = [
  {
    kind: 'valueRead',
    title: 'Value Readout',
    description: 'One bound value, formatted and coloured by threshold.',
    defaultSize: { w: 3, h: 2, minW: 2, minH: 1 },
    defaultConfig: () => defaultBoundWidgetConfig('Value'),
    component: ValueReadWidget,
  },
  {
    kind: 'gauge',
    title: 'Gauge',
    description: 'A bound value read against a min/max range as an arc.',
    defaultSize: { w: 3, h: 3, minW: 2, minH: 2 },
    defaultConfig: () => defaultGaugeWidgetConfig('Gauge'),
    component: GaugeWidget,
  },
  {
    kind: 'progressBar',
    title: 'Progress Bar',
    description: 'A bound value read against a min/max range as a fill.',
    defaultSize: { w: 4, h: 1, minW: 2, minH: 1 },
    defaultConfig: () => defaultProgressBarWidgetConfig('Progress'),
    component: ProgressBarWidget,
  },
  {
    kind: 'encoderDisplay',
    title: 'Encoder Display',
    description: 'A raw reading converted to a physical unit by a constant factor.',
    defaultSize: { w: 3, h: 2, minW: 2, minH: 1 },
    defaultConfig: () => defaultEncoderDisplayWidgetConfig('Position'),
    component: EncoderDisplayWidget,
  },
  {
    kind: 'ledIndicator',
    title: 'LED Indicator',
    description: 'A bound value read as on or off.',
    defaultSize: { w: 2, h: 1, minW: 1, minH: 1 },
    defaultConfig: () => defaultLedIndicatorWidgetConfig('Status'),
    component: LedIndicatorWidget,
  },
  {
    kind: 'stateLED',
    title: 'State LED',
    description: 'A bound value read as one of several named states.',
    defaultSize: { w: 2, h: 1, minW: 2, minH: 1 },
    defaultConfig: () => defaultBoundWidgetConfig('State'),
    component: StateLedWidget,
  },
  {
    kind: 'statusMatrix',
    title: 'Status Matrix',
    description: 'A bound value read bit by bit, as a grid of thirty-two indicators.',
    defaultSize: { w: 4, h: 3, minW: 2, minH: 2 },
    defaultConfig: () => defaultBoundWidgetConfig('Flags'),
    component: StatusMatrixWidget,
  },
  {
    kind: 'button',
    title: 'Button',
    description: 'A fixed value, written or sent to a Command on click.',
    defaultSize: { w: 2, h: 1, minW: 1, minH: 1 },
    defaultConfig: () => defaultButtonWidgetConfig('Button'),
    component: ButtonWidget,
  },
  {
    kind: 'dropdown',
    title: 'Dropdown',
    description: 'A picklist that mirrors and writes the same bound address.',
    defaultSize: { w: 3, h: 2, minW: 2, minH: 1 },
    defaultConfig: () => defaultDropdownWidgetConfig('Dropdown'),
    component: DropdownWidget,
  },
  {
    kind: 'valueWrite',
    title: 'Value Write',
    description: 'A typed value, written to the bound address it mirrors.',
    defaultSize: { w: 3, h: 2, minW: 2, minH: 1 },
    defaultConfig: () => defaultValueWriteWidgetConfig('Value'),
    component: ValueWriteWidget,
  },
  {
    kind: 'directionalControl',
    title: 'Directional Control',
    description: 'A pad of directions, each sending a Command, repeating while held.',
    defaultSize: { w: 4, h: 4, minW: 3, minH: 3 },
    defaultConfig: () => defaultDirectionalControlWidgetConfig('Jog'),
    component: DirectionalControlWidget,
  },
];

export function widgetDefinition(kind: string): WidgetDefinition | undefined {
  return WIDGETS.find(widget => widget.kind === kind);
}

/**
 * Whether this build still has a Widget kind of that name.
 *
 * A stored Dashboard can name a kind this build no longer has, the same way a
 * stored Workspace can name a retired Pane kind — see `paneRegistry.ts`'s
 * `isKnownPaneKind`. `dashboardStore`'s sanitizer drops just that Widget rather
 * than failing the whole Dashboard.
 */
export function isKnownWidgetKind(kind: string): kind is WidgetKind {
  return widgetDefinition(kind) !== undefined;
}
