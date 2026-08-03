// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { retainPaneState, usePaneState } from '../paneState';

/**
 * Per-instance Pane state has to survive two things and be destroyed by a third,
 * and getting either half wrong is silent.
 *
 * dockview unmounts a Pane whose tab is not the visible one in its group, and
 * unmounts it again when it is dragged to another group — so a filter held in
 * plain component state is lost to a neighbouring tab click.
 *
 * The other half matters more. `AppShell.openPane` gives a new Pane the lowest
 * free instance number, so closing `Registers 1` and opening another produces
 * the id `register#1` a second time. Without pruning, the new Pane would open
 * already filtered to whatever its predecessor was looking at — a Pane that
 * silently shows a subset of the Map is how an Engineer concludes a register is
 * missing from a board.
 */

afterEach(() => {
  cleanup();
  retainPaneState([]);
});

function FilterPane({ paneId }: { readonly paneId: string }): React.JSX.Element {
  const [state, update] = usePaneState(paneId, () => ({ query: '' }));
  return (
    <input
      aria-label="Filter"
      value={state.query}
      onChange={event => update(() => ({ query: event.target.value }))}
    />
  );
}

const filter = (): HTMLInputElement => screen.getByRole('textbox', { name: 'Filter' });

describe('per-instance Pane state', () => {
  it('survives the Pane being unmounted and mounted again', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<FilterPane paneId="register#1" />);

    await user.type(filter(), 'MOTOR');
    unmount();

    render(<FilterPane paneId="register#1" />);
    expect(filter()).toHaveValue('MOTOR');
  });

  it('keeps two Panes apart, however they are mounted', async () => {
    const user = userEvent.setup();
    render(
      <>
        <section aria-label="A"><FilterPane paneId="register#1" /></section>
        <section aria-label="B"><FilterPane paneId="register#2" /></section>
      </>
    );

    const [a, b] = screen.getAllByRole('textbox', { name: 'Filter' });
    await user.type(a, 'MOTOR');
    await user.type(b, 'SPINDLE');

    expect(a).toHaveValue('MOTOR');
    expect(b).toHaveValue('SPINDLE');
  });

  it('is forgotten once the Pane is no longer open, so a reused id starts clean', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<FilterPane paneId="register#1" />);
    await user.type(filter(), 'MOTOR');
    unmount();

    // What the shell does when dockview stops reporting the panel.
    retainPaneState([]);

    render(<FilterPane paneId="register#1" />);
    expect(filter()).toHaveValue('');
  });

  it('forgets only the Panes that closed, not the ones still open', async () => {
    const user = userEvent.setup();
    const first = render(<FilterPane paneId="register#1" />);
    await user.type(filter(), 'MOTOR');
    first.unmount();

    const second = render(<FilterPane paneId="register#2" />);
    await user.type(filter(), 'SPINDLE');
    second.unmount();

    retainPaneState(['register#2']);

    render(
      <>
        <section aria-label="A"><FilterPane paneId="register#1" /></section>
        <section aria-label="B"><FilterPane paneId="register#2" /></section>
      </>
    );

    const [a, b] = screen.getAllByRole('textbox', { name: 'Filter' });
    expect(a).toHaveValue('');
    expect(b).toHaveValue('SPINDLE');
  });
});
