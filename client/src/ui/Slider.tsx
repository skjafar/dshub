import { Slider as RadixSlider } from 'radix-ui';
import styles from './Slider.module.css';

export interface SliderProps {
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
  /** Required when no visible label is associated with the control. */
  readonly 'aria-label'?: string;
}

/**
 * A single-value slider.
 *
 * A slider is for coarse adjustment where the exact number does not matter.
 * Anything a person types a value into belongs in a numeric input — pair the
 * two rather than expecting a drag to land on a specific figure.
 */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  'aria-label': ariaLabel,
}: SliderProps): React.JSX.Element {
  return (
    <RadixSlider.Root
      className={styles.root}
      value={[value]}
      onValueChange={([next]) => onValueChange(next ?? value)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
    >
      <RadixSlider.Track className={styles.track}>
        <RadixSlider.Range className={styles.range} />
      </RadixSlider.Track>
      <RadixSlider.Thumb className={styles.thumb} aria-label={ariaLabel} />
    </RadixSlider.Root>
  );
}
