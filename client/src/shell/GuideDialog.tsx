import { useState } from 'react';
import { Dialog, TabPanel, Tabs } from '../ui';
import type { TabDefinition } from '../ui';
import styles from './GuideDialog.module.css';

export interface GuideDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

interface GuideStep {
  readonly title: string;
  readonly description: string;
  readonly hints: readonly string[];
}

/**
 * From an empty Profile to a controllable, live Dashboard.
 *
 * Scanning and connecting are one step here, not two: the pre-rebuild guide
 * had a separate "Scan for Device" step because the Device Scanner was its
 * own destination (ADR-0001). The connect flow launched from the chrome does
 * both at once, so the guide follows what the interface actually does rather
 * than a shape it left behind.
 */
const STEPS: readonly GuideStep[] = [
  {
    title: 'Create a Profile',
    description:
      "Open the Map Editor Pane to define your board's Registers, Parameters and Commands. Add units, descriptions " +
      'and named values so the interface reads in the Device’s own vocabulary rather than bare addresses.',
    hints: ['Profiles', 'Map Editor'],
  },
  {
    title: 'Export files',
    description:
      'Export .map files and C headers for your firmware to build against. Keep them in sync with what the ' +
      'Profile declares — a mismatch reads the wrong value at the right address.',
    hints: ['Map Editor → Export', 'Profiles → Export'],
  },
  {
    title: 'Flash and run the board',
    description:
      'Build the exported headers into your firmware and flash it. Once running, the board answers the ' +
      'DataStream protocol over TCP or UDP.',
    hints: ['Firmware', 'TCP / UDP server'],
  },
  {
    title: 'Scan and connect',
    description:
      'Open Connect from the chrome. It scans the local network and lists what answers — pick a discovered board, ' +
      'or enter an address directly for one a scan cannot reach.',
    hints: ['Connect'],
  },
  {
    title: 'Build a Dashboard',
    description:
      'Open a Dashboard Pane and add Widgets bound to Registers or Parameters. Put a finished Dashboard into Focus ' +
      'Mode for a screen that shows only machine state, beside the equipment.',
    hints: ['Panes → Dashboard', 'Focus Mode'],
  },
  {
    title: 'Take Control',
    description:
      'Reads work as soon as you are connected. Writing a value, sending a Command, or editing a Register or ' +
      'Parameter needs Control as well — claim it from the chrome. Control is exclusive, so release it when done.',
    hints: ['Take Control', 'Commands', 'Registers', 'Parameters'],
  },
];

interface ReferenceEntry {
  readonly title: string;
  readonly description: string;
}

interface ReferenceSection {
  readonly heading: string;
  readonly entries: readonly ReferenceEntry[];
}

/**
 * What the interface can do, organised by the vocabulary it is built from
 * rather than by ticket — an Engineer or Operator reading this has no reason
 * to know the rebuild happened in twenty-four numbered steps.
 */
