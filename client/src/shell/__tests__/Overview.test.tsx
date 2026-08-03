// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { Overview } from '../panes/Overview';
import { ControlInterfaceState, InterfaceType } from '../../types/shared';
import type { LogEntry } from '../../types/shared';
import type { OverviewProps } from '../panes/Overview';

afterEach(cleanup);

const LOGS: LogEntry[] = [
  { level: 'success', category: 'connection', message: 'Connected to device', timestamp: 1_700_000_000_000 },
  { level: 'warning', category: 'register', message: 'Invalid data for SPINDLE_RPM', timestamp: 1_700_000_001_000 },
];

function props(overrides: Partial<OverviewProps> = {}): OverviewProps {
  return {
    device: {
      ip_address: '192.168.1.42',
      board_name: 'SESAME-CTRL-01',
      mac_address: '02:1A:2B:3C:4D:5E',
      device_id: 4201,
      board_type: 1,
      firmware_version: 0x00010407,
      tcp_port: 2009,
      udp_port: 2011,
    },
    connection: {
      ip: '192.168.1.42',
      port: 2009,
      interface: InterfaceType.TCP,
      connected: true,
      reconnecting: false,
      controlState: ControlInterfaceState.TCP_DATASTREAM,
      deviceName: 'SESAME-CTRL-01',
    },
    uptimeSeconds: 3_725,
    recentActivity: LOGS,
    ...overrides,
  };
}

describe('Overview', () => {
  it('reports the Device it is looking at', () => {
    render(<Overview {...props()} />);

    // Scoped to the identity card: the address also appears in the link banner,
    // which is a different statement about a different thing.
    const identity = screen.getByRole('region', { name: /identity/i });
    expect(within(identity).getByText('SESAME-CTRL-01')).toBeInTheDocument();
    expect(within(identity).getByText('192.168.1.42:2009')).toBeInTheDocument();
    expect(within(identity).getByText('4201')).toBeInTheDocument();
    expect(within(identity).getByText('1.4.7')).toBeInTheDocument();
  });

  it('reports uptime in a form a person reads at a glance', () => {
    render(<Overview {...props({ uptimeSeconds: 3_725 })} />);
    expect(screen.getByText('01:02:05')).toBeInTheDocument();
  });

  it('reports the link as live and says who holds Control', () => {
    render(<Overview {...props()} />);

    expect(screen.getByText(/^online$/i)).toBeInTheDocument();
    expect(screen.getByText(/TCP datastream/i)).toBeInTheDocument();
  });

  it('says plainly that readings are stale once the link drops', () => {
    // The whole point of this surface for an Operator: a value that stopped
    // updating must never read as a current one. The Overview says so in words,
    // not only by changing a colour.
    render(
      <Overview
        {...props({
          connection: { ...props().connection!, connected: false, reconnecting: true },
          uptimeSeconds: null,
        })}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(/reconnecting/i);
    expect(screen.getByRole('status')).toHaveTextContent(/not current|stale|no longer/i);
  });

  it('distinguishes a clean disconnect from an unresponsive Device', () => {
    render(
      <Overview
        {...props({
          connection: { ...props().connection!, connected: false, reconnecting: false },
          uptimeSeconds: null,
        })}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(/disconnected/i);
    expect(screen.getByRole('status')).not.toHaveTextContent(/reconnecting/i);
  });

  it('never attributes another board\'s identity to the connected link', () => {
    // Connecting by address to a board the scan never reached leaves no
    // discovery record. Falling back to "some device we found earlier" put that
    // board's name, MAC and firmware under a banner reading Online — the exact
    // stale-read-as-current failure this surface exists to prevent.
    render(
      <Overview
        {...props({
          device: null,
          connection: { ...props().connection!, deviceName: undefined, ip: '10.0.0.9' },
        })}
      />
    );

    const identity = screen.getByRole('region', { name: /identity/i });
    expect(identity).not.toHaveTextContent('SESAME-CTRL-01');
    expect(identity).not.toHaveTextContent('02:1A:2B:3C:4D:5E');
    expect(identity).toHaveTextContent('10.0.0.9');
    expect(identity).toHaveTextContent(/unknown/i);
  });

  it('says there is no Device rather than showing an empty shell', () => {
    render(<Overview {...props({ device: null, connection: null, uptimeSeconds: null, recentActivity: [] })} />);

    expect(screen.getByRole('status')).toHaveTextContent(/no device/i);
  });

  it('shows recent activity newest first, so the latest event is the one in view', () => {
    render(<Overview {...props()} />);

    const entries = screen.getAllByRole('listitem');
    expect(entries[0]).toHaveTextContent('Invalid data for SPINDLE_RPM');
    expect(entries[1]).toHaveTextContent('Connected to device');
  });
});
