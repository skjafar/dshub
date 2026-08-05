/**
 * Every kind of Widget the Dashboard grid can host.
 *
 * Mirrors `paneRegistry.ts`'s shape and reasoning: one list, so what a saved
 * Dashboard can restore, what the add-Widget affordance offers, and what a
 * Widget's own default size and configuration are cannot drift apart into
 * three separate answers. `valueRead` is the only entry today — the single
 * kind delivered end to end as proof the shared surface behind it actually
 * works; the other fifteen join this list in later tickets without changing
 * its shape.
 */

import type { ComponentType } from 'react';
import { ValueReadWidget } from '../panes/widgets/ValueReadWidget';
import { defaultBoundWidgetConfig } from './widgetConfig';
import type { BoundWidgetConfig } from './widgetConfig';

export type WidgetKind = 'valueRead';

export interface WidgetProps {
  readonly config: BoundWidgetConfig;
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
  readonly defaultConfig: () => BoundWidgetConfig;
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
