// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Window as TauriWindow, getCurrentWindow } from '@tauri-apps/api/window';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { UserSettings } from '../../types/settings';
import { DaughterWindowShell } from '../DaughterWindowShell';
import { PANE_HANDOFF_EVENT } from '../paneHandoff';
import type { ProfileWorkspaces } from '../workspaceStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  Window: { getByLabel: vi.fn() },
  getCurrentWindow: vi.fn(),
}));

const STORAGE_KEY = 'dshub_settings';

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  vi.mocked(isTauri).mockReturnValue(true);
  // Every test needs this much, even ones that never check an autosaved
  // value: `DaughterWindowShell`'s own bounds-tracking effect calls
  // `outerPosition`/`innerSize`/`scaleFactor`/`onMoved`/`onResized`
  // unconditionally on mount, under Tauri.
  vi.mocked(getCurrentWindow).mockReturnValue({
    label: 'daughter-1',
    onMoved: vi.fn().mockResolvedValue(() => {}),
    onResized: vi.fn().mockResolvedValue(() => {}),
    outerPosition: vi.fn().mockResolvedValue({ toLogical: () => ({ x: 0, y: 0 }) }),
    innerSize: vi.fn().mockResolvedValue({ toLogical: () => ({ width: 640, height: 480 }) }),
    scaleFactor: vi.fn().mockResolvedValue(1),
  } as never);
  vi.mocked(listen).mockResolvedValue(vi.fn());
  vi.mocked(invoke).mockResolvedValue([]); // list_daughter_windows' default
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
  vi.clearAllMocks();
  window.history.pushState({}, '', '/');
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

