import type { ReactNode } from 'react';
import { GearSix, X } from '@phosphor-icons/react';
import { Button } from '../../ui';
import styles from './WidgetShell.module.css';

/**
 * A plain, non-module class name rather than `styles.controls` — `DashboardPane`
 * hands this to react-grid-layout's `draggableCancel`, which matches it as a
 * literal CSS selector against a live DOM node, not against the hashed name a
 * CSS Modules import resolves to. Exported so the two files can only drift by
 * an explicit rename, not a silent one.
 */
export const WIDGET_DRAG_CANCEL_CLASS = 'widget-controls';

export interface WidgetShellProps {
  readonly label: string;
  /** Drag, resize, configure and remove are all edit-mode-only — a Dashboard an Operator is watching must not rearrange under an accidental click. */
  readonly editing: boolean;
  readonly onConfigure: () => void;
  readonly onRemove: () => void;
  readonly children: ReactNode;
}

/**
 * The chrome every Widget kind sits inside: a label and, in edit mode, the
 * configure and remove affordances.
 *
 * This is "the same vocabulary and layout regardless of Widget kind" made
 * literal — a Widget component supplies only its own reading, never its own
 * label row or edit controls, so two different kinds placed side by side read
 * as the same instrument family rather than sixteen separate designs.
 */
export function WidgetShell({ label, editing, onConfigure, onRemove, children }: WidgetShellProps): React.JSX.Element {
  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {editing ? (
          <div className={`${WIDGET_DRAG_CANCEL_CLASS} ${styles.controls}`}>
            <Button variant="ghost" size="sm" aria-label={`Configure ${label}`} onClick={onConfigure}>
              <GearSix size={14} />
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Remove ${label}`} onClick={onRemove}>
              <X size={14} />
            </Button>
          </div>
        ) : null}
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
