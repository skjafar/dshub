// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { DockviewApi, IDockviewPanel } from 'dockview';
import { useMoveToNewDaughterWindow } from '../useMoveToNewDaughterWindow';
import { openDaughterWindow, openDaughterWindowAt, readWindowBounds, useDaughterWindows } from '../daughterWindowNative';
import { DAUGHTER_WINDOW_DEFAULT_HEIGHT, DAUGHTER_WINDOW_DEFAULT_WIDTH } from '../daughterWindows';

vi.mock('../daughterWindowNative', () => ({
  openDaughterWindow: vi.fn(),
  openDaughterWindowAt: vi.fn(),
  readWindowBounds: vi.fn(),
  useDaughterWindows: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

function fakePanel(id: string): IDockviewPanel {
  return { id } as IDockviewPanel;
}

function apiRefWith(removePanel: (panel: IDockviewPanel) => void) {
  return { current: { removePanel } as unknown as DockviewApi };
}

/** A dockview api stub exposing only `onWillDragPanel` — the one method `attachDragOutListener` calls. */
function fakeDockviewApi(): {
  readonly api: DockviewApi;
  fireDragStart: (panel: IDockviewPanel, nativeEvent: DragEvent) => void;
} {
  let handler: ((event: { panel: IDockviewPanel; nativeEvent: DragEvent }) => void) | null = null;
  const api = {
    onWillDragPanel: (h: NonNullable<typeof handler>) => {
      handler = h;
    },
  } as unknown as DockviewApi;
  return {
    api,
    fireDragStart: (panel, nativeEvent) => handler?.({ panel, nativeEvent }),
  };
}

/** Dispatches a real `DragEvent` from an element in `document`, so `event.target`/`ownerDocument` are populated the way `attachDragOutListener` reads them — a bare `new DragEvent(...)` never dispatched has neither. */
function dispatchedDragEvent(type: string, init: DragEventInit = {}): DragEvent {
  const el = document.createElement('div');
  document.body.appendChild(el);
  let captured: DragEvent | undefined;
  el.addEventListener(type, e => {
    captured = e as DragEvent;
  });
  el.dispatchEvent(new DragEvent(type, init));
  if (!captured) throw new Error(`dispatching "${type}" did not fire its own listener`);
  return captured;
}

/** Settles the two chained async hops `attachDragOutListener`'s own `dragend` handler goes through: `readWindowBounds`'s own promise, then (if a window actually opens) `openDaughterWindowAt`'s. */
async function settleDragOut(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useMoveToNewDaughterWindow', () => {
  it('opens a new window and removes the source panel on success, below the warning threshold', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue([]); // well under the threshold
    vi.mocked(openDaughterWindow).mockResolvedValue('daughter-1');
    const removePanel = vi.fn();
    const apiRef = apiRefWith(removePanel);

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));
    const panel = fakePanel('register#2');

    await act(async () => {
      result.current.requestMove(panel);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openDaughterWindow).toHaveBeenCalledWith('register');
    expect(removePanel).toHaveBeenCalledWith(panel);
    expect(result.current.pendingPanel).toBeNull();
  });

  it('does not remove the source panel if opening the new window fails', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue([]);
    vi.mocked(openDaughterWindow).mockRejectedValue(new Error('boom'));
    const removePanel = vi.fn();
    const apiRef = apiRefWith(removePanel);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));

    await act(async () => {
      result.current.requestMove(fakePanel('plot#1'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(removePanel).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('holds the move for confirmation once the open count reaches the warning threshold', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue(['daughter-1', 'daughter-2', 'daughter-3', 'daughter-4']);
    vi.mocked(openDaughterWindow).mockResolvedValue('daughter-5');
    const removePanel = vi.fn();
    const apiRef = apiRefWith(removePanel);

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));
    const panel = fakePanel('register');

    act(() => result.current.requestMove(panel));

    expect(openDaughterWindow).not.toHaveBeenCalled();
    expect(result.current.pendingPanel).toBe(panel);

    await act(async () => {
      result.current.confirm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openDaughterWindow).toHaveBeenCalledWith('register');
    expect(removePanel).toHaveBeenCalledWith(panel);
    expect(result.current.pendingPanel).toBeNull();
  });

  it('cancel clears the pending move without opening anything', () => {
    vi.mocked(useDaughterWindows).mockReturnValue(['daughter-1', 'daughter-2', 'daughter-3', 'daughter-4']);
    const apiRef = apiRefWith(vi.fn());

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));

    act(() => result.current.requestMove(fakePanel('register')));
    expect(result.current.pendingPanel).not.toBeNull();

    act(() => result.current.cancel());
    expect(result.current.pendingPanel).toBeNull();
    expect(openDaughterWindow).not.toHaveBeenCalled();
  });

  it('does nothing for a panel whose id names no known Pane kind', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue([]);
    const apiRef = apiRefWith(vi.fn());

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));
    await act(async () => {
      result.current.requestMove(fakePanel('not-a-real-kind'));
      await Promise.resolve();
    });

    expect(openDaughterWindow).not.toHaveBeenCalled();
  });
});

