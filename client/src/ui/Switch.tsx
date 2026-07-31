import { Switch as RadixSwitch } from 'radix-ui';
import styles from './Switch.module.css';

export interface SwitchProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly id?: string;
  /** Required when no visible label is associated with the control. */
  readonly 'aria-label'?: string;
}

/**
 * An on/off setting that takes effect immediately.
 *
 * If the change needs a confirming action to apply, it is a checkbox in a form,
 * not a switch — a switch that has not taken effect yet is lying about state.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  'aria-label': ariaLabel,
}: SwitchProps): React.JSX.Element {
  return (
    <RadixSwitch.Root
      id={id}
      className={styles.root}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <RadixSwitch.Thumb className={styles.thumb} />
    </RadixSwitch.Root>
  );
}