const REFERENCE: readonly ReferenceSection[] = [
  {
    heading: 'Workspace and Panes',
    entries: [
      {
        title: 'Several Panes of a kind, at once',
        description:
          'Open more than one Register, Parameter or Plot Pane, each with its own filter and selection — compare ' +
          'two subsystems, or watch three signals together, without re-filtering between glances.',
      },
      {
        title: 'Arrange freely',
        description:
          'Drag a Pane to any edge of the Workspace, resize it by the shared border, close it. Reopen a closed ' +
          'Pane from the Panes menu in the chrome — the one and only reopen affordance.',
      },
      {
        title: 'Named Workspaces',
        description:
          'Save the current arrangement from the Workspaces dialog. Switch, rename or delete any of them; one is ' +
          'marked default and is what a Profile opens into.',
      },
      {
        title: 'Inspector',
        description:
          'One shared Inspector Pane follows whatever you last selected in any data Pane, decoding it as decimal, ' +
          'hex, binary and float alongside its Address Space, type and access.',
      },
    ],
  },
  {
    heading: 'Plot Pane',
    entries: [
      {
        title: 'Cursor sync',
        description:
          'Move the crosshair in one Plot Pane and it appears at the same instant in every other open Plot Pane, ' +
          'so several signals can be read at one moment in time.',
      },
      {
        title: 'Pan, zoom, pause',
        description:
          'Left-drag or scroll to zoom, middle-drag to pan without changing the window width, double-click to ' +
          'reset. Pause a Plot to examine a trace without it moving under you, resume when done.',
      },
      {
        title: 'Export',
        description: "Set each Plot's poll interval and time span independently, and export its data to a file for analysis elsewhere.",
      },
    ],
  },
  {
    heading: 'Activity Log',
    entries: [
      {
        title: 'Docked while you work',
        description: 'Watch connection events, reads, writes and protocol traffic without leaving the Pane you are working on.',
      },
      {
        title: 'Filter by category and level',
        description: 'Narrow to the one exchange that matters — raw packet traffic is its own filter, reachable without a separate destination.',
      },
      {
        title: 'Unread indicator',
        description: 'A badge on the Panes menu shows unread activity even while the Log itself is closed or out of view.',
      },
    ],
  },
  {
    heading: 'Dashboards and Widgets',
    entries: [
      {
        title: 'Sixteen Widget kinds',
        description:
          'Value & Indicator — Value Readout, Gauge, Progress Bar, Encoder Display, LED Indicator, State LED, ' +
          'Status Matrix. Control — Button, Dropdown, Value Write, Directional Control. Composite — Data Table, ' +
          'Alarm List, Device Info, Container, Mini-Plot.',
      },
      {
        title: 'One shared configuration surface',
        description:
          'The nine kinds that read a single value bind an address, choose a display format and set thresholds ' +
          'through one shared surface — learning one teaches the others. The rest write, list several addresses, ' +
          'or hold none of their own, and configure whatever that calls for through the same dialog.',
      },
      {
        title: 'Several Dashboards per Profile',
        description: 'Different aspects of a machine each get their own panel, switchable from within the Dashboard Pane.',
      },
      {
        title: 'Focus Mode',
        description:
          'Puts one Dashboard full-canvas with the layout locked and chrome minimised — the state left running on ' +
          'a screen beside equipment. Leave it by the one deliberate exit action, never by accident.',
      },
    ],
  },
  {
    heading: 'Map Editor, Commands and Profiles',
    entries: [
      {
        title: 'Map Editor',
        description: "Revise the active Profile's Registers, Parameters and Commands directly, then export .map files and C headers for firmware to build against.",
      },
      {
        title: 'Commands',
        description: 'Send named Commands from a Command Pane, by name from the Profile — never a bare number typed from a separate document.',
      },
      {
        title: 'Import and export Profiles',
        description:
          "A Profile's Maps, Commands and each entry's own name, unit and description move between machines as " +
          'one file, from the Profiles dialog. Dashboards, Workspaces and other local arrangement do not travel ' +
          'with it — only the board definition does.',
      },
    ],
  },
  {
    heading: 'Appearance',
    entries: [
      {
        title: 'Two themes',
        description: 'Kinetic Monolith (dark) and Blueprint (light) — switch from the chrome or Settings. Status colour reads identically in both.',
      },
    ],
  },
];

interface KeyboardEntry {
  readonly action: string;
  readonly keys: string;
}

interface KeyboardSection {
  readonly heading: string;
  readonly entries: readonly KeyboardEntry[];
}

/**
 * How the interface already responds to a keyboard, surface by surface —
 * describing what is true today rather than a shortcut scheme layered on
 * top of it. Nothing here is bespoke to DSHub: it is dockview's own tab
 * strip, the shared dialog and menu primitives, and the few Widgets and
 * Panes that read a key directly, each exercised by its own test.
 */
