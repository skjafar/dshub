import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Warning } from '@phosphor-icons/react';
import { Button } from '../ui';
import styles from './PaneBoundary.module.css';

export interface PaneBoundaryProps {
  /** The Pane's title, so a failure is attributable to a surface by name. */
  readonly title: string;
  readonly children: ReactNode;
}

interface PaneBoundaryState {
  readonly error: Error | null;
  /** Bumped on retry to remount the subtree rather than reuse a broken one. */
  readonly attempt: number;
}

/**
 * Contains a crash to one Pane.
 *
 * A Workspace shows several Panes at once, and React unwinds to the nearest
 * boundary — so this has to sit inside each Pane rather than around the
 * Workspace, or one failing surface blanks every other. That matters most in the
 * case it is least convenient: an Operator watching equipment, mid shift, who
 * would otherwise be left with an empty screen.
 *
 * The fallback stays inside the Pane's own bounds, so the rest of the Workspace
 * keeps working and the failure reads as "this surface is broken" rather than
 * "the application is broken".
 */
export class PaneBoundary extends Component<PaneBoundaryProps, PaneBoundaryState> {
  public state: PaneBoundaryState = { error: null, attempt: 0 };

  public static getDerivedStateFromError(error: Error): Partial<PaneBoundaryState> {
    return { error };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Pane "${this.props.title}" failed:`, error, info);
  }

  private handleRetry = (): void => {
    this.setState(prev => ({ error: null, attempt: prev.attempt + 1 }));
  };

  public render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      // Keyed on the attempt so retrying builds a fresh subtree; reusing the old
      // one would replay whatever state produced the throw.
      return (
        <div key={this.state.attempt} className={styles.content}>
          {this.props.children}
        </div>
      );
    }

    return (
      <div className={styles.fallback} role="alert">
        <h2 className={styles.heading}>
          <Warning size={18} weight="fill" aria-hidden />
          {this.props.title} stopped
        </h2>
        <p className={styles.body}>
          This pane hit an error and closed itself. Everything else in the workspace
          is still running and the device link is untouched.
        </p>
        <pre className={styles.detail}>{error.message}</pre>
        <Button variant="secondary" onClick={this.handleRetry}>
          Retry
        </Button>
      </div>
    );
  }
}
