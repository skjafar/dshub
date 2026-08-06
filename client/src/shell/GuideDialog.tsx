import { Dialog } from '../ui';
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

/**
 * The workflow, end to end — reachable from the chrome rather than occupying
 * a permanent destination the way it did before the rebuild.
 */
export function GuideDialog({ open, onOpenChange }: GuideDialogProps): React.JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Workflow guide"
      description="From an empty Profile to a connected, controllable Device with a live Dashboard."
    >
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
    </Dialog>
  );
}
