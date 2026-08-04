// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DataAccessPermit, DataForm } from '../../maps/mapParser';
import type { MapEntry } from '../../maps/mapParser';
import { Entries } from '../panes/Entries';
import type { EntriesProps } from '../panes/Entries';
import type { MapView } from '../useMapEntries';

/**
 * The four reasons a data Pane has nothing to list.
 *
 * A Map that has not arrived, a Profile that is not there, a Map that failed to
 * parse and a Profile whose Map genuinely declares nothing in this space all
 * render as an empty table — and they call for four different actions from
 * whoever is looking at it. Saying "no registers" to all four would send someone
 * hunting for a device fault when the answer is that no Profile is active.
 */

afterEach(cleanup);

const ENTRY: MapEntry = {
  address: 0,
  name: 'SPINDLE_RPM',
  type: DataForm.UINT,
  isArray: false,
  accessPermit: DataAccessPermit.READ_ONLY,
  showAsHex: false,
};

const READY: MapView = { status: 'ready', entries: [ENTRY], error: null };

function props(map: MapView, overrides: Partial<EntriesProps> = {}): EntriesProps {
  return {
    space: 'register',
    rows: map.entries.map(entry => ({ entry, value: null, valid: true })),
    query: '',
    onQueryChange: vi.fn(),
    format: 'decimal',
    onFormatChange: vi.fn(),
    selectedAddress: null,
    onSelect: vi.fn(),
    live: false,
    onLiveChange: vi.fn(),
    followedCount: map.entries.length,
    onRead: vi.fn(),
    link: 'online',
    map,
    // Nothing selected, so there is nothing to write to. The write bar has its
    // own suite; these cases are about having nothing to list.
    write: null,
    ...overrides,
  };
}

describe('a data Pane with nothing to list', () => {
  it('says the Map has not arrived rather than showing it as empty', () => {
    render(<Entries {...props({ status: 'loading', entries: [], error: null })} />);

    expect(screen.getByText(/loading this profile’s map/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('says there is no Profile, which is not the same as no registers', () => {
    render(<Entries {...props({ status: 'unavailable', entries: [], error: null })} />);

    expect(screen.getByText(/no profile is active/i)).toBeInTheDocument();
  });

  it('reports why a Map could not be loaded, in the words it failed with', () => {
    render(
      <Entries
        {...props({ status: 'failed', entries: [], error: 'Unknown type ‘uint64_t’ on line 12' })}
      />
    );

    expect(screen.getByText(/uint64_t/)).toBeInTheDocument();
  });

  it.each([
    ['register' as const, /declares no Registers/i],
    ['parameter' as const, /declares no Parameters/i],
    ['sysRegister' as const, /declares no System Registers/i],
  ])('names the space a loaded Map declares nothing in (%s)', (space, message) => {
    // Which of the three Maps to go and look at is the whole content of this
    // message; "declares no entries" would leave that unanswered.
    render(<Entries {...props({ status: 'ready', entries: [], error: null }, { space })} />);

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('lists the Map once it is there', () => {
    render(<Entries {...props(READY)} />);

    expect(screen.getByRole('row', { name: /SPINDLE_RPM/ })).toBeInTheDocument();
  });
});
