// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DockviewApi } from 'dockview';
import { BackendPortProvider } from '../../contexts/BackendPortContext';
import { DSHubProvider } from '../../contexts/DSHubContext';
import { SettingsProvider } from '../../contexts/SettingsContext';
import { createFakeBackendPort } from '../../services/fakeBackendPort';
import type { BackendPort } from '../../services/backendPort';
import { SelectionProvider } from '../SelectionContext';
import { Workspace } from '../Workspace';
import { paneId } from '../paneRegistry';

/**
 * Dockview's own keyboard contract for its tab strip — arrow-key roving
 * focus, and Delete/Backspace to close the focused tab — exercised through
 * `Workspace.tsx` rather than taken on faith from dockview's docs.
 *
 * Ticket 23's "moving between Panes, closing... reachable without a
 * pointer" is this third-party behaviour, not code this repo wrote, so it is
 * pinned here rather than reimplemented. Reopening — the Panes menu — is
 * pinned separately in `AppChrome.test.tsx`, where that menu actually lives.
 */

const STORAGE_KEY = 'dshub_settings';

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/** Two singleton Panes, opened with no `position` so dockview places both as tabs in the same group. */
async function renderTwoTabbedPanes(): Promise<DockviewApi> {
  const fake = createFakeBackendPort({ deliver: fn => fn() });
  let api: DockviewApi | undefined;

  render(
    <BackendPortProvider port={fake as BackendPort}>
      <SettingsProvider>
        <DSHubProvider>
          <SelectionProvider>
            <Workspace
              onReady={ready => {
                api = ready;
              }}
            />
          </SelectionProvider>
        </DSHubProvider>
      </SettingsProvider>
    </BackendPortProvider>
  );
  await settle();
  if (!api) throw new Error('Workspace never became ready');

  act(() => {
    api!.addPanel({ id: paneId('overview'), component: 'overview', title: 'Overview' });
    api!.addPanel({ id: paneId('inspector'), component: 'inspector', title: 'Inspector' });
  });
  await settle();

  return api;
}

describe('the Workspace tab strip', () => {
  it('moves focus between tabs with the arrow keys, without a pointer', async () => {
    await renderTwoTabbedPanes();

    const first = screen.getByRole('tab', { name: 'Overview' });
    const second = screen.getByRole('tab', { name: 'Inspector' });

    first.focus();
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: 'ArrowLeft' });
    expect(first).toHaveFocus();
  });

  it('closes the focused tab on Delete, without a pointer', async () => {
    const api = await renderTwoTabbedPanes();

    const second = screen.getByRole('tab', { name: 'Inspector' });
    second.focus();
    fireEvent.keyDown(second, { key: 'Delete' });
    await settle();

    expect(screen.queryByRole('tab', { name: 'Inspector' })).not.toBeInTheDocument();
    expect(api.panels.map(panel => panel.id)).toEqual([paneId('overview')]);
  });
});
