import { Popover as RadixPopover } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { usePortalContainer } from './ThemeScope';
import overlay from './overlay.module.css';
import styles from './Popover.module.css';

export interface PopoverProps {
  /** The control that opens the popover. Rendered as-is; supply a Button. */
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly align?: 'start' | 'center' | 'end';
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * A floating panel anchored to a trigger.
 *
 * Unlike a menu, its contents are arbitrary and focusable — filters, forms, a
 * colour picker. Focus moves into it on open and returns to the trigger on
 * close, which is what separates it from a tooltip.
 */
export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
}: PopoverProps): React.JSX.Element {
  const container = usePortalContainer();

  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal container={container}>
        <RadixPopover.Content
          className={cx(overlay.surface, styles.content)}
          align={align}
          side={side}
          sideOffset={4}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
