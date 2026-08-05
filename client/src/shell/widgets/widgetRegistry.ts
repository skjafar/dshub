/**
 * Every kind of Widget the Dashboard grid can host.
 *
 * Mirrors `paneRegistry.ts`'s shape and reasoning: one list, so what a saved
 * Dashboard can restore, what the add-Widget affordance offers, and what a
 * Widget's own default size and configuration are cannot drift apart into
 * three separate answers.
 *
 * Seven kinds live here: `valueRead`, delivered in ticket 14 as proof the
 * shared surface works end to end, and the six more that round out the Value
 * and Indicator families. The other nine join this list in later tickets
 * without changing its shape.
 */

import type { ComponentType } from 'react';
import { EncoderDisplayWidget } from '../panes/widgets/EncoderDisplayWidget';
import { GaugeWidget } from '../panes/widgets/GaugeWidget';
import { LedIndicatorWidget } from '../panes/widgets/LedIndicatorWidget';
import { ProgressBarWidget } from '../panes/widgets/ProgressBarWidget';
import { StateLedWidget } from '../panes/widgets/StateLedWidget';
import { StatusMatrixWidget } from '../panes/widgets/StatusMatrixWidget';
import { ValueReadWidget } from '../panes/widgets/ValueReadWidget';
import {
  defaultBoundWidgetConfig,
  defaultEncoderDisplayWidgetConfig,
  defaultGaugeWidgetConfig,
  defaultLedIndicatorWidgetConfig,
  defaultProgressBarWidgetConfig,
} from './widgetConfig';
import type { WidgetConfig } from './widgetConfig';

export type WidgetKind =
  | 'valueRead'
  | 'gauge'
  | 'progressBar'
  | 'encoderDisplay'
  | 'ledIndicator'
  | 'stateLED'
  | 'statusMatrix';

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
