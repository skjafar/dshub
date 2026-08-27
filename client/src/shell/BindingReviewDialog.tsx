/**
 * The Map-edit drift review (`.scratch/map-binding-drift/issues/07-map-edit-drift-review.md`)
 * and the persistent review indicator (issue 08) share this one dialog:
 * "the same resolution UI... populated from a fresh scan" either way. A
 * caller supplies the flagged items (a post-save scan, or the indicator's
 * own on-demand one) and gets back the fixes the Engineer actually chose —
 * accept or manual — once the dialog closes; leaving an item unresolved
 * produces no fix, so the live "needs review" status keeps showing for it
 * wherever it is rendered.
 *
 * Closing without giving every item an explicit disposition is allowed
 * rather than trapping the dialog open — DSHub's own "calm confidence"
 * design principle rules out a dead-end modal — but costs nothing safety-wise:
 * whatever was not accepted or manually fixed is simply treated as "left for
 * now", exactly the disposition ticket 07 already names as valid, so nothing
 * is trusted again until it actually gets a real fix, one way or another.
 */

import { useMemo, useState } from 'react';
import { ADDRESS_SPACE_NAME } from './addressSpace';
import { coordinateKey } from './bindingScanner';
import type { BindingReviewItem, ScannedBinding } from './bindingScanner';
import type { BindingFix } from './bindingReviewApplier';
import { AddressComboBox } from './panes/WidgetConfigDialog';
import { useMapEntries } from './useMapEntries';
import type { MapEntry } from '../maps/mapParser';
import { Button, Dialog } from '../ui';
import type { SelectOption } from '../ui';
import styles from './BindingReviewDialog.module.css';

export interface BindingReviewDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly items: readonly BindingReviewItem[];
  /** Called once, when the dialog closes, with every fix actually chosen — accept or manual. An empty array is a valid call: everything was left unresolved. */
  readonly onApply: (fixes: readonly BindingFix[]) => void;
}

const KIND_LABEL: Readonly<Record<BindingReviewItem['resolution']['kind'], string>> = {
  moved: 'Moved',
  removed: 'Removed',
  'type-changed': 'Type changed',
};

/**
 * Every case names the previous identity (name/address) ticket 07's own
 * checklist calls for; `removed` additionally names whatever now occupies
 * the old address, or says it's empty, per spec.md's own user story 8 —
 * "showing whatever now occupies that address, or that it's empty".
 */
function detailFor(item: BindingReviewItem, currentOccupant: MapEntry | null): string {
  const { scanned, resolution } = item;
  const space = ADDRESS_SPACE_NAME[scanned.space];
  const was = `Was "${scanned.snapshot.name}" at ${space} address ${scanned.address}.`;
  switch (resolution.kind) {
    case 'moved':
      return `${was} Now found at address ${resolution.to.address}, same name.`;
    case 'removed': {
      const occupant = currentOccupant
        ? `"${currentOccupant.name}" now occupies that address.`
        : `That address is now empty.`;
      return `${was} No longer appears anywhere in the ${space} Map. ${occupant}`;
    }
    case 'type-changed':
      return `${was} Still there, but its type or array shape has changed.`;
  }
}

