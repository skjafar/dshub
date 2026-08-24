import { ContextMenu as RadixContextMenu } from 'radix-ui';
import type { ReactNode } from 'react';
import { usePortalContainer } from './ThemeScope';
import overlay from './overlay.module.css';

export interface ContextMenuProps {
  /** The element that opens the menu on right-click. Rendered via `asChild`, so it keeps its own tag rather than being wrapped in one. */
  readonly trigger: ReactNode;
  readonly children: ReactNode;
}

/**
 * A right-click menu, anchored to the pointer rather than to an element.
 *
 * Shares `Menu.tsx`'s own overlay surface and item styling — the two differ only
 * in how they open, not in what they look like once open.
 */
export function ContextMenu({ trigger, children }: ContextMenuProps): React.JSX.Element {
  const container = usePortalContainer();

  return (
    <RadixContextMenu.Root>
      <RadixContextMenu.Trigger asChild>{trigger}</RadixContextMenu.Trigger>
      <RadixContextMenu.Portal container={container}>
        <RadixContextMenu.Content className={overlay.surface}>{children}</RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  );
}

export interface ContextMenuItemProps {
  readonly children: ReactNode;
  readonly onSelect?: () => void;
  readonly disabled?: boolean;
}

export function ContextMenuItem({ children, onSelect, disabled }: ContextMenuItemProps): React.JSX.Element {
  return (
    <RadixContextMenu.Item className={overlay.item} onSelect={onSelect} disabled={disabled}>
      {children}
    </RadixContextMenu.Item>
  );
}
