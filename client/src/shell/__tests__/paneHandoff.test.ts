// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { isTauri } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { MAIN_WINDOW_ID } from '../focusMode';
import { PANE_HANDOFF_EVENT, sendPaneHandoff, useIncomingPaneHandoffs } from '../paneHandoff';
import type { PaneHandoffPayload } from '../paneHandoff';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
  listen: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

function payload(overrides: Partial<PaneHandoffPayload> = {}): PaneHandoffPayload {
  return {
    targetWindowId: 'daughter-1',
    kind: 'register',
    paneState: { query: 'MOTOR' },
    ...overrides,
  };
}

describe('sendPaneHandoff', () => {
  it('emits the handoff event under Tauri, resolving once the emit call itself does', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(emit).mockResolvedValue(undefined);
    const sent = payload();

    await expect(sendPaneHandoff(sent)).resolves.toBeUndefined();

    expect(emit).toHaveBeenCalledWith(PANE_HANDOFF_EVENT, sent);
  });

  it('rejects if the underlying emit call itself rejects, so a caller can avoid dropping the Pane', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(emit).mockRejectedValue(new Error('boom'));

    await expect(sendPaneHandoff(payload())).rejects.toThrow('boom');
  });

  it('is a safe no-op outside Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(false);

    await expect(sendPaneHandoff(payload())).resolves.toBeUndefined();

    expect(emit).not.toHaveBeenCalled();
  });
});

describe('useIncomingPaneHandoffs', () => {
  it('calls onReceive for a handoff addressed to this Window', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let deliver: (event: { payload: PaneHandoffPayload }) => void = () => {};
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      deliver = handler as never;
      return vi.fn();
    });
    const onReceive = vi.fn();

    renderHook(() => useIncomingPaneHandoffs('daughter-1', onReceive));
    await settle();

    const incoming = payload({ targetWindowId: 'daughter-1' });
    act(() => deliver({ payload: incoming }));

    expect(onReceive).toHaveBeenCalledWith(incoming);
  });

  it('ignores a handoff addressed to a different Window', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let deliver: (event: { payload: PaneHandoffPayload }) => void = () => {};
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      deliver = handler as never;
      return vi.fn();
    });
    const onReceive = vi.fn();

    renderHook(() => useIncomingPaneHandoffs(MAIN_WINDOW_ID, onReceive));
    await settle();

    act(() => deliver({ payload: payload({ targetWindowId: 'daughter-1' }) }));

    expect(onReceive).not.toHaveBeenCalled();
  });

  it('always calls the latest onReceive, not the one from the render that first subscribed', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let deliver: (event: { payload: PaneHandoffPayload }) => void = () => {};
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      deliver = handler as never;
      return vi.fn();
    });
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ onReceive }: { onReceive: (p: PaneHandoffPayload) => void }) =>
        useIncomingPaneHandoffs('daughter-1', onReceive),
      { initialProps: { onReceive: first } }
    );
    await settle();

    rerender({ onReceive: second });

    act(() => deliver({ payload: payload({ targetWindowId: 'daughter-1' }) }));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not throw and does not listen outside Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const onReceive = vi.fn();

    renderHook(() => useIncomingPaneHandoffs(MAIN_WINDOW_ID, onReceive));
    await settle();

    expect(listen).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);

    const { unmount } = renderHook(() => useIncomingPaneHandoffs(MAIN_WINDOW_ID, vi.fn()));
    await settle();
    unmount();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
