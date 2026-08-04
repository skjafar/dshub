/**
 * Every kind of Pane the Workspace can open.
 *
 * One list, because three things have to agree and drift silently if they do
 * not: what the Workspace can restore from a saved layout, what the reopen menu
 * offers, and what the default arrangement asks for. Adding a Pane kind is
 * adding an entry here.
 */

import type { ComponentType } from 'react';
import type { AddressSpace } from './addressSpace';
import { ActivityLogPane } from './panes/ActivityLogPane';
import { CommandPane } from './panes/CommandPane';
import { OverviewPane } from './panes/OverviewPane';
import { ParameterPane } from './panes/ParameterPane';
import { RegisterPane } from './panes/RegisterPane';
import { SystemRegisterPane } from './panes/SystemRegisterPane';
import { InspectorPane } from './panes/InspectorPane';

/**
 * The three data Pane kinds are narrowed from `AddressSpace` rather than
 * restated, so the two cannot drift — `addressSpace.ts` sets this precedent for
 * the same reason. A panel id carries its space, and a saved layout cannot
 * restore a Pane pointed at a different one than it was saved with.
 */
export type PaneKind = 'overview' | AddressSpace | 'sysCommand' | 'inspector' | 'activityLog';

/**
 * What the Workspace hands a Pane.
 *
 * Deliberately small, and deliberately not dockview's own panel props: a Pane
 * needs to know which instance of itself it is and to be able to rename its own
 * tab, and giving it the whole dock api would let any Pane rearrange the
 * Workspace around it.
 */
export interface PaneProps {
  /** This instance's panel id. Unique across the Workspace. */
  readonly paneId: string;
  /** Renames this Pane's tab. */
  readonly setTitle: (title: string) => void;
}

export interface PaneDefinition {
  readonly kind: PaneKind;
  /** Shown on the Pane's tab and in the reopen menu. */
  readonly title: string;
  /** One-line description for the reopen menu. */
  readonly description: string;
  /**
   * Whether several of this kind may be open at once. The Overview is the
   * Device's own health and there is only one Device, so it is a singleton; so
   * is the Inspector, which exists precisely because there used to be one per
   * data surface. Data Panes are not.
   */
  readonly singleton: boolean;
  readonly component: ComponentType<PaneProps>;
}

export const PANES: readonly PaneDefinition[] = [
  {
    kind: 'overview',
    title: 'Overview',
    description: "The Device's own identity, uptime, link and recent activity",
    singleton: true,
    component: OverviewPane,
  },
  {
    kind: 'register',
    title: 'Registers',
    description: 'Live runtime values, by name from the Map',
    singleton: false,
    component: RegisterPane,
  },
  {
    kind: 'parameter',
    title: 'Parameters',
    description: 'Configuration the Device keeps across a power cycle',
    singleton: false,
    component: ParameterPane,
  },
  {
    kind: 'sysRegister',
    title: 'System Registers',
    description: 'The protocol library’s own space — readable, never writable',
    singleton: false,
    component: SystemRegisterPane,
  },
  {
    kind: 'sysCommand',
    title: 'Commands',
    description: 'Numbered instructions sent to the Device, from the Profile',
    singleton: false,
    component: CommandPane,
  },
  {
    kind: 'inspector',
    title: 'Inspector',
    description: 'Decodes whatever was selected last, in any Pane',
    singleton: true,
    component: InspectorPane,
  },
  {
    kind: 'activityLog',
    title: 'Activity Log',
    description: 'Connection events, reads, writes and protocol traffic',
    singleton: true,
    component: ActivityLogPane,
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

/**
 * The instance number in a panel id, or 0 for a singleton's bare kind.
 *
 * A Pane uses this to name itself when the user has not narrowed it to something
 * more telling: two Panes titled the same are two tabs that have to be clicked
 * to be told apart.
 */
export function instanceOfPaneId(id: string): number {
  const [, instance] = id.split(INSTANCE_SEPARATOR);
  const parsed = Number.parseInt(instance ?? '', 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}
