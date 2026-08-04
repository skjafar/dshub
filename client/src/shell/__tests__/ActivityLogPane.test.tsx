// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider, useDSHub } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { InterfaceType } from '../../types/shared';
import { retainPaneState } from '../paneState';
import { ActivityLogPane } from '../panes/ActivityLogPane';

/**
 * What is specific to the Activity Log Pane once `logFilter.ts` and
 * `ActivityLog.test.tsx` have pinned filtering and packet expansion on
 * hand-crafted entries. What is left is what only a container binding to the
 * real Device state can exercise: that it actually shows the log the rest of
 * the application writes to, and that the unread count the chrome's Panes
 * badge reads clears for as long as the Pane is mounted — on first open and
 * on every alert after that, not only the first.
 */

afterEach(() => {
  cleanup();
  retainPaneState([]);
});

/** Lets the provider's asynchronous listener registration finish. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/** Surfaces the unread count the way the chrome's Panes badge reads it. */
function UnreadCount(): React.JSX.Element {
  const { state } = useDSHub();
  return <span data-testid="unread">{state.unreadLogCount}</span>;
}

function Harness({
  port,
  showPane,
}: {
  readonly port: ReturnType<typeof createFakeBackendPort>;
  readonly showPane: boolean;
}): React.JSX.Element {
  return (
    <BackendPortProvider port={port as BackendPort}>
      <SettingsProvider>
        <DSHubProvider>
          <UnreadCount />
          {showPane ? <ActivityLogPane paneId="activityLog" setTitle={() => {}} /> : null}
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
}

describe('ActivityLogPane', () => {
  it('shows the Device activity the rest of the application writes to the log', async () => {
    const port = createFakeBackendPort({ deliver: fn => fn() });
    render(<Harness port={port} showPane />);
    await settle();

    await act(async () => {
      await port.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });

    expect(screen.getByText(/Connected to device/)).toBeInTheDocument();
  });

  it('clears the unread count once opened, but not before', async () => {
    const port = createFakeBackendPort({ deliver: fn => fn() });
    const { rerender } = render(<Harness port={port} showPane={false} />);
    await settle();

    await act(async () => {
      await port.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });
    // A clean disconnect is reported as a warning — an alert-level entry,
    // counted as unread — while the Pane above is still closed.
    await act(async () => {
      await port.device.disconnect();
    });

    expect(screen.getByTestId('unread')).toHaveTextContent('1');

    rerender(<Harness port={port} showPane />);

    expect(screen.getByTestId('unread')).toHaveTextContent('0');
  });

  it('keeps clearing new alerts while it stays open, not just the first one', async () => {
    // A Pane docked alone in its own region of the Workspace never goes
    // through the close/reopen cycle the previous test exercises — it just
    // stays mounted. An alert arriving during that time must not sit unread
    // until the Pane happens to be closed and reopened.
    const port = createFakeBackendPort({ deliver: fn => fn() });
    render(<Harness port={port} showPane />);
    await settle();

    await act(async () => {
      await port.device.connect('192.168.1.42', InterfaceType.TCP, 'SESAME-CTRL-01');
    });
    await act(async () => {
      await port.device.disconnect();
    });

    expect(screen.getByTestId('unread')).toHaveTextContent('0');
  });
});
