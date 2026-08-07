import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ArrowClockwise, Bug, Copy } from '@phosphor-icons/react';
import { Button } from '../ui';
import styles from './ErrorBoundary.module.css';

interface Props {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

interface State {
  readonly error: Error | null;
  readonly errorInfo: ErrorInfo | null;
  readonly copied: boolean;
}

/**
 * Catches whatever a Pane-level `PaneBoundary` cannot: a failure in the shell
 * itself, above every Pane. `PaneBoundary` contains a crash to one surface;
 * this is the backstop for when the crash is the surface containing them.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = { error: null, errorInfo: null, copied: false };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = (): void => {
    this.setState({ error: null, errorInfo: null, copied: false });
  };

  /**
   * The stack trace used to be rendered inline, which turned a recoverable
   * failure into a wall of implementation detail. It is still available, on
   * demand.
   */
  private handleCopyDetails = (): void => {
    const details = [
      this.state.error?.stack ?? this.state.error?.toString() ?? 'Unknown error',
      this.state.errorInfo?.componentStack ?? '',
    ].join('\n\n');
    void navigator.clipboard.writeText(details).then(
      () => this.setState({ copied: true }),
      () => undefined
    );
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  public render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className={styles.overlay} role="alert">
        <div className={styles.card}>
          <h1 className={styles.heading}>
            <Bug size={28} weight="fill" aria-hidden />
            Something went wrong
          </h1>

          <div className={styles.alert}>
            <p className={styles.alertTitle}>What happened</p>
            <pre className={styles.detail}>{error.toString()}</pre>
          </div>

          <p className={styles.body}>
            The rest of the application is still running. Try again, or copy the
            technical details if you need to report this.
          </p>

          <div className={styles.actions}>
            <Button variant="primary" onClick={this.handleReset}>
              <ArrowClockwise size={16} aria-hidden />
              Try Again
            </Button>
            <Button variant="secondary" onClick={this.handleCopyDetails}>
              <Copy size={16} aria-hidden />
              {this.state.copied ? 'Copied' : 'Copy Details'}
            </Button>
            <Button variant="secondary" onClick={this.handleReload}>
              <ArrowClockwise size={16} aria-hidden />
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
