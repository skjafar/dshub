import { Tooltip as RadixTooltip } from 'radix-ui';
import type { ReactNode } from 'react';
import { usePortalContainer } from './ThemeScope';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  /** The element the tooltip describes. Must be focusable to be reachable. */
  readonly children: ReactNode;
  readonly content: ReactNode;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
}

export interface TooltipProviderProps {
  readonly children: ReactNode;
}

/**
 * A hover and focus label.
 *
 * A tooltip must never be the only place information lives: it is unreachable
 * by touch and disappears under a screen magnifier. Use it to name an icon
 * button, not to explain something the user needs.
 *
 * Requires a {@link TooltipProvider} above it. Wrap the surface that uses
 * tooltips once, rather than wrapping each one.
 */
export function Tooltip({ children, content, side = 'top' }: TooltipProps): React.JSX.Element {
  const container = usePortalContainer();

  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal container={container}>
        <RadixTooltip.Content className={styles.content} side={side} sideOffset={6}>
          {content}
          <RadixTooltip.Arrow className={styles.arrow} width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

/**
 * Wraps the application once. The shared provider is what lets a second tooltip
 * appear immediately after a first, instead of re-waiting the open delay.
 */
export function TooltipProvider({ children }: TooltipProviderProps): React.JSX.Element {
  return (
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}