const KEYBOARD: readonly KeyboardSection[] = [
  {
    heading: 'Everywhere',
    entries: [
      { action: 'Move focus forward / back', keys: 'Tab / Shift+Tab' },
      { action: 'Activate the focused control', keys: 'Enter or Space' },
      { action: 'Close a dialog or menu', keys: 'Escape' },
    ],
  },
  {
    heading: 'The Panes menu, and every other menu',
    entries: [
      { action: 'Open, landing on the first item', keys: 'Enter or Space' },
      { action: 'Walk items', keys: 'Arrow Up / Down' },
      { action: 'Choose the highlighted item', keys: 'Enter' },
    ],
  },
  {
    heading: 'The Workspace tab strip',
    entries: [
      { action: 'Move between open Panes', keys: 'Left / Right arrow' },
      { action: 'Jump to the first / last Pane', keys: 'Home / End' },
      { action: 'Close the focused Pane', keys: 'Delete or Backspace' },
      { action: 'Reopen a closed Pane', keys: 'Panes menu, in the chrome' },
    ],
  },
  {
    heading: 'Tables (Registers, Parameters, Data Table Widget)',
    entries: [{ action: 'Select the focused row', keys: 'Enter or Space' }],
  },
  {
    heading: 'Sliders and switches',
    entries: [
      { action: 'Adjust a slider by one step', keys: 'Left / Right arrow' },
      { action: 'Toggle a switch', keys: 'Space' },
    ],
  },
  {
    heading: 'Directional Control Widget',
    entries: [{ action: 'Drive while held, same as a pointer', keys: 'Enter or Space, held' }],
  },
];

type GuideTab = 'workflow' | 'reference' | 'keyboard';

const TABS: readonly TabDefinition<GuideTab>[] = [
  { value: 'workflow', label: 'Workflow' },
  { value: 'reference', label: 'Reference' },
  { value: 'keyboard', label: 'Keyboard' },
];

/**
 * The workflow, the fuller feature reference, and how to drive the whole
 * interface from a keyboard — reachable from the chrome rather than
 * occupying a permanent destination the way it did before the rebuild.
 */
export function GuideDialog({ open, onOpenChange }: GuideDialogProps): React.JSX.Element {
  const [tab, setTab] = useState<GuideTab>('workflow');

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Guide"
      description="From an empty Profile to a connected, controllable Device with a live Dashboard — and what else the interface can do."
    >
      <Tabs value={tab} onValueChange={value => setTab(value)} tabs={TABS} aria-label="Guide section">
        <TabPanel value="workflow">
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.number} aria-hidden>
                  {index + 1}
                </span>
                <div className={styles.stepBody}>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepDescription}>{step.description}</p>
                  <div className={styles.hints}>
                    {step.hints.map(hint => (
                      <span key={hint} className={styles.hint}>
                        {hint}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </TabPanel>

        <TabPanel value="reference">
          <div className={styles.sections}>
            {REFERENCE.map(section => (
              <section key={section.heading} className={styles.section}>
                <h3 className={styles.sectionHeading}>{section.heading}</h3>
                <dl className={styles.refList}>
                  {section.entries.map(entry => (
                    <div key={entry.title} className={styles.refEntry}>
                      <dt className={styles.refTitle}>{entry.title}</dt>
                      <dd className={styles.refDescription}>{entry.description}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </TabPanel>

        <TabPanel value="keyboard">
          <div className={styles.sections}>
            {KEYBOARD.map(section => (
              <section key={section.heading} className={styles.section}>
                <h3 className={styles.sectionHeading}>{section.heading}</h3>
                <dl className={styles.keyList}>
                  {section.entries.map(entry => (
                    <div key={entry.action} className={styles.keyRow}>
                      <dt className={styles.keyAction}>{entry.action}</dt>
                      <dd className={styles.keyKeys}>{entry.keys}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </TabPanel>
      </Tabs>
    </Dialog>
  );
}