describe('attachDragOutListener', () => {
  it('opens a new Daughter Window centred on the drop point, carrying the dragged Pane\'s own state, when the drag ends outside every open Window', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue([]); // knownWindowIds(…) === ['main']
    vi.mocked(readWindowBounds).mockResolvedValue([{ left: 0, top: 0, width: 1200, height: 800 }]);
    vi.mocked(openDaughterWindowAt).mockResolvedValue('daughter-1');
    const removePanel = vi.fn();
    const apiRef = apiRefWith(removePanel);

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));
    const { api: dockApi, fireDragStart } = fakeDockviewApi();
    act(() => result.current.attachDragOutListener(dockApi));

    const panel = fakePanel('register#2');
    fireDragStart(panel, dispatchedDragEvent('dragstart'));
    document.dispatchEvent(dispatchedDragEvent('dragend', { screenX: 1400, screenY: 300 }));
    await settleDragOut();

    expect(readWindowBounds).toHaveBeenCalledWith(['main']);
    expect(openDaughterWindowAt).toHaveBeenCalledWith(
      'register',
      { x: 1400 - DAUGHTER_WINDOW_DEFAULT_WIDTH / 2, y: 300 - DAUGHTER_WINDOW_DEFAULT_HEIGHT / 2, width: DAUGHTER_WINDOW_DEFAULT_WIDTH, height: DAUGHTER_WINDOW_DEFAULT_HEIGHT },
      undefined
    );
    expect(removePanel).toHaveBeenCalledWith(panel);
  });

  it('does nothing when the drag ends inside an already-open Window — dockview\'s own drop handles it', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue([]);
    vi.mocked(readWindowBounds).mockResolvedValue([{ left: 0, top: 0, width: 1200, height: 800 }]);
    const removePanel = vi.fn();
    const apiRef = apiRefWith(removePanel);

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));
    const { api: dockApi, fireDragStart } = fakeDockviewApi();
    act(() => result.current.attachDragOutListener(dockApi));

    fireDragStart(fakePanel('register#2'), dispatchedDragEvent('dragstart'));
    document.dispatchEvent(dispatchedDragEvent('dragend', { screenX: 600, screenY: 400 }));
    await settleDragOut();

    expect(openDaughterWindowAt).not.toHaveBeenCalled();
    expect(removePanel).not.toHaveBeenCalled();
  });

  it('ignores a non-DragEvent drag start (e.g. pointer-based) rather than wiring a dragend listener for it', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue([]);
    const apiRef = apiRefWith(vi.fn());

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));
    const { api: dockApi, fireDragStart } = fakeDockviewApi();
    act(() => result.current.attachDragOutListener(dockApi));

    fireDragStart(fakePanel('register#2'), new PointerEvent('pointerdown') as unknown as DragEvent);
    document.dispatchEvent(dispatchedDragEvent('dragend', { screenX: 1400, screenY: 300 }));
    await settleDragOut();

    expect(readWindowBounds).not.toHaveBeenCalled();
  });

  it('the 5th-window warning also holds a drag-out for confirmation', async () => {
    vi.mocked(useDaughterWindows).mockReturnValue(['daughter-1', 'daughter-2', 'daughter-3', 'daughter-4']);
    vi.mocked(readWindowBounds).mockResolvedValue([{ left: 0, top: 0, width: 1200, height: 800 }]);
    vi.mocked(openDaughterWindowAt).mockResolvedValue('daughter-5');
    const removePanel = vi.fn();
    const apiRef = apiRefWith(removePanel);

    const { result } = renderHook(() => useMoveToNewDaughterWindow(apiRef));
    const { api: dockApi, fireDragStart } = fakeDockviewApi();
    act(() => result.current.attachDragOutListener(dockApi));

    const panel = fakePanel('register#2');
    fireDragStart(panel, dispatchedDragEvent('dragstart'));
    document.dispatchEvent(dispatchedDragEvent('dragend', { screenX: 1400, screenY: 300 }));
    await settleDragOut();

    expect(openDaughterWindowAt).not.toHaveBeenCalled();
    expect(result.current.pendingPanel).toBe(panel);

    await act(async () => {
      result.current.confirm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openDaughterWindowAt).toHaveBeenCalledWith('register', expect.objectContaining({ width: DAUGHTER_WINDOW_DEFAULT_WIDTH }), undefined);
    expect(removePanel).toHaveBeenCalledWith(panel);
    expect(result.current.pendingPanel).toBeNull();
  });
});