/** One flagged item's own manual re-pick, scoped to its own Address Space — the same combobox `WidgetConfigDialog.tsx` binds a Widget through. */
function ManualPicker({
  space,
  onPick,
  onCancel,
}: {
  readonly space: ScannedBinding['space'];
  readonly onPick: (entry: MapEntry) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const map = useMapEntries(space);
  const spaceOptions: readonly SelectOption<typeof space>[] = [{ value: space, label: ADDRESS_SPACE_NAME[space] }];

  return (
    <div className={styles.picker}>
      <AddressComboBox
        space={space}
        onSpaceChange={() => {}}
        spaceOptions={spaceOptions}
        entries={map.entries}
        selectedEntryName={undefined}
        onPick={onPick}
      />
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

type Disposition = { readonly kind: 'fix'; readonly entry: MapEntry } | { readonly kind: 'leave' };

function ReviewRow({
  item,
  disposition,
  onDispose,
}: {
  readonly item: BindingReviewItem;
  readonly disposition: Disposition | undefined;
  readonly onDispose: (disposition: Disposition | undefined) => void;
}): React.JSX.Element {
  const [picking, setPicking] = useState(false);
  const { scanned, resolution } = item;
  // Only actually needed for a 'removed' item's own occupant lookup, but
  // called unconditionally — hooks cannot be called only for one branch of
  // a union, and `useMapEntries` is cheap (a memoised read of what
  // `useMapEntries` elsewhere in the same render already loaded, not a
  // fresh parse).
  const currentEntries = useMapEntries(scanned.space);
  const currentOccupant = currentEntries.entries.find(candidate => candidate.address === scanned.address) ?? null;

  if (disposition !== undefined) {
    return (
      <li className={styles.item}>
        <p className={styles.itemDetail}>
          {disposition.kind === 'leave'
            ? `Left for now — ${scanned.snapshot.name} will keep showing "needs review".`
            : `Will re-point to ${disposition.entry.name} · address ${disposition.entry.address}.`}
        </p>
        <div className={styles.itemActions}>
          <Button variant="ghost" size="sm" onClick={() => onDispose(undefined)}>
            Undo
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className={styles.item}>
      <div className={styles.itemHeader}>
        <span className={styles.itemName}>{scanned.snapshot.name}</span>
        <span className={styles.itemKind}>{KIND_LABEL[resolution.kind]}</span>
      </div>
      <p className={styles.itemDetail}>{detailFor(item, currentOccupant)}</p>
      {picking ? (
        <ManualPicker
          space={scanned.space}
          onPick={entry => {
            setPicking(false);
            onDispose({ kind: 'fix', entry });
          }}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <div className={styles.itemActions}>
          {resolution.kind === 'moved' ? (
            <Button size="sm" variant="primary" onClick={() => onDispose({ kind: 'fix', entry: resolution.to })}>
              Accept
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
            Pick manually
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDispose({ kind: 'leave' })}>
            Leave for now
          </Button>
        </div>
      )}
    </li>
  );
}

/** `BindingReviewItem[]` grouped by `locationLabel`, in first-seen order — how a review reads "which Dashboard or Workspace each item belongs to" (ticket 07). */
function groupByLocation(items: readonly BindingReviewItem[]): ReadonlyMap<string, readonly BindingReviewItem[]> {
  const groups = new Map<string, BindingReviewItem[]>();
  for (const item of items) {
    const existing = groups.get(item.scanned.locationLabel);
    if (existing) existing.push(item);
    else groups.set(item.scanned.locationLabel, [item]);
  }
  return groups;
}

export function BindingReviewDialog({ open, onOpenChange, items, onApply }: BindingReviewDialogProps): React.JSX.Element {
  const [dispositions, setDispositions] = useState<ReadonlyMap<string, Disposition>>(new Map());

  const groups = useMemo(() => groupByLocation(items), [items]);
  const pendingMovedCount = items.filter(
    item => item.resolution.kind === 'moved' && !dispositions.has(coordinateKey(item.scanned.coordinate))
  ).length;

  const setDisposition = (key: string, disposition: Disposition | undefined): void => {
    setDispositions(previous => {
      const next = new Map(previous);
      if (disposition === undefined) next.delete(key);
      else next.set(key, disposition);
      return next;
    });
  };

  const handleAcceptAllMoved = (): void => {
    setDispositions(previous => {
      const next = new Map(previous);
      for (const item of items) {
        if (item.resolution.kind !== 'moved') continue;
        const key = coordinateKey(item.scanned.coordinate);
        if (!next.has(key)) next.set(key, { kind: 'fix', entry: item.resolution.to });
      }
      return next;
    });
  };

  const handleClose = (): void => {
    const fixes: BindingFix[] = [];
    for (const item of items) {
      const disposition = dispositions.get(coordinateKey(item.scanned.coordinate));
      if (disposition?.kind === 'fix') fixes.push({ coordinate: item.scanned.coordinate, entry: disposition.entry });
    }
    onApply(fixes);
    setDispositions(new Map());
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) handleClose();
      }}
      title="Review bindings affected by this Map edit"
      description="The Map changed underneath these bindings — resolve each one before trusting it again."
      footer={
        <>
          {pendingMovedCount > 1 ? (
            <Button variant="secondary" size="sm" onClick={handleAcceptAllMoved}>
              Accept all moved ({pendingMovedCount})
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={handleClose}>
            Done
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        {items.length === 0 ? (
          <p className={styles.empty}>Nothing needs review.</p>
        ) : (
          [...groups.entries()].map(([location, groupItems]) => (
            <div key={location} className={styles.group}>
              <h3 className={styles.groupTitle}>{location}</h3>
              <ul className={styles.groupList}>
                {groupItems.map(item => (
                  <ReviewRow
                    key={coordinateKey(item.scanned.coordinate)}
                    item={item}
                    disposition={dispositions.get(coordinateKey(item.scanned.coordinate))}
                    onDispose={disposition => setDisposition(coordinateKey(item.scanned.coordinate), disposition)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </Dialog>
  );
}
