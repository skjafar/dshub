import { describe, it, expect, vi, afterEach } from 'vitest';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isMainWindow, MAIN_TAURI_WINDOW_LABEL } from '../windowRole';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('isMainWindow', () => {
  it('is true outside Tauri — dev-in-browser and every test has no concept of a Daughter Window', () => {
    vi.mocked(isTauri).mockReturnValue(false);
    expect(isMainWindow()).toBe(true);
    expect(getCurrentWindow).not.toHaveBeenCalled();
  });

  it('is true when the current Tauri window is labelled "main"', () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(getCurrentWindow).mockReturnValue({ label: MAIN_TAURI_WINDOW_LABEL } as never);
    expect(isMainWindow()).toBe(true);
  });

  it('is false when the current Tauri window carries a Daughter Window label', () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(getCurrentWindow).mockReturnValue({ label: 'daughter-3' } as never);
    expect(isMainWindow()).toBe(false);
  });
});
