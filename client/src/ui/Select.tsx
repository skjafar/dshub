import { Select as RadixSelect } from 'radix-ui';
import { CaretDown, Check } from '@phosphor-icons/react';
import { usePortalContainer } from './ThemeScope';
import overlay from './overlay.module.css';
import styles from './Select.module.css';

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps<T extends string> {
  /**
   * The selected value. `T` is inferred from here alone — the other two members
   * are wrapped in `NoInfer` so neither can widen it back to `string`, which is
   * what a list of object literals or a `useState` setter would otherwise do.
   * Without this the caller gets a bare `string` from `onValueChange` and has to
   * re-narrow its own union.
   */
  readonly value: T;
  readonly onValueChange: (value: NoInfer<T>) => void;
  readonly options: readonly SelectOption<NoInfer<T>>[];
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /** Required when no visible label is associated with the control. */
  readonly 'aria-label'?: string;
}

/**
 * A single-choice select.
 *
 * Generic over the option value so a caller gets its own union back from
 * `onValueChange` rather than a bare `string` it has to re-narrow.
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  'aria-label': ariaLabel,
}: SelectProps<T>): React.JSX.Element {
  const container = usePortalContainer();

  return (
    <RadixSelect.Root
      value={value}
      onValueChange={v => onValueChange(v as T)}
      disabled={disabled}
    >
      <RadixSelect.Trigger className={styles.trigger} aria-label={ariaLabel}>
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className={styles.icon}>
          <CaretDown size={12} weight="bold" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal container={container}>
        <RadixSelect.Content className={overlay.surface} position="popper" sideOffset={4}>
          <RadixSelect.Viewport className={styles.viewport}>
            {options.map(option => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={overlay.item}
              >
                <span className={overlay.itemIndicator}>
                  <RadixSelect.ItemIndicator>
                    <Check size={12} weight="bold" />
                  </RadixSelect.ItemIndicator>
                </span>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
