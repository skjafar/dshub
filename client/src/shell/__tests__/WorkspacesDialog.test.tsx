// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SerializedDockview } from 'dockview';
import { WorkspacesDialog } from '../WorkspacesDialog';
import type { StoredWorkspace } from '../workspaceStore';

afterEach(cleanup);

function workspace(id: string, name: string): StoredWorkspace {
  return {
    id,
    name,
    mainDockLayout: {
      grid: { root: { type: 'branch', data: [] }, height: 0, width: 0, orientation: 'HORIZONTAL' },
      panels: {},
    } as unknown as SerializedDockview,
    paneStates: {},
    selection: null,
    daughterWindows: [],
  };
}

/**
 * Named Workspaces are switched, renamed and deleted from here — ticket 08's
 * bullet naming the chrome. Deletion is two-click ("Confirm?") because losing a
 * saved arrangement is not a mistake that should be one misclick away, and the
 * default Workspace cannot be deleted at all: a Profile always needs somewhere
 * to open into.
 */
describe('WorkspacesDialog', () => {
  // Named "Main Bench" rather than "Default" so the row's own name and the
  // "Default" badge text never collide — a test asserting on the badge must
  // not have to reach for a class selector to tell the two apart.
  const workspaces = [workspace('default', 'Main Bench'), workspace('w2', 'Debug Layout')];

  it('marks which Workspace is active and which is the default', () => {
    render(
      <WorkspacesDialog
        open
        onOpenChange={() => {}}
        workspaces={workspaces}
        activeWorkspaceId="w2"
        defaultWorkspaceId="default"
        onSwitch={() => {}}
        onSaveAs={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /^Main Bench/ })).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('switches Workspace and closes the dialog when a name is clicked', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <WorkspacesDialog
        open
        onOpenChange={onOpenChange}
        workspaces={workspaces}
        activeWorkspaceId="default"
        defaultWorkspaceId="default"
        onSwitch={onSwitch}
        onSaveAs={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Debug Layout' }));
    expect(onSwitch).toHaveBeenCalledWith('w2');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('saves the current arrangement as a new Workspace, trimmed, and clears the field', async () => {
    const user = userEvent.setup();
    const onSaveAs = vi.fn();
    render(
      <WorkspacesDialog
        open
        onOpenChange={() => {}}
        workspaces={workspaces}
        activeWorkspaceId="default"
        defaultWorkspaceId="default"
        onSwitch={() => {}}
        onSaveAs={onSaveAs}
        onRename={() => {}}
        onDelete={() => {}}
      />
    );

    const input = screen.getByLabelText('Save current arrangement as');
    await user.type(input, '  Motion tuning  ');
    await user.click(screen.getByRole('button', { name: /Save as New/ }));

    expect(onSaveAs).toHaveBeenCalledWith('Motion tuning');
    expect(input).toHaveValue('');
  });

  it('refuses to save a blank or whitespace-only name', async () => {
    const user = userEvent.setup();
    const onSaveAs = vi.fn();
    render(
      <WorkspacesDialog
        open
        onOpenChange={() => {}}
        workspaces={workspaces}
        activeWorkspaceId="default"
        defaultWorkspaceId="default"
        onSwitch={() => {}}
        onSaveAs={onSaveAs}
        onRename={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /Save as New/ })).toBeDisabled();
    await user.type(screen.getByLabelText('Save current arrangement as'), '   ');
    expect(screen.getByRole('button', { name: /Save as New/ })).toBeDisabled();
    expect(onSaveAs).not.toHaveBeenCalled();
  });

  it('renames a Workspace from its own row', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(
      <WorkspacesDialog
        open
        onOpenChange={() => {}}
        workspaces={workspaces}
        activeWorkspaceId="default"
        defaultWorkspaceId="default"
        onSwitch={() => {}}
        onSaveAs={() => {}}
        onRename={onRename}
        onDelete={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Rename Debug Layout' }));
    const field = screen.getByLabelText('Rename Debug Layout');
    await user.clear(field);
    await user.type(field, 'Fault chasing{Enter}');

    expect(onRename).toHaveBeenCalledWith('w2', 'Fault chasing');
  });

  it('deletes only after the delete action is confirmed a second time', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <WorkspacesDialog
        open
        onOpenChange={() => {}}
        workspaces={workspaces}
        activeWorkspaceId="default"
        defaultWorkspaceId="default"
        onSwitch={() => {}}
        onSaveAs={() => {}}
        onRename={() => {}}
        onDelete={onDelete}
      />
    );

    const deleteButton = screen.getByRole('button', { name: 'Delete Debug Layout' });
    await user.click(deleteButton);
    expect(onDelete).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole('button', { name: 'Confirm deleting Debug Layout' });
    await user.click(confirmButton);
    expect(onDelete).toHaveBeenCalledWith('w2');
  });

  it('disables deleting the default Workspace, so a Profile never loses what it opens into', () => {
    render(
      <WorkspacesDialog
        open
        onOpenChange={() => {}}
        workspaces={workspaces}
        activeWorkspaceId="default"
        defaultWorkspaceId="default"
        onSwitch={() => {}}
        onSaveAs={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: 'Delete Main Bench' })).toBeDisabled();
  });
});
