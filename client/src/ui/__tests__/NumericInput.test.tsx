// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumericInput } from '../NumericInput';

// Auto-cleanup only registers itself when vitest runs with `globals: true`.
afterEach(cleanup);

/**
 * A numeric input in this application sits on a value the Device is also
 * updating, often several times a second. The hazard is that an arriving read
 * overwrites what a person has half-typed, so the value that eventually reaches
 * the hardware is neither what they typed nor what they saw.
 *
 * The rule is that the field mirrors the Device only while nobody is editing it,
 * and that both commit paths — keyboard and pointer — send the same thing. This
 * is the failure `DataTableWriteCell` was fixed for; the primitive exists so the
 * rebuild does not have to re-learn it sixteen times.
 */
describe('NumericInput', () => {
  it('mirrors the live value while it is not being edited', () => {
    render(<NumericInput value={7} onCommit={vi.fn()} aria-label="Speed" />);
    expect(screen.getByRole('textbox')).toHaveValue('7');
  });

  it('follows the live value as it changes, while not being edited', () => {
    const { rerender } = render(<NumericInput value={7} onCommit={vi.fn()} aria-label="Speed" />);
    rerender(<NumericInput value={9} onCommit={vi.fn()} aria-label="Speed" />);
    expect(screen.getByRole('textbox')).toHaveValue('9');
  });

  it('does not let an arriving value overwrite what is being typed', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<NumericInput value={7} onCommit={vi.fn()} aria-label="Speed" />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '123');

    // The Device reports a new value mid-edit. The draft must survive it.
    rerender(<NumericInput value={999} onCommit={vi.fn()} aria-label="Speed" />);

    expect(input).toHaveValue('123');
  });

  it('commits the typed value on Enter', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NumericInput value={7} onCommit={onCommit} aria-label="Speed" />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '123{Enter}');

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(123);
  });

  it('commits the typed value on blur, not the live value', async () => {
    // Blur is the pointer commit path: clicking a Send button elsewhere blurs
    // the field first. If blur re-mirrored the Device, the click would write the
    // value already on the hardware.
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NumericInput value={7} onCommit={onCommit} aria-label="Speed" />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '456');
    await user.tab();

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(456);
  });

  it('abandons the edit on Escape and shows the live value again', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NumericInput value={7} onCommit={onCommit} aria-label="Speed" />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '123{Escape}');

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue('7');
  });

  it('does not commit a value that is not a number', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NumericInput value={7} onCommit={onCommit} aria-label="Speed" />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'abc{Enter}');

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not commit an empty field', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NumericInput value={7} onCommit={onCommit} aria-label="Speed" />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '{Enter}');

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits once per edit, not once per keystroke', async () => {
    // Every commit is a device round-trip on a strictly request/response link.
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NumericInput value={0} onCommit={onCommit} aria-label="Speed" />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '1234{Enter}');

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(1234);
  });
});
