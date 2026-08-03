/**
 * Every kind of Pane the Workspace can open.
 *
 * One list, because three things have to agree and drift silently if they do
 * not: what the Workspace can restore from a saved layout, what the reopen menu
 * offers, and what the default arrangement asks for. Adding a Pane kind is
 * adding an entry here.
 */

import type { ComponentType } from 'react';
import { OverviewPane } from './panes/OverviewPane';

export type PaneKind = 'overview';

export interface PaneDefinition {
  readonly kind: PaneKind;
  /** Shown on the Pane's tab and in the reopen menu. */
  readonly title: string;
  /** One-line description for the reopen menu. */
  readonly description: string;
  /**
   * Whether several of this kind may be open at once. The Overview is the
   * Device's own health and there is only one Device, so it is a singleton;
   * the data Panes that follow are not.
   */
  readonly singleton: boolean;
  readonly component: ComponentType;
}

export const PANES: readonly PaneDefinition[] = [
  {
    kind: 'overview',
    title: 'Overview',
    description: "The Device's own identity, uptime, link and recent activity",
    singleton: true,
    component: OverviewPane,
  },
];

export function paneDefinition(kind: string): PaneDefinition | undefined {
  return PANES.find(pane => pane.kind === kind);
}

/**
 * Whether this build still has a Pane of that kind.
 *
 * A stored Workspace can name a kind this build no longer has — after a
 * downgrade, or a kind retired between versions. Restoring has to skip those
 * rather than fail, which is what makes a stale layout degrade to something
 * usable instead of an empty window.
 */
export function isKnownPaneKind(kind: string): kind is PaneKind {
  return paneDefinition(kind) !== undefined;
}

/**
 * Panel ids.
 *
 * A singleton uses its bare kind, so its id is stable across sessions and a
 * saved layout keeps naming the same Pane. Everything else carries an instance
 * number, because several Panes of a kind may be open at once and dockview
 * rejects a duplicate id — which would otherwise throw out of a menu click,
 * from outside every Pane's own error boundary.
 */
const INSTANCE_SEPARATOR = '#';

export function paneId(kind: PaneKind, instance = 0): string {
  return instance === 0 ? kind : `${kind}${INSTANCE_SEPARATOR}${instance}`;
}

/** The kind a panel id belongs to, or undefined if this build has no such kind. */
export function kindOfPaneId(id: string): PaneKind | undefined {
  const [kind = ''] = id.split(INSTANCE_SEPARATOR);
  return isKnownPaneKind(kind) ? kind : undefined;
}
