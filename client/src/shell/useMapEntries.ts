/**
 * The active Profile's Map, as a Pane reads it.
 *
 * `mapManager` is a module singleton with no way to tell anyone it has changed,
 * which was workable when one full-screen view owned the Map and loaded it
 * itself. Several Panes of several kinds can now be open at once, and each one
 * loading the Map for itself would mean concurrent parses of the same file and
 * Panes disagreeing about whether it is ready yet. This module is the one place
 * that loads it and the one thing Panes subscribe to.
 *
 * `maps/` is frozen (ADR-0003), so the subscription lives here rather than being
 * added to the manager.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { mapManager } from '../maps/mapManager';
import type { MapEntry } from '../maps/mapParser';
import type { MapProfile } from '../types/settings';
import type { AddressSpace } from './addressSpace';

const listeners = new Set<() => void>();
let generation = 0;

/** The load in flight, if any, and which Profile it is for. */
let loading: Promise<void> | null = null;
let loadingProfileId: string | null = null;

/**
 * The last load that failed, and which Profile it was for.
 *
 * Keyed by Profile rather than held as a bare message: a Map that fails to load
 * says nothing about the next Profile someone switches to, and a global flag
 * would have a good board reporting a broken one's failure while its own Map
 * was still loading.
 */
let failure: { readonly profileId: string; readonly message: string } | null = null;

function announce(): void {
  generation += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getGeneration(): number {
  return generation;
}

/**
 * Loads the Map for a Profile, once.
 *
 * `initialize` rather than `reload`: the settings provider calls `initialize`
 * for the same Profile on its own, and `reload` throws when it finds a reload
 * already running. Both callers parse the same file into the same manager, so
 * the worst a race costs is one duplicated parse at startup — where `reload`
 * would cost an exception thrown out of an effect.
 */
function ensureLoaded(profile: MapProfile | null): void {
  if (!profile) return;
  if (mapManager.getCurrentProfileId() === profile.id && mapManager.isInitialized()) return;
  if (loading !== null && loadingProfileId === profile.id) return;

  // Cleared as the attempt starts, so a Profile being loaded reports `loading`
  // rather than the previous Profile's failure.
  failure = null;

  loading = mapManager.initialize(profile).then(
    () => undefined,
    (error: unknown) => {
      failure = {
        profileId: profile.id,
        message: error instanceof Error ? error.message : 'The Map could not be loaded',
      };
    }
  );
  loadingProfileId = profile.id;
  void loading.finally(() => {
    loading = null;
    loadingProfileId = null;
    announce();
  });
}

/**
 * Tells every Pane reading the Map that its content changed without the
 * active Profile itself changing — what saving an edit in the Map Editor
 * Pane does. `mapManager.initialize` re-parses the same Profile in place;
 * `announce` is what makes that visible to a Register or Parameter Pane that
 * never re-read `mapManager` on its own, since the manager cannot say so.
 */
export function announceMapEdited(profile: MapProfile): void {
  void mapManager
    .initialize(profile)
    .then(
      () => {
        failure = null;
      },
      (error: unknown) => {
        failure = {
          profileId: profile.id,
          message: error instanceof Error ? error.message : 'The Map could not be reloaded',
        };
      }
    )
    .finally(announce);
}

/** Shared so an empty result is the same array every time it is asked for. */
const NO_ENTRIES: readonly MapEntry[] = [];

function entriesIn(space: AddressSpace): readonly MapEntry[] {
  const entries =
    space === 'register'
      ? mapManager.getAllRegisters()
      : space === 'parameter'
        ? mapManager.getAllParameters()
        : mapManager.getAllSystemRegisters();
  return entries.length === 0 ? NO_ENTRIES : entries;
}

export type MapStatus = 'loading' | 'ready' | 'unavailable' | 'failed';

export interface MapView {
  readonly status: MapStatus;
  /** Empty unless the status is `ready`. */
  readonly entries: readonly MapEntry[];
  /** Set only when the status is `failed`. */
  readonly error: string | null;
}

function viewOf(space: AddressSpace, activeProfileId: string | null): MapView {
  if (failure !== null && failure.profileId === activeProfileId) {
    return { status: 'failed', entries: NO_ENTRIES, error: failure.message };
  }

  // A Map loaded from a different Profile describes a different board. Reporting
  // it as this Profile's would put another Device's names against these
  // addresses, which is the whole reason an address is meaningless on its own.
  const loaded = mapManager.isInitialized();
  const stale = activeProfileId !== null && mapManager.getCurrentProfileId() !== activeProfileId;

  if (!loaded || stale) {
    return {
      status: activeProfileId === null ? 'unavailable' : 'loading',
      entries: NO_ENTRIES,
      error: null,
    };
  }

  return { status: 'ready', entries: entriesIn(space), error: null };
}

/**
 * The entries of one Address Space in the active Profile's Map.
 *
 * Re-renders when the Map finishes loading, and reports `loading` rather than an
 * empty Map until it has — an empty list and a list that has not arrived look
 * identical on screen and mean opposite things.
 */
export function useMapEntries(space: AddressSpace): MapView {
  const { getActiveProfile } = useSettings();
  const profile = getActiveProfile();
  const profileId = profile?.id ?? null;

  useEffect(() => {
    ensureLoaded(profile);
  }, [profile]);

  const version = useSyncExternalStore(subscribe, getGeneration, getGeneration);

  return useMemo(
    () => viewOf(space, profileId),
    // `version` is not read: it is the signal that what `viewOf` reads out of
    // the manager has changed, since the manager itself cannot say so.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [space, profileId, version]
  );
}
