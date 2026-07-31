import { DropdownMenu } from 'radix-ui';
import { Check } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { usePortalContainer } from './ThemeScope';
import overlay from './overlay.module.css';

export interface MenuProps {
  /** The control that opens the menu. Rendered as-is; supply a Button. */
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly align?: 'start' | 'center' | 'end';
}

/**
 * A dropdown menu.
 *
 * Roving focus, type-ahead, Escape and click-outside come from the primitive.
 * The trigger is rendered through `asChild`, so the caller keeps control of what
 * it looks like and the menu only contributes behaviour.
 */
export function Menu({ trigger, children, align = 'start' }: MenuProps): React.JSX.Element {
  const container = usePortalContainer();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content className={overlay.surface} align={align} sideOffset={4}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export interface MenuItemProps {
  readonly children: ReactNode;
  readonly onSelect?: () => void;
  readonly disabled?: boolean;
}

export function MenuItem({ children, onSelect, disabled }: MenuItemProps): React.JSX.Element {
  return (
    <DropdownMenu.Item className={overlay.item} onSelect={onSelect} disabled={disabled}>
      {children}
    </DropdownMenu.Item>
  );
}

export interface MenuCheckboxItemProps extends MenuItemProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}

export function MenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
  disabled,
}: MenuCheckboxItemProps): React.JSX.Element {
  return (
    <DropdownMenu.CheckboxItem
      className={overlay.item}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
    >
      <span className={overlay.itemIndicator}>
        <DropdownMenu.ItemIndicator>
          <Check size={12} weight="bold" />
        </DropdownMenu.ItemIndicator>
      </span>
      {children}
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuSeparator(): React.JSX.Element {
  return <DropdownMenu.Separator className={overlay.separator} />;
}

export interface MenuLabelProps {
  readonly children: ReactNode;
}

/** Names a group of items. Not selectable, and skipped by type-ahead. */
export function MenuLabel({ children }: MenuLabelProps): React.JSX.Element {
  return <DropdownMenu.Label className={overlay.label}>{children}</DropdownMenu.Label>;
}
