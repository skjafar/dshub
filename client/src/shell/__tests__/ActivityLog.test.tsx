// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityLog } from '../panes/ActivityLog';
import type { ActivityLogProps } from '../panes/ActivityLog';
import type { LogEntry } from '../../types/shared';

afterEach(cleanup);

const PACKET_ENTRY: LogEntry = {
  level: 'packet',
  category: 'packet',
  message: 'TX 24 bytes to 192.168.1.42',
  timestamp: 1_700_000_002_000,
  packetData: {
    direction: 'SENT',
    size: 24,
    hexData: '00 01 02 2A',
    analysis: 'Read request for SPINDLE_RPM',
    responseTime: 12,
    interface: 'TCP',
    destination: '192.168.1.42',
  },
};

const ENTRIES: readonly LogEntry[] = [
  { level: 'info', category: 'connection', message: 'DSHub started', timestamp: 1_700_000_000_000 },
  { level: 'success', category: 'connection', message: 'Connected to device', timestamp: 1_700_000_001_000 },
  PACKET_ENTRY,
  { level: 'warning', category: 'register', message: 'Invalid data for SPINDLE_RPM', timestamp: 1_700_000_003_000 },
  { level: 'error', category: 'connection', message: 'Device unresponsive', timestamp: 1_700_000_004_000 },
];

function props(overrides: Partial<ActivityLogProps> = {}): ActivityLogProps {
  return {
    entries: ENTRIES,
    category: 'all',
    onCategoryChange: vi.fn(),
    level: 'all',
    onLevelChange: vi.fn(),
    selected: null,
    onSelect: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
}

/** Rows in the order they render, top to bottom. */
function rowTexts(): string[] {
  return screen.getAllByRole('listitem').map(row => row.textContent ?? '');
}

/** Options in the order the Select offers them; opening lands on the current selection. */
async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  comboName: RegExp,
  stepsFromCurrent: number
): Promise<void> {
  screen.getByRole('combobox', { name: comboName }).focus();
  await user.keyboard('{Enter}');
  await screen.findByRole('listbox');
  await user.keyboard('{ArrowDown}'.repeat(stepsFromCurrent));
  await user.keyboard('{Enter}');
}

describe('ActivityLog', () => {
  it('shows the newest entry first', () => {
    render(<ActivityLog {...props()} />);

    const rows = rowTexts();
    expect(rows).toHaveLength(ENTRIES.length);
    expect(rows[0]).toContain('Device unresponsive');
    expect(rows[1]).toContain('Invalid data for SPINDLE_RPM');
    expect(rows[2]).toContain('TX 24 bytes to 192.168.1.42');
    expect(rows[3]).toContain('Connected to device');
    expect(rows[4]).toContain('DSHub started');
  });

  it('reports how many entries match against the total', () => {
    render(<ActivityLog {...props()} />);
    expect(screen.getByRole('status')).toHaveTextContent(`${ENTRIES.length} of ${ENTRIES.length} entries`);
  });

  it('filters by category', async () => {
    const onCategoryChange = vi.fn();
    render(<ActivityLog {...props({ onCategoryChange })} />);

    // Options: All categories, Connection, Register, Parameter, Packet, Auto-refresh, Plotting
    await chooseOption(userEvent.setup(), /filter by category/i, 2);

    expect(onCategoryChange).toHaveBeenCalledWith('register');
  });

  it('filters by level, reaching packet traffic as one of its values', async () => {
    const onLevelChange = vi.fn();
    render(<ActivityLog {...props({ onLevelChange })} />);

    // Options: All levels, Info, Success, Warning, Error, Packet
    await chooseOption(userEvent.setup(), /filter by level/i, 5);

    expect(onLevelChange).toHaveBeenCalledWith('packet');
  });

  it('applies category and level together, showing only what satisfies both', () => {
    render(<ActivityLog {...props({ category: 'connection', level: 'error' })} />);

    const rows = rowTexts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Device unresponsive');
    expect(screen.getByRole('status')).toHaveTextContent(`1 of ${ENTRIES.length} entries`);
  });

  it('says there is nothing logged yet, distinct from a filter matching nothing', () => {
    const { rerender } = render(<ActivityLog {...props({ entries: [] })} />);
    expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument();

    rerender(<ActivityLog {...props({ category: 'parameter' })} />);
    expect(screen.getByText(/no entries match this filter/i)).toBeInTheDocument();
  });

  it('offers a packet entry as expandable, and nothing else', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ActivityLog {...props({ onSelect })} />);

    expect(screen.queryByRole('button', { name: /Device unresponsive/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /TX 24 bytes to 192.168.1.42/ }));
    expect(onSelect).toHaveBeenCalledWith(PACKET_ENTRY);
  });

  it('shows the expanded packet detail once selected, and closes it back down', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ActivityLog {...props({ selected: PACKET_ENTRY, onSelect })} />);

    const detail = screen.getByRole('region', { name: /packet detail/i });
    expect(within(detail).getByText(/SENT/)).toBeInTheDocument();
    expect(within(detail).getByText(/TCP/)).toBeInTheDocument();
    expect(within(detail).getByText(/192\.168\.1\.42/)).toBeInTheDocument();
    expect(within(detail).getByText(/24 bytes/)).toBeInTheDocument();
    expect(within(detail).getByText(/12 ms/)).toBeInTheDocument();
    expect(within(detail).getByText('00 01 02 2A')).toBeInTheDocument();
    expect(within(detail).getByText(/Read request for SPINDLE_RPM/)).toBeInTheDocument();

    await user.click(within(detail).getByRole('button', { name: 'Close' }));
    expect(onSelect).toHaveBeenCalledWith(PACKET_ENTRY);
  });

  it('clears the log on request, and disables the action once it is empty', () => {
    const onClear = vi.fn();
    const { rerender } = render(<ActivityLog {...props({ onClear })} />);

    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();

    rerender(<ActivityLog {...props({ entries: [], onClear })} />);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });
});
