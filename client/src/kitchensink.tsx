/**
 * A development-only page showing every primitive in both themes at once.
 *
 * The two panels are the point: the type scale, density and the actual look are
 * decided by building them and looking at them side by side, rather than by
 * describing them. Each panel applies its own theme to its own container, which
 * also demonstrates that the tokens are scoped to an element rather than pinned
 * to the document.
 *
 * Not a build input, so it never ships. Reach it in dev at /kitchensink.html.
 */

import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';

import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './index.css';

import { APP_THEMES } from './appThemes';
import type { AppTheme } from './appThemes';
import { readableOn } from './design/contrast';
import {
  Button,
  Dialog,
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  NumericInput,
  Popover,
  Select,
  Slider,
  Switch,
  TabPanel,
  Table,
  Tabs,
  TextField,
  ThemeScope,
  Tooltip,
  TooltipProvider,
} from './ui';
import { TEXT } from './design/tokens';
import styles from './kitchensink.module.css';

const REGISTERS = [
  { address: 0, name: 'CONTROLLER_STATE', value: 3, type: 'uint32_t' },
  { address: 1, name: 'MOTOR_X_ENCODER', value: 128_400, type: 'int32_t' },
  { address: 4, name: 'SPINDLE_RPM', value: 11_842, type: 'uint32_t' },
  { address: 5, name: 'SPINDLE_LOAD', value: 62, type: 'uint32_t' },
];

function surfaceSwatches(t: AppTheme): Swatch[] {
  return [
    ['lowest', t.colors.surfaceLowest],
    ['surface', t.colors.surface],
    ['container', t.colors.surfaceContainer],
    ['high', t.colors.surfaceHigh],
    ['highest', t.colors.surfaceHighest],
  ];
}

function statusSwatches(t: AppTheme): Swatch[] {
  return [
    ['ok', t.colors.status.ok],
    ['warn', t.colors.status.warn],
    ['error', t.colors.status.error],
    ['info', t.colors.status.info],
    ['idle', t.colors.status.idle],
  ];
}

