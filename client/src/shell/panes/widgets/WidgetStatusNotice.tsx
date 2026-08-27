import type { WidgetReadingStatus } from '../../widgets/useWidgetReading';
import styles from './WidgetStatusNotice.module.css';

/**
 * Excludes `'ready'` at the type level rather than branching on it inside the
 * component — a caller still holding a `'ready'` reading has its own kind-
 * specific display to render instead, and the type system saying so is what
 * stops a `WidgetStatusNotice` call site from ever needing to.
 */
export interface WidgetStatusNoticeProps {
  readonly status: Exclude<WidgetReadingStatus, 'ready'>;
}

const MESSAGE: Readonly<Partial<Record<WidgetStatusNoticeProps['status'], string>>> = {
  unbound: 'Not configured — pick an address to bind.',
  'not-found': 'Bound address is not in the active Map.',
  'needs-review': 'Needs review — the Map changed since this was bound.',
  invalid: 'invalid',
};

/**
 * Every non-`'ready'` state a bound Widget can be in, rendered once rather
 * than by each kind's own component — otherwise "shows a plain stale state"
 * is a claim seven kinds each have to keep honouring identically rather than
 * one claim true by construction.
 */
export function WidgetStatusNotice({ status }: WidgetStatusNoticeProps): React.JSX.Element {
  if (status === 'pending') return <p className={styles.pending}>—</p>;
  if (status === 'stale') {
    return (
      <p className={styles.stale} role="status">
        Stale — the Device stopped answering.
      </p>
    );
  }
  return <p className={styles.notice}>{MESSAGE[status]}</p>;
}
