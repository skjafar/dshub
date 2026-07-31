import { Tabs as RadixTabs } from 'radix-ui';
import type { ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabDefinition<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

export interface TabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly tabs: readonly TabDefinition<T>[];
  readonly children: ReactNode;
  readonly 'aria-label'?: string;
}

/**
 * A tab strip.
 *
 * Arrow-key navigation moves between tabs and activates on focus, which is the
 * behaviour a keyboard user expects here — every panel is cheap to show, so
 * requiring Enter to commit would only add a keystroke.
 */
export function Tabs<T extends string>({
  value,
  onValueChange,
  tabs,
  children,
  'aria-label': ariaLabel,
}: TabsProps<T>): React.JSX.Element {
  return (
    <RadixTabs.Root value={value} onValueChange={v => onValueChange(v as T)}>
      <RadixTabs.List className={styles.list} aria-label={ariaLabel}>
        {tabs.map(tab => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className={styles.trigger}
          >
            {tab.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export interface TabPanelProps {
  readonly value: string;
  readonly children: ReactNode;
}

export function TabPanel({ value, children }: TabPanelProps): React.JSX.Element {
  return (
    <RadixTabs.Content value={value} className={styles.content}>
      {children}
    </RadixTabs.Content>
  );
}