function accentSwatches(t: AppTheme): Swatch[] {
  return [
    ['primary', t.colors.primary],
    ['secondary', t.colors.secondary],
    ['tertiary', t.colors.tertiary],
  ];
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

/** Label paired with the resolved colour it sits on. */
type Swatch = readonly [label: string, hex: string];

function Swatches({ swatches }: { swatches: readonly Swatch[] }): React.JSX.Element {
  return (
    <div className={styles.swatches}>
      {swatches.map(([label, hex]) => (
        <div key={label} className={styles.swatch} style={{ background: hex }}>
          {/* Black or white, whichever actually reads on this swatch. The
              obvious blend-mode trick washes out on the mid-tones, which is
              exactly where a reviewer needs to read the name. */}
          <span style={{ color: readableOn(hex) }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

/** Every primitive, rendered once. Mounted twice — one panel per theme. */
function Primitives({ theme }: { theme: AppTheme }): React.JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState('registers');
  const [checked, setChecked] = useState(true);
  const [menuChecked, setMenuChecked] = useState(false);
  const [format, setFormat] = useState<'decimal' | 'hex' | 'binary'>('decimal');
  const [pollInterval, setPollInterval] = useState(500);
  const [rpm, setRpm] = useState(11_842);
  const [selected, setSelected] = useState<string | undefined>('4');

  return (
    <>
      <Section title="Type scale">
        {(Object.keys(TEXT) as (keyof typeof TEXT)[]).map(size => (
          <div key={size} className={styles.typeRow}>
            <span className={styles.typeLabel}>{size}</span>
            <span style={{ fontSize: `var(--text-${size})` }}>
              Spindle 11,842 rpm — the quick brown fox
            </span>
          </div>
        ))}
      </Section>

      <Section title="Surfaces">
        <Swatches swatches={surfaceSwatches(theme)} />
      </Section>

      <Section title="Status — identical in every theme of a mode">
        <Swatches swatches={statusSwatches(theme)} />
      </Section>

      <Section title="Accents — brand and chrome only, never a condition">
        <Swatches swatches={accentSwatches(theme)} />
      </Section>

      <Section title="Buttons">
        <div className={styles.row}>
          <Button variant="primary">Take Control</Button>
          <Button variant="secondary">Scan</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Disconnect</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
        <div className={styles.row} style={{ marginTop: 'var(--space-sm)' }}>
          <Button size="sm" variant="secondary">Small</Button>
          <Button size="base" variant="secondary">Base</Button>
          <Button size="lg" variant="secondary">Large</Button>
        </div>
      </Section>

      <Section title="Overlays">
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>

          <Menu trigger={<Button variant="secondary">Menu</Button>}>
            <MenuLabel>Export</MenuLabel>
            <MenuItem>Export CSV</MenuItem>
            <MenuItem>Export PDF</MenuItem>
            <MenuSeparator />
            <MenuCheckboxItem checked={menuChecked} onCheckedChange={setMenuChecked}>
              Include packet log
            </MenuCheckboxItem>
            <MenuItem disabled>Unavailable</MenuItem>
          </Menu>

          <Popover trigger={<Button variant="secondary">Popover</Button>}>
            <div className={styles.stack}>
              <TextField label="Filter" placeholder="Name or address" />
              <Switch checked={checked} onCheckedChange={setChecked} aria-label="Only writable" />
            </div>
          </Popover>

          <Tooltip content="Reads every watched address at the fastest requested interval">
            <Button variant="ghost">Hover me</Button>
          </Tooltip>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Write register"
          description="SPINDLE_SPEED_SETPOINT (0x0B) — this writes to live hardware."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>
                Write
              </Button>
            </>
          }
        >
          <div className={styles.stack}>
            <NumericInput label="Value" value={rpm} onCommit={setRpm} />
            <p className={styles.note}>
              Tab moves only within this dialog while it is open, and Escape returns
              focus to whatever opened it.
            </p>
          </div>
        </Dialog>
      </Section>

      <Section title="Inputs">
        <div className={styles.stack}>
          <TextField label="Device name" placeholder="SESAME-CTRL-01" />
          <TextField label="Address" mono defaultValue="0x000B" hint="Hex, with or without prefix" />
          <TextField label="Interface" defaultValue="TCP/IP" error="No route to host" />
          <NumericInput label="Spindle RPM" value={rpm} onCommit={setRpm} />
          <div className={styles.row}>
            <Select
              value={format}
              onValueChange={setFormat}
              aria-label="Display format"
              options={[
                { value: 'decimal', label: 'Decimal' },
                { value: 'hex', label: 'Hexadecimal' },
                { value: 'binary', label: 'Binary' },
              ]}
            />
            <Switch checked={checked} onCheckedChange={setChecked} aria-label="Auto refresh" />
            <span className={styles.note}>Auto refresh</span>
          </div>
          <div>
            <span className={styles.note}>Poll interval — {pollInterval} ms</span>
            <Slider
              value={pollInterval}
              onValueChange={setPollInterval}
              min={50}
              max={2000}
              step={50}
              aria-label="Poll interval"
            />
          </div>
        </div>
      </Section>

      <Section title="Tabs and table">
        <Tabs
          value={tab}
          onValueChange={setTab}
          aria-label="Address spaces"
          tabs={[
            { value: 'registers', label: 'Registers' },
            { value: 'parameters', label: 'Parameters' },
            { value: 'system', label: 'System' },
          ]}
        >
          <TabPanel value="registers">
            <Table
              caption="Register data"
              columns={[
                {
                  key: 'address',
                  header: 'Addr',
                  mono: true,
                  width: '80px',
                  render: r => `0x${r.address.toString(16).toUpperCase().padStart(4, '0')}`,
                },
                { key: 'name', header: 'Name', render: r => r.name },
                { key: 'type', header: 'Type', mono: true, render: r => r.type },
                {
                  key: 'value',
                  header: 'Value',
                  numeric: true,
                  render: r => r.value.toLocaleString(),
                },
              ]}
              rows={REGISTERS}
              rowKey={r => String(r.address)}
              selectedKey={selected}
              onSelect={r => setSelected(String(r.address))}
            />
          </TabPanel>
          <TabPanel value="parameters">
            <Table
              columns={[{ key: 'name', header: 'Name', render: (r: { name: string }) => r.name }]}
              rows={[]}
              rowKey={r => r.name}
              emptyMessage="No parameters in this Profile"
            />
          </TabPanel>
          <TabPanel value="system">
            <p className={styles.note}>System registers are read-only over the protocol.</p>
          </TabPanel>
        </Tabs>
      </Section>
    </>
  );
}

/**
 * One themed panel.
 *
 * `ThemeScope` applies the theme to this element rather than the document, and
 * portals anything floating back into it — without that, a dialog opened here
 * would render outside the themed subtree with every token unresolved.
 */
function ThemePanel({ theme }: { theme: AppTheme }): React.JSX.Element {
  return (
    <ThemeScope theme={theme} className={styles.panel}>
      <header className={styles.panelHeader}>
        <h1 className={styles.panelTitle}>{theme.name}</h1>
        <span className={styles.panelMode}>{theme.mode}</span>
      </header>
      <Primitives theme={theme} />
    </ThemeScope>
  );
}

function KitchenSink(): React.JSX.Element {
  return (
    <TooltipProvider>
      <div className={styles.page}>
        {APP_THEMES.map(theme => (
          <ThemePanel key={theme.id} theme={theme} />
        ))}
      </div>
    </TooltipProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <KitchenSink />
  </React.StrictMode>
);
