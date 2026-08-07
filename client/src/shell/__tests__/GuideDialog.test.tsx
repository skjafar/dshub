// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuideDialog } from '../GuideDialog';

afterEach(cleanup);

describe('GuideDialog workflow tab', () => {
  it('is open by default, and walks through the workflow from an empty Profile to a controllable Device', () => {
    render(<GuideDialog open onOpenChange={() => {}} />);

    // Every step is a numbered heading naming the surface that handles it.
    expect(screen.getByRole('heading', { name: 'Create a Profile' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Export files' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Flash and run the board' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Scan and connect' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Build a Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Take Control' })).toBeInTheDocument();
  });

  it('points each step at the chrome surface that actually does it now', () => {
    // The pre-rebuild guide named a standalone Device Scanner destination;
    // scanning and connecting are one flow launched from the chrome now.
    render(<GuideDialog open onOpenChange={() => {}} />);

    expect(screen.queryByText('Device Scanner')).not.toBeInTheDocument();
    expect(screen.getByText('Connect')).toBeInTheDocument();
    expect(screen.getByText('Map Editor')).toBeInTheDocument();
    expect(screen.getByText('Focus Mode')).toBeInTheDocument();
  });
});

describe('GuideDialog reference tab', () => {
  it('covers what the rebuild added beyond the onboarding flow', async () => {
    const user = userEvent.setup();
    render(<GuideDialog open onOpenChange={() => {}} />);

    await user.click(screen.getByRole('tab', { name: 'Reference' }));

    expect(screen.getByText('Several Panes of a kind, at once')).toBeInTheDocument();
    expect(screen.getByText('Named Workspaces')).toBeInTheDocument();
    expect(screen.getByText('Cursor sync')).toBeInTheDocument();
    expect(screen.getByText('Sixteen Widget kinds')).toBeInTheDocument();
    // Radix unmounts an inactive TabPanel, so this is unambiguous even though
    // the Workflow tab's own hint chip carries the same text.
    expect(screen.getByText('Focus Mode')).toBeInTheDocument();
  });
});

describe('GuideDialog keyboard tab', () => {
  it('documents dockview and the shared primitives’ existing keyboard behaviour, not a new shortcut scheme', async () => {
    const user = userEvent.setup();
    render(<GuideDialog open onOpenChange={() => {}} />);

    await user.click(screen.getByRole('tab', { name: 'Keyboard' }));

    expect(screen.getByText('Close the focused Pane')).toBeInTheDocument();
    expect(screen.getByText('Delete or Backspace')).toBeInTheDocument();
    expect(screen.getByText('Reopen a closed Pane')).toBeInTheDocument();
    expect(screen.getByText('Panes menu, in the chrome')).toBeInTheDocument();
  });
});
