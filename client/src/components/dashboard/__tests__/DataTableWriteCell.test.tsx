// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTableWriteCell } from '../DataTableWidget';

// Auto-cleanup only registers itself when vitest runs with `globals: true`.
afterEach(cleanup);

/**
 * The write cell mirrors the device's live value whenever the field is not
 * focused. Clicking Send blurs the field, which used to let that mirroring
 * overwrite what the user had typed *before* the form submitted — so the click
 * wrote the device's existing value back to it instead of the new one. Pressing
 * Enter never hit this, because the field is still focused when the form submits.
 *
 * That is a silent wrong-value write to hardware, so both commit paths are
 * pinned here.
 */
function renderCell(onSubmit: (raw: string) => void, liveValue: number | undefined = 7) {
  return render(
    <DataTableWriteCell
      format="decimal"
      isFloat={false}
      liveValue={liveValue}
      disabled={false}
      fontSize="0.8rem"
      placeholder="0"
      onSubmit={onSubmit}
    />
  );
}

describe('DataTableWriteCell', () => {
  it('mirrors the live device value when not being edited', () => {
    renderCell(vi.fn(), 7);
    expect(screen.getByRole('textbox')).toHaveValue('7');
  });

  it('submits the typed value when Send is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderCell(onSubmit, 7);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '123');
    await user.click(screen.getByRole('button', { name: /send value/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    // The regression wrote '7' — the value already on the device.
    expect(onSubmit).toHaveBeenCalledWith('123');
  });

  it('submits the typed value when Enter is pressed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderCell(onSubmit, 7);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '456{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('456');
  });

  it('keeps the typed value in the field while Send is held down', async () => {
    const user = userEvent.setup();
    renderCell(vi.fn(), 7);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '99');

    await user.pointer({ keys: '[MouseLeft>]', target: screen.getByRole('button', { name: /send value/i }) });
    expect(input).toHaveValue('99');
    await user.pointer({ keys: '[/MouseLeft]' });
  });

  it('shows a prefetched float at the display precision', () => {
    render(
      <DataTableWriteCell
        format="decimal"
        isFloat
        liveValue={1.23456789}
        disabled={false}
        fontSize="0.8rem"
        placeholder="0"
        onSubmit={vi.fn()}
      />
    );
    // Same as the read-only display of the same value.
    expect(screen.getByRole('textbox')).toHaveValue('1.235');
  });

  it('shows a float below the display precision in scientific notation', () => {
    render(
      <DataTableWriteCell
        format="decimal"
        isFloat
        liveValue={0.0000123}
        disabled={false}
        fontSize="0.8rem"
        placeholder="0"
        onSubmit={vi.fn()}
      />
    );
    // Fixed-point would render this as "0.000", which reads as "off".
    expect(screen.getByRole('textbox')).toHaveValue('1.2300e-5');
  });

  it('submits the exact device value when the field was never edited', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <DataTableWriteCell
        format="decimal"
        isFloat
        liveValue={1.23456789}
        disabled={false}
        fontSize="0.8rem"
        placeholder="0"
        onSubmit={onSubmit}
      />
    );

    await user.click(screen.getByRole('button', { name: /send value/i }));

    // The field reads "1.235", but sending an untouched field must not quietly
    // round the live parameter down to what happens to be on screen.
    expect(onSubmit).toHaveBeenCalledWith('1.23456789');
  });

  it('submits what the user typed once the field has been edited', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <DataTableWriteCell
        format="decimal"
        isFloat
        liveValue={1.23456789}
        disabled={false}
        fontSize="0.8rem"
        placeholder="0"
        onSubmit={onSubmit}
      />
    );

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '2.5');
    await user.click(screen.getByRole('button', { name: /send value/i }));

    expect(onSubmit).toHaveBeenCalledWith('2.5');
  });

  it('does not submit while disabled', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <DataTableWriteCell
        format="decimal"
        isFloat={false}
        liveValue={7}
        disabled
        fontSize="0.8rem"
        placeholder="0"
        onSubmit={onSubmit}
      />
    );

    await user.click(screen.getByRole('button', { name: /send value/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
