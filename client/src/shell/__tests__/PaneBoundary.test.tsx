// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaneBoundary } from '../PaneBoundary';

afterEach(cleanup);

/**
 * A Workspace holds several Panes at once, so a Pane that throws must take down
 * only itself. Before the rebuild a thrown error blanked the whole application:
 * one bad Register value could leave an operator with nothing on screen, mid
 * shift, beside running equipment.
 *
 * React only stops propagation at a boundary, so the boundary has to sit inside
 * each Pane rather than around the Workspace.
 */
function Exploding(): React.JSX.Element {
  throw new Error('register decode failed');
}

describe('PaneBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; the test is about containment, not the noise.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('contains a crash to its own Pane and leaves its neighbours rendering', () => {
    render(
      <>
        <PaneBoundary title="Registers">
          <Exploding />
        </PaneBoundary>
        <PaneBoundary title="Overview">
          <p>Device is online</p>
        </PaneBoundary>
      </>
    );

    expect(screen.getByText('Device is online')).toBeInTheDocument();
  });

  it('names the Pane that failed, so the fault is attributable', () => {
    render(
      <PaneBoundary title="Registers">
        <Exploding />
      </PaneBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/Registers/);
  });

  it('offers a retry that re-renders the Pane', async () => {
    const user = userEvent.setup();
    let shouldThrow = true;
    function Flaky(): React.JSX.Element {
      if (shouldThrow) throw new Error('transient');
      return <p>recovered</p>;
    }

    render(
      <PaneBoundary title="Registers">
        <Flaky />
      </PaneBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('renders its Pane untouched when nothing throws', () => {
    render(
      <PaneBoundary title="Overview">
        <p>Device is online</p>
      </PaneBoundary>
    );

    expect(screen.getByText('Device is online')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
