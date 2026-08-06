// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GuideDialog } from '../GuideDialog';

afterEach(cleanup);

describe('GuideDialog', () => {
  it('walks through the workflow from an empty Profile to a controllable Device', () => {
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
