// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';
import { Dialog } from '../Dialog';
import { Menu, MenuItem } from '../Menu';
import { Popover } from '../Popover';
import { Select } from '../Select';
import { Slider } from '../Slider';
import { Switch } from '../Switch';
import { Table } from '../Table';
import { TabPanel, Tabs } from '../Tabs';
import { TextField } from '../TextField';
import { Tooltip, TooltipProvider } from '../Tooltip';

afterEach(cleanup);

/**
 * Every Pane, Widget and dialog has to be operable from the keyboard, and what
 * a keystroke will act on has to be visible at all times. These are the two
 * commitments that are cheapest to break silently — a control reachable by mouse
 * only looks fine to whoever built it — so they are pinned at the primitive
 * layer where every surface inherits them.
 */

describe('dialog focus behaviour', () => {
  function DialogHarness(): React.JSX.Element {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <Button>Outside</Button>
        <Dialog open={open} onOpenChange={setOpen} title="Write register" footer={<Button>Confirm</Button>}>
          <Button>Inside</Button>
        </Dialog>
      </>
    );
  }

  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    await user.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('keeps Tab inside the dialog while it is open', async () => {
    // Without a trap, Tab walks out into the page behind the scrim and a
    // keyboard user is left operating controls they cannot see.
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog');

    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('closes on Escape and returns focus to whatever opened it', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Focus is restored after the close animation frame, not synchronously.
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('offers a close control that is reachable and named', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: /close/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('menu keyboard operation', () => {
  it('opens from the keyboard with the first item already focused', async () => {
    const user = userEvent.setup();
    const onFirst = vi.fn();
    render(
      <Menu trigger={<Button>Actions</Button>}>
        <MenuItem onSelect={onFirst}>Export CSV</MenuItem>
        <MenuItem>Export PDF</MenuItem>
      </Menu>
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus();

    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    // Opening lands on the first item, so running it costs no extra keystroke.
    await user.keyboard('{Enter}');

    expect(onFirst).toHaveBeenCalledTimes(1);
  });

  it('walks items with the arrow keys', async () => {
    const user = userEvent.setup();
    const onSecond = vi.fn();
    render(
      <Menu trigger={<Button>Actions</Button>}>
        <MenuItem>Export CSV</MenuItem>
        <MenuItem onSelect={onSecond}>Export PDF</MenuItem>
      </Menu>
    );

    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSecond).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape without running anything', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Menu trigger={<Button>Actions</Button>}>
        <MenuItem onSelect={onSelect}>Export CSV</MenuItem>
      </Menu>
    );

    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('tab strip keyboard operation', () => {
  function TabsHarness(): React.JSX.Element {
    const [value, setValue] = useState('registers');
    return (
      <Tabs
        value={value}
        onValueChange={setValue}
        aria-label="Address spaces"
        tabs={[
          { value: 'registers', label: 'Registers' },
          { value: 'parameters', label: 'Parameters' },
        ]}
      >
        <TabPanel value="registers">Register list</TabPanel>
        <TabPanel value="parameters">Parameter list</TabPanel>
      </Tabs>
    );
  }

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Registers' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Parameters' })).toHaveFocus();
    expect(screen.getByText('Parameter list')).toBeInTheDocument();
  });

  it('puts the whole strip on one tab stop', async () => {
    // A strip that costs one Tab per tab makes every pane behind it slower to
    // reach; the arrow keys are what move between tabs.
    const user = userEvent.setup();
    render(<TabsHarness />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Registers' })).toHaveFocus();
    await user.tab();

    expect(screen.getByRole('tab', { name: 'Parameters' })).not.toHaveFocus();
  });
});

describe('switch keyboard operation', () => {
  it('toggles with Space', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="Auto refresh" />);

    await user.tab();
    await user.keyboard(' ');

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('reports its state rather than only looking different', () => {
    render(<Switch checked onCheckedChange={vi.fn()} aria-label="Auto refresh" />);
    expect(screen.getByRole('switch', { name: 'Auto refresh' })).toBeChecked();
  });
});

describe('select keyboard operation', () => {
  function SelectHarness(): React.JSX.Element {
    const [value, setValue] = useState<'decimal' | 'hex'>('decimal');
    return (
      <Select
        value={value}
        onValueChange={setValue}
        aria-label="Display format"
        options={[
          { value: 'decimal', label: 'Decimal' },
          { value: 'hex', label: 'Hexadecimal' },
        ]}
      />
    );
  }

  it('opens and chooses an option without a pointer', async () => {
    const user = userEvent.setup();
    render(<SelectHarness />);

    await user.tab();
    expect(screen.getByRole('combobox', { name: 'Display format' })).toHaveFocus();

    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByRole('combobox', { name: 'Display format' })).toHaveTextContent(
      'Hexadecimal'
    );
  });
});

describe('popover keyboard operation', () => {
  it('opens from the keyboard, reaches its contents, and returns focus on Escape', async () => {
    // The difference between a popover and a tooltip: this one holds focusable
    // things, so a keyboard user has to be able to get into it and back out.
    const user = userEvent.setup();
    render(
      <Popover trigger={<Button>Filter</Button>}>
        <TextField label="Name" />
      </Popover>
    );

    const trigger = screen.getByRole('button', { name: 'Filter' });
    await user.tab();
    await user.keyboard('{Enter}');

    const field = await screen.findByLabelText('Name');
    await user.tab();
    expect(field).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('tooltip', () => {
  it('appears on focus, not only on hover', async () => {
    // A tooltip reachable only by pointer is a label a keyboard user never sees.
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip content="Reads every watched address">
          <Button>Auto refresh</Button>
        </Tooltip>
      </TooltipProvider>
    );

    await user.tab();

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Reads every watched address'
    );
  });
});

describe('slider keyboard operation', () => {
  function SliderHarness(): React.JSX.Element {
    const [value, setValue] = useState(500);
    return (
      <Slider value={value} onValueChange={setValue} min={0} max={1000} step={50} aria-label="Poll interval" />
    );
  }

  it('adjusts with the arrow keys and reports its value', async () => {
    const user = userEvent.setup();
    render(<SliderHarness />);

    const thumb = screen.getByRole('slider', { name: 'Poll interval' });
    expect(thumb).toHaveAttribute('aria-valuenow', '500');

    await user.tab();
    expect(thumb).toHaveFocus();
    await user.keyboard('{ArrowRight}');

    expect(thumb).toHaveAttribute('aria-valuenow', '550');
  });
});

describe('text field', () => {
  it('ties its label, hint and error to the input rather than merely showing them', async () => {
    const user = userEvent.setup();
    render(<TextField label="Address" error="Out of range" />);

    const input = screen.getByLabelText('Address');
    await user.tab();

    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleDescription('Out of range');
    expect(input).toBeInvalid();
  });
});

describe('focus order', () => {
  /**
   * Whether the ring is *visible* is a rendered property: jsdom loads no CSS and
   * does not implement `:focus-visible`, so asserting it here would pass on a
   * stylesheet that draws nothing. It is measured in a real browser against the
   * primitives page instead — the computed outline on a keyboard-focused
   * control — and what is pinned here is the part jsdom can honestly answer:
   * that every control is reachable by Tab, in the order it is read in.
   */
  it('reaches every control in reading order', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button>First</Button>
        <TextField label="Second" />
        <Switch checked={false} onCheckedChange={vi.fn()} aria-label="Third" />
        <Button>Fourth</Button>
      </>
    );

    for (const name of ['First', 'Second', 'Third', 'Fourth']) {
      await user.tab();
      expect(document.activeElement, name).toHaveAccessibleName(name);
    }
  });
});

describe('table rows', () => {
  const rows = [
    { address: 0, name: 'SPINDLE_RPM' },
    { address: 1, name: 'SPINDLE_LOAD' },
  ];
  const columns = [
    { key: 'address', header: 'Address', render: (r: typeof rows[number]) => r.address, numeric: true },
    { key: 'name', header: 'Name', render: (r: typeof rows[number]) => r.name },
  ];

  it('lets a selectable row be reached and chosen from the keyboard', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Table columns={columns} rows={rows} rowKey={r => String(r.address)} onSelect={onSelect} />
    );

    await user.tab();
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith(rows[0]);
  });

  it('does not put non-selectable rows in the tab order', async () => {
    const user = userEvent.setup();
    render(<Table columns={columns} rows={rows} rowKey={r => String(r.address)} />);

    await user.tab();

    // Nothing in the table is focusable, so focus stays on the body.
    expect(document.body).toHaveFocus();
  });

  it('says which row is selected', () => {
    render(
      <Table
        columns={columns}
        rows={rows}
        rowKey={r => String(r.address)}
        onSelect={vi.fn()}
        selectedKey="1"
      />
    );

    const selected = screen.getByRole('row', { selected: true });
    expect(within(selected).getByText('SPINDLE_LOAD')).toBeInTheDocument();
  });
});
