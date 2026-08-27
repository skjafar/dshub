// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataAccessPermit, DataForm } from '../../maps/mapParser';
import type { MapEntry } from '../../maps/mapParser';
import { mapManager } from '../../maps/mapManager';
import { SettingsProvider } from '../../contexts/SettingsContext';
import type { MapProfile } from '../../types/settings';
import { snapshotFromEntry } from '../bindingIdentity';
import { BindingReviewDialog } from '../BindingReviewDialog';
import type { BindingReviewItem } from '../bindingScanner';

/**
 * The review dialog's own interaction surface — spec.md's own testing note:
 * "open with several flagged items, accept one, bulk-accept the rest,
 * close" — rather than re-proving resolver/scanner/applier logic already
 * covered at their own seams.
 */

function entry(overrides: Partial<MapEntry> = {}): MapEntry {
  return {
    address: 5,
    name: 'MOTOR_TEMP',
    type: DataForm.FLOAT,
    isArray: false,
    accessPermit: DataAccessPermit.READ_WRITE,
    showAsHex: false,
    ...overrides,
  };
}

function movedItem(overrides: Partial<BindingReviewItem> = {}): BindingReviewItem {
  const oldEntry = entry({ address: 3 });
  const newEntry = entry({ address: 9 });
  return {
    scanned: {
      coordinate: { kind: 'widgetBinding', dashboardId: 'd1', widgetId: 'w1' },
      space: 'register',
      address: 3,
      snapshot: snapshotFromEntry(oldEntry),
      locationLabel: 'Dashboard: Motor Control',
    },
    resolution: { kind: 'moved', to: newEntry },
    ...overrides,
  };
}

function removedItem(overrides: Partial<BindingReviewItem> = {}): BindingReviewItem {
  return {
    scanned: {
      coordinate: { kind: 'widgetTarget', dashboardId: 'd1', widgetId: 'w2' },
      space: 'register',
      address: 4,
      snapshot: snapshotFromEntry(entry({ address: 4, name: 'GONE_NAME' })),
      locationLabel: 'Dashboard: Motor Control',
    },
    resolution: { kind: 'removed' },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  localStorage.removeItem('dshub_settings');
});

function renderDialog(items: readonly BindingReviewItem[], onApply = vi.fn()) {
  render(
    <SettingsProvider>
      <BindingReviewDialog open items={items} onOpenChange={() => {}} onApply={onApply} />
    </SettingsProvider>
  );
  return { onApply };
}

describe('BindingReviewDialog', () => {
  it('shows nothing needing attention when the item list is empty', () => {
    renderDialog([]);
    expect(screen.getByText(/nothing needs review/i)).toBeInTheDocument();
  });

  it('groups items by location and labels each by its resolution kind', () => {
    renderDialog([movedItem(), removedItem()]);
    expect(screen.getByText('Dashboard: Motor Control')).toBeInTheDocument();
    expect(screen.getByText('Moved')).toBeInTheDocument();
    expect(screen.getByText('Removed')).toBeInTheDocument();
  });

  it('names the previous address for every kind, and says a removed entry’s old address is now empty when nothing occupies it', () => {
    renderDialog([movedItem(), removedItem()]);
    expect(screen.getByText(/was "motor_temp" at registers address 3/i)).toBeInTheDocument();
    expect(screen.getByText(/that address is now empty/i)).toBeInTheDocument();
  });

  it('names whatever now occupies a removed entry’s old address, when something does', async () => {
    const profile: MapProfile = {
      id: 'review-occupant-board',
      name: 'Review occupant board',
      isDefault: false,
      registersMap: 'uint32_t A;\nuint32_t B;\nuint32_t C;\nuint32_t D;\nuint32_t REPLACEMENT;',
      parametersMap: '',
      createdAt: 0,
    };
    await mapManager.initialize(profile);

    renderDialog([removedItem()]);

    expect(await screen.findByText(/"replacement" now occupies that address/i)).toBeInTheDocument();
  });

  it('offers Accept only for a moved item, not a removed one', () => {
    renderDialog([movedItem(), removedItem()]);
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).queryByRole('button', { name: /^accept$/i })).toBeInTheDocument();
    expect(within(rows[1]).queryByRole('button', { name: /^accept$/i })).not.toBeInTheDocument();
  });

  it('applies exactly the accepted fix on close, and nothing for an item left unresolved', async () => {
    const user = userEvent.setup();
    const suggestedEntry = entry({ address: 9 });
    const moved = movedItem({ resolution: { kind: 'moved', to: suggestedEntry } });
    const removed = removedItem();
    const { onApply } = renderDialog([moved, removed]);

    const rows = screen.getAllByRole('listitem');
    await user.click(within(rows[0]).getByRole('button', { name: /^accept$/i }));
    await user.click(screen.getByRole('button', { name: /^done$/i }));

    expect(onApply).toHaveBeenCalledWith([{ coordinate: moved.scanned.coordinate, entry: suggestedEntry }]);
  });

  it('applies no fix at all when everything is explicitly left for now', async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog([movedItem()]);

    await user.click(screen.getByRole('button', { name: /leave for now/i }));
    await user.click(screen.getByRole('button', { name: /^done$/i }));

    expect(onApply).toHaveBeenCalledWith([]);
  });

  it('bulk-accepts every pending moved item at once', async () => {
    const user = userEvent.setup();
    const first = movedItem({
      scanned: { ...movedItem().scanned, coordinate: { kind: 'widgetBinding', dashboardId: 'd1', widgetId: 'w1' } },
    });
    const second = movedItem({
      scanned: { ...movedItem().scanned, coordinate: { kind: 'widgetBinding', dashboardId: 'd1', widgetId: 'w2' } },
      resolution: { kind: 'moved', to: entry({ address: 11, name: 'OTHER' }) },
    });
    const { onApply } = renderDialog([first, second]);

    await user.click(screen.getByRole('button', { name: /accept all moved/i }));
    await user.click(screen.getByRole('button', { name: /^done$/i }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0];
    expect(applied).toHaveLength(2);
  });

  it('lets an Engineer manually re-pick a replacement entry, reusing the existing address-picker', async () => {
    const profile: MapProfile = {
      id: 'review-picker-board',
      name: 'Review picker board',
      isDefault: false,
      registersMap: 'float MOTOR_TEMP;\nfloat SPARE_ENTRY;',
      parametersMap: '',
      createdAt: 0,
    };
    await mapManager.initialize(profile);

    const user = userEvent.setup();
    const removed = removedItem();
    const { onApply } = renderDialog([removed]);

    await user.click(screen.getByRole('button', { name: /pick manually/i }));
    const filter = await screen.findByRole('textbox', { name: /filter addresses to bind/i });
    await user.type(filter, 'SPARE_ENTRY');
    await user.click(await screen.findByText('SPARE_ENTRY'));
    await user.click(screen.getByRole('button', { name: /^done$/i }));

    expect(onApply).toHaveBeenCalledWith([
      { coordinate: removed.scanned.coordinate, entry: expect.objectContaining({ name: 'SPARE_ENTRY' }) },
    ]);
  });
});
