import { useRef } from 'react';
import { Dialog as RadixDialog } from 'radix-ui';
import { X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { usePortalContainer } from './ThemeScope';
import styles from './Dialog.module.css';

export interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  /**
   * Announced with the title by assistive technology. Supply it whenever the
   * title alone does not say what the dialog will do.
   */
  readonly description?: string;
  readonly children: ReactNode;
  /** Actions, right-aligned. The confirming action goes last. */
  readonly footer?: ReactNode;
}

/**
 * A modal dialog.
 *
 * Focus is trapped while open and returns to whatever opened it on close, and
 * Escape dismisses — all from the primitive, which is exactly the behaviour that
 * is not worth reimplementing.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: DialogProps): React.JSX.Element {
  // This dialog is opened by setting `open`, not by a Radix `Trigger`, because
  // callers open it from menu items and keyboard shortcuts as well as buttons.
  // Radix restores focus to its own trigger, so with no trigger it would restore
  // to nothing and drop a keyboard user back on the document body. Capturing the
  // opener at the instant before focus moves in gives us something to return to.
  const openerRef = useRef<HTMLElement | null>(null);
  const container = usePortalContainer();

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal container={container}>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          className={styles.content}
          onOpenAutoFocus={() => {
            openerRef.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            openerRef.current?.focus();
          }}
        >
          <div className={styles.header}>
            <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
            <RadixDialog.Close className={styles.close} aria-label="Close">
              <X size={14} weight="bold" />
            </RadixDialog.Close>
          </div>

          {description ? (
            <RadixDialog.Description className={styles.description}>
              {description}
            </RadixDialog.Description>
          ) : (
            // Radix warns when a dialog has no description. Saying "there isn't
            // one" explicitly is better than an empty node that reads as a blank
            // announcement.
            <RadixDialog.Description asChild>
              <span hidden />
            </RadixDialog.Description>
          )}

          <div className={styles.body}>{children}</div>

          {footer ? <div className={styles.footer}>{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