function renderShell(query: string): { fake: ReturnType<typeof createFakeBackendPort> } {
  window.history.pushState({}, '', `/${query}`);
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  render(
    <BackendPortProvider port={fake as BackendPort}>
      <SettingsProvider>
        <DSHubProvider ownsDeviceLifecycle={false}>
          <DaughterWindowShell />
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
  return { fake };
}

/** A stored settings blob whose current-schema stamp survives `migrateStoredSettings` untouched, carrying one active Workspace under the default Profile — the "somewhere for a Daughter Window's own autosave to write into" every test below needs. */
function seedActiveWorkspace(): void {
  const collection: ProfileWorkspaces = {
    workspaces: [
      {
        id: 'w1',
        name: 'W',
        mainDockLayout: { grid: { root: { type: 'branch', data: [] }, height: 0, width: 0, orientation: 'HORIZONTAL' }, panels: {} } as never,
        paneStates: {},
        selection: null,
        daughterWindows: [],
      },
    ],
    defaultWorkspaceId: 'w1',
    activeWorkspaceId: 'w1',
  };
  const settings: UserSettings = { ...DEFAULT_SETTINGS, workspacesByProfile: { default: collection } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function readActiveWorkspace(): ProfileWorkspaces['workspaces'][number] {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as UserSettings;
  const collection = stored.workspacesByProfile.default;
  const workspace = collection.workspaces.find(w => w.id === collection.activeWorkspaceId);
  if (!workspace) throw new Error('no active Workspace in storage');
  return workspace;
}

/** `getCurrentWindow()`, mocked with the bounds-reading methods `readOwnWindowBounds` needs — the base `beforeEach` mock carries `label`/`onMoved`/`onResized` only, enough for the tests that never reach an actual autosave write. */
function mockWindowWithBounds(label: string): void {
  vi.mocked(getCurrentWindow).mockReturnValue({
    label,
    onMoved: vi.fn().mockResolvedValue(() => {}),
    onResized: vi.fn().mockResolvedValue(() => {}),
    outerPosition: vi.fn().mockResolvedValue({ toLogical: () => ({ x: 10, y: 20 }) }),
    innerSize: vi.fn().mockResolvedValue({ toLogical: () => ({ width: 640, height: 480 }) }),
    scaleFactor: vi.fn().mockResolvedValue(1),
  } as never);
}

/** Advances this window's own 400ms autosave debounce, then `SettingsContext`'s own separate 400ms persist debounce chained after it — both must elapse before a write actually reaches `localStorage`. */
async function advanceThroughAutosave(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}

describe('DaughterWindowShell', () => {
  it('opens with the one Pane named by the ?pane= query string', async () => {
    renderShell('?pane=register');
    await settle();

    // "Registers" is non-singleton (paneRegistry.ts), so even its first
    // instance carries an instance number — "Registers 1", not "Registers".
    expect(screen.getByRole('tab', { name: 'Registers 1' })).toBeInTheDocument();
  });

  it('shows the read-only chrome — link/Control state plus exactly one add-Pane control', async () => {
    renderShell('?pane=overview');
    await settle();

    expect(screen.getByRole('button', { name: 'Add a pane' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect/i })).not.toBeInTheDocument();
  });

  it('adds a second Pane through the add-Pane menu', async () => {
    const user = userEvent.setup();
    renderShell('?pane=overview');
    await settle();

    await user.click(screen.getByRole('button', { name: 'Add a pane' }));
    await user.click(await screen.findByText('Registers'));

    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Registers 1' })).toBeInTheDocument();
  });

  it('closes itself once its one Pane is closed', async () => {
    const tauriClose = vi.fn();
    vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ close: tauriClose } as never);

    renderShell('?pane=overview');
    await settle();

    // Delete/Backspace closes the focused tab — dockview's own keyboard
    // contract, exercised the same way `Workspace.test.tsx` pins it.
    const tab = screen.getByRole('tab', { name: 'Overview' });
    fireEvent.keyDown(tab, { key: 'Delete' });
    await settle();

    expect(TauriWindow.getByLabel).toHaveBeenCalledWith('daughter-1');
    expect(tauriClose).toHaveBeenCalledTimes(1);
  });

  it('ignores an unknown or missing ?pane= value and opens with nothing seeded', async () => {
    renderShell('?pane=not-a-real-kind');
    await settle();

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});

/**
 * `.scratch/daughter-windows-native` issue 03: a Daughter Window's own
 * arrangement survives an app restart. Exercised end-to-end against the
 * real `<Workspace>`/dockview instance (this file already does, unlike
 * `workspaceStore.test.ts`'s fake-api unit tests) — create content in one
 * window, let its own autosave reach storage, then confirm a second,
 * freshly-mounted window opened with `?restore=<index>` reproduces it.
 */
describe('DaughterWindowShell restoring at launch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("autosaves this window's own content, keyed by its live label, into the active Workspace", async () => {
    seedActiveWorkspace();
    mockWindowWithBounds('daughter-1');
    vi.useFakeTimers();

    renderShell('?pane=register');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await advanceThroughAutosave();

    const workspace = readActiveWorkspace();
    expect(workspace.daughterWindows).toHaveLength(1);
    expect(workspace.daughterWindows[0]?.label).toBe('daughter-1');
    expect(Object.keys(workspace.daughterWindows[0]?.dockLayout.panels ?? {})).toEqual(['register#1']);
    expect(workspace.daughterWindows[0]?.bounds).toEqual({ x: 10, y: 20, width: 640, height: 480 });
  });

  it("a fresh window opened with ?restore=<index> reproduces the saved window's own Panes", async () => {
    seedActiveWorkspace();
    mockWindowWithBounds('daughter-1');
    vi.useFakeTimers();

    renderShell('?pane=register');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await advanceThroughAutosave();
    expect(readActiveWorkspace().daughterWindows).toHaveLength(1); // precondition: the first window's save landed

    cleanup();
    vi.useRealTimers();

    // A relaunch remints labels from scratch (`daughter_windows.rs`) — this
    // window's own live label shares nothing with what the entry above was
    // saved under; only `?restore=0` correlates it to that entry.
    mockWindowWithBounds('daughter-1');
    renderShell('?restore=0');
    await settle();

    expect(screen.getByRole('tab', { name: 'Registers 1' })).toBeInTheDocument();
  });

  it('opens empty, and so self-closes, when the restore index names nothing in the active Workspace', async () => {
    seedActiveWorkspace();
    mockWindowWithBounds('daughter-1');
    const tauriClose = vi.fn();
    vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ close: tauriClose } as never);

    renderShell('?restore=5');
    await settle();

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(tauriClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * Moving or resizing this Window doesn't touch dockview's own layout at
 * all — nothing about the Panes inside it changes — so without its own
 * `onMoved`/`onResized` subscription, a bare move/resize would never be
 * saved at all, regardless of any `beforeunload` timing. This is that gap,
 * closed.
 */
describe("DaughterWindowShell saving a bare move or resize", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves new bounds after a resize alone, with no Pane ever added or changed', async () => {
    seedActiveWorkspace();
    let resizeHandler: (() => void) | null = null;
    const outerPosition = vi.fn().mockResolvedValue({ toLogical: () => ({ x: 10, y: 20 }) });
    const innerSize = vi.fn().mockResolvedValue({ toLogical: () => ({ width: 640, height: 480 }) });
    vi.mocked(getCurrentWindow).mockReturnValue({
      label: 'daughter-1',
      onMoved: vi.fn().mockResolvedValue(() => {}),
      onResized: vi.fn().mockImplementation((handler: () => void) => {
        resizeHandler = handler;
        return Promise.resolve(() => {});
      }),
      outerPosition,
      innerSize,
      scaleFactor: vi.fn().mockResolvedValue(1),
    } as never);
    vi.useFakeTimers();

    renderShell('?pane=overview');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // The window is resized — this window's own JS never adds, removes or
    // otherwise touches a Pane, so dockview's `onDidLayoutChange` has
    // nothing to fire for it.
    innerSize.mockResolvedValue({ toLogical: () => ({ width: 900, height: 700 }) });
    expect(resizeHandler).not.toBeNull();
    await act(async () => {
      resizeHandler?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    await advanceThroughAutosave();

    expect(readActiveWorkspace().daughterWindows[0]?.bounds).toEqual({ x: 10, y: 20, width: 900, height: 700 });
  });
});

describe('DaughterWindowShell pruning its own entry on close', () => {
  it("removes this window's own entry from the active Workspace once its last Pane closes", async () => {
    seedActiveWorkspace();
    mockWindowWithBounds('daughter-1');
    vi.useFakeTimers();
    const tauriClose = vi.fn();
    vi.mocked(TauriWindow.getByLabel).mockResolvedValue({ close: tauriClose } as never);

    renderShell('?pane=overview');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await advanceThroughAutosave();
    expect(readActiveWorkspace().daughterWindows).toHaveLength(1); // precondition: this window's own save landed first

    const tab = screen.getByRole('tab', { name: 'Overview' });
    fireEvent.keyDown(tab, { key: 'Delete' });
    await advanceThroughAutosave();

    expect(tauriClose).toHaveBeenCalledTimes(1);
    expect(readActiveWorkspace().daughterWindows).toEqual([]);

    vi.useRealTimers();
  });
});

/**
 * `.scratch/daughter-windows-native` issue 05: "Move to Window" relocates a
 * Pane into an already-open Window. `useMoveToWindow.test.ts` and
 * `paneHandoff.test.ts` already pin the sending and receiving halves of the
 * mechanism in isolation against mocked collaborators; this exercises the
 * *receiving* half end to end against a real dockview instance instead — a
 * real `addPanel` call and a real `usePaneState` mount actually cooperating
 * with `restorePaneState`'s "seed before mount" contract, not a fake
 * standing in for either. Driven by invoking the mocked `listen` handler
 * directly (the same technique `paneHandoff.test.ts` uses) rather than a
 * second, simultaneously-mounted `DaughterWindowShell` instance: this file's
 * own `getCurrentWindow` mock is a single global return value with no way to
 * tell two instances apart, so a genuine two-Window round trip is left to
 * hand verification against a packaged binary, the same as this directory's
 * other real-OS-window mechanics.
 */
describe('DaughterWindowShell receiving a "Move to Window" handoff', () => {
  it('opens the handed-off Pane with its filter state already restored', async () => {
    let deliverHandoff: (event: { payload: unknown }) => void = () => {};
    vi.mocked(listen).mockImplementation(async (event, handler) => {
      if (event === PANE_HANDOFF_EVENT) deliverHandoff = handler as never;
      return vi.fn();
    });

    renderShell('?pane=overview'); // already has a Pane open, so it is a valid move target
    await settle();

    act(() => {
      deliverHandoff({
        payload: {
          targetWindowId: 'daughter-1', // this beforeEach's own getCurrentWindow label
          kind: 'register',
          paneState: { query: 'MOTOR', format: 'decimal', selectedAddress: null, live: false },
        },
      });
    });
    await settle();

    // AddressSpacePane.tsx computes its own tab title from its instance
    // number and current filter query — "My Registers" or any other
    // carried-over title would only ever be overwritten on the very next
    // render, so this is the *correct* outcome, not a missing feature; see
    // paneHandoff.ts's own doc comment for why no title crosses the wire at
    // all.
    const tab = screen.getByRole('tab', { name: 'Registers 1 · MOTOR' });
    await userEvent.click(tab);

    expect(screen.getByRole('textbox', { name: 'Filter registers by name or address' })).toHaveValue('MOTOR');
  });

  it('ignores a handoff addressed to a different Window', async () => {
    let deliverHandoff: (event: { payload: unknown }) => void = () => {};
    vi.mocked(listen).mockImplementation(async (event, handler) => {
      if (event === PANE_HANDOFF_EVENT) deliverHandoff = handler as never;
      return vi.fn();
    });

    renderShell('?pane=overview');
    await settle();

    act(() => {
      deliverHandoff({
        payload: { targetWindowId: 'daughter-9', kind: 'register', paneState: {} },
      });
    });
    await settle();

    expect(screen.queryAllByRole('tab', { name: /Registers/ })).toHaveLength(0);
  });
});
