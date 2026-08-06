import { useEffect, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { useSettings } from '../contexts/SettingsContext';
import { DEFAULT_SETTINGS } from '../types/settings';
import type { LogSettings, UserSettings } from '../types/settings';
import { APP_THEMES } from '../appThemes';
import type { AppTheme } from '../appThemes';
import { Button, Dialog, NumericInput, Select, Switch, TextField, cx } from '../ui';
import type { SelectOption } from '../ui';
import styles from './SettingsDialog.module.css';

export interface SettingsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** How long an armed "Reset to defaults" stays armed before it resets. Matches `WorkspacesDialog`/`ProfilesDialog`'s armed-delete. */
const RESET_ARM_TIMEOUT_MS = 3000;

/** Rejects anything outside `[min, max]`, including non-integers and the empty field. */
function parseIntInRange(min: number, max: number): (raw: string) => number | null {
  return raw => {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
  };
}

const INTERFACE_OPTIONS: readonly SelectOption<'TCP' | 'UDP'>[] = [
  { value: 'TCP', label: 'TCP' },
  { value: 'UDP', label: 'UDP' },
];

interface ThemeCardProps {
  readonly theme: AppTheme;
  readonly active: boolean;
  readonly onSelect: () => void;
}

function ThemeCard({ theme, active, onSelect }: ThemeCardProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cx(styles.themeCard, active && styles.themeCardActive)}
      onClick={onSelect}
      aria-pressed={active}
    >
      {/*
       * The one deliberate exception to "never hardcode a colour value" in
       * this codebase: this card previews a Theme that may not be the active
       * one, so it has to carry that Theme's own swatch regardless of which
       * Theme is currently applied — reading custom properties here would
       * show every card in the *active* Theme's colours instead of its own.
       */}
      <span className={styles.swatchRow}>
        {theme.preview.map((color, i) => (
          <span key={i} className={styles.swatch} style={{ backgroundColor: color }} />
        ))}
      </span>
      <span className={styles.themeName}>
        {theme.name}
        {active ? <Check size={14} weight="bold" /> : null}
      </span>
      <span className={styles.themeDescription}>{theme.description}</span>
    </button>
  );
}

interface SwitchRowProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly children: React.ReactNode;
}

/** A Switch and its label as one clickable row — clicking the text toggles it too, since `<label>` implicitly targets the labelable control it wraps. */
function SwitchRow({ checked, onCheckedChange, children }: SwitchRowProps): React.JSX.Element {
  return (
    <label className={styles.switchRow}>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      {children}
    </label>
  );
}

/**
 * Application preferences: theme, connection behaviour, plot defaults, and
 * Activity Log filtering and retention.
 *
 * Deliberately nothing about a Device's own Map, Commands or Dashboards —
 * that is Profile content, and belongs to `ProfilesDialog` and the Map
 * Editor Pane instead. Keeping the two apart is what this dialog exists to
 * protect, not an incidental scope line.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps): React.JSX.Element {
  const { settings, updateSettings, storageError } = useSettings();
  const [resetArmed, setResetArmed] = useState(false);

  const setPlotDefault = <K extends keyof UserSettings['plotDefaults']>(
    key: K,
    value: UserSettings['plotDefaults'][K]
  ): void => {
    updateSettings({ plotDefaults: { ...settings.plotDefaults, [key]: value } });
  };

  const setLogSetting = <K extends keyof LogSettings>(key: K, value: LogSettings[K]): void => {
    updateSettings({ logSettings: { ...settings.logSettings, [key]: value } });
  };

  useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), RESET_ARM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  const handleReset = (): void => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    // Scoped to preferences: Profiles, Workspaces, Dashboards and Focus Mode
    // memory are untouched. `SettingsContext.resetSettings` resets the whole
    // blob, `mapProfiles` and all, which is not what "reset to defaults"
    // means from inside a dialog that promises to hold no Profile content.
    updateSettings({
      colorThemeId: DEFAULT_SETTINGS.colorThemeId,
      lastDeviceIP: DEFAULT_SETTINGS.lastDeviceIP,
      lastInterfaceType: DEFAULT_SETTINGS.lastInterfaceType,
      autoScan: DEFAULT_SETTINGS.autoScan,
      autoConnect: DEFAULT_SETTINGS.autoConnect,
      autoConnectRetries: DEFAULT_SETTINGS.autoConnectRetries,
      autoConnectRetryDelay: DEFAULT_SETTINGS.autoConnectRetryDelay,
      plotDefaults: DEFAULT_SETTINGS.plotDefaults,
      logSettings: DEFAULT_SETTINGS.logSettings,
    });
    setResetArmed(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      description="Application preferences. Device Maps, Commands and Dashboards live in Profiles, not here."
      footer={
        <Button variant={resetArmed ? 'danger' : 'ghost'} size="sm" onClick={handleReset} onBlur={() => setResetArmed(false)}>
          {resetArmed ? 'Confirm reset?' : 'Reset to defaults'}
        </Button>
      }
    >
      <div className={styles.body}>
        {storageError ? (
          <p className={styles.storageError} role="alert">
            Browser storage is full — preferences can no longer be saved. Clear browser data to restore persistence.
          </p>
        ) : null}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Theme</h3>
          <div className={styles.themeGrid}>
            {APP_THEMES.map(theme => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                active={settings.colorThemeId === theme.id}
                onSelect={() => updateSettings({ colorThemeId: theme.id })}
              />
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Connection</h3>
          <div className={styles.fields}>
            <TextField
              label="Last device address"
              mono
              value={settings.lastDeviceIP}
              onChange={e => updateSettings({ lastDeviceIP: e.target.value })}
              placeholder="192.168.1.42"
            />
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Preferred interface</span>
              <Select
                value={settings.lastInterfaceType}
                onValueChange={lastInterfaceType => updateSettings({ lastInterfaceType })}
                options={INTERFACE_OPTIONS}
                aria-label="Preferred interface"
              />
            </div>
            <SwitchRow checked={settings.autoScan} onCheckedChange={autoScan => updateSettings({ autoScan })}>
              Auto-scan for devices on startup
            </SwitchRow>
            <SwitchRow checked={settings.autoConnect} onCheckedChange={autoConnect => updateSettings({ autoConnect })}>
              Auto-connect to the last device on startup
            </SwitchRow>
            {settings.autoConnect ? (
              <div className={styles.pair}>
                <NumericInput
                  label="Retry attempts"
                  value={settings.autoConnectRetries}
                  onCommit={autoConnectRetries => updateSettings({ autoConnectRetries })}
                  parse={parseIntInRange(0, 10)}
                  hint="0–10 attempts"
                />
                <NumericInput
                  label="Retry delay"
                  value={settings.autoConnectRetryDelay}
                  onCommit={autoConnectRetryDelay => updateSettings({ autoConnectRetryDelay })}
                  parse={parseIntInRange(500, 10000)}
                  hint="500–10000 ms"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Plot defaults</h3>
          <p className={styles.sectionNote}>
            Applied to a Plot Pane when it opens — a Plot Pane already open keeps what it has.
          </p>
          <div className={styles.fields}>
            <div className={styles.pair}>
              <NumericInput
                label="Poll interval"
                value={settings.plotDefaults.pollInterval}
                onCommit={pollInterval => setPlotDefault('pollInterval', pollInterval)}
                parse={parseIntInRange(50, 10000)}
                hint="50–10000 ms"
              />
              <NumericInput
                label="Time span"
                value={settings.plotDefaults.timeSpan}
                onCommit={timeSpan => setPlotDefault('timeSpan', timeSpan)}
                parse={parseIntInRange(5, settings.plotDefaults.maxTimeSpan)}
                hint={`5–${settings.plotDefaults.maxTimeSpan}s`}
              />
            </div>
            <NumericInput
              label="Maximum time span"
              value={settings.plotDefaults.maxTimeSpan}
              onCommit={maxTimeSpan => setPlotDefault('maxTimeSpan', maxTimeSpan)}
              parse={parseIntInRange(60, 86400)}
              hint="60–86400s — how far a Plot Pane's own span may be widened"
            />
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Activity Log</h3>
          <p className={styles.sectionNote}>
            Which categories are recorded. Disabling a verbose one reduces memory and processing.
          </p>
          <div className={styles.fields}>
            <SwitchRow
              checked={settings.logSettings.enableConnectionLogs}
              onCheckedChange={enableConnectionLogs => setLogSetting('enableConnectionLogs', enableConnectionLogs)}
            >
              Connection and link state
            </SwitchRow>
            <SwitchRow
              checked={settings.logSettings.enableRegisterLogs}
              onCheckedChange={enableRegisterLogs => setLogSetting('enableRegisterLogs', enableRegisterLogs)}
            >
              Register reads and writes
            </SwitchRow>
            <SwitchRow
              checked={settings.logSettings.enableParameterLogs}
              onCheckedChange={enableParameterLogs => setLogSetting('enableParameterLogs', enableParameterLogs)}
            >
              Parameter reads and writes
            </SwitchRow>
            <SwitchRow
              checked={settings.logSettings.enablePacketLogs}
              onCheckedChange={enablePacketLogs => setLogSetting('enablePacketLogs', enablePacketLogs)}
            >
              Packet traffic — hex dumps, very verbose
            </SwitchRow>
            <SwitchRow
              checked={settings.logSettings.enableAutoRefreshLogs}
              onCheckedChange={enableAutoRefreshLogs => setLogSetting('enableAutoRefreshLogs', enableAutoRefreshLogs)}
            >
              Auto-refresh polling
            </SwitchRow>
            <SwitchRow
              checked={settings.logSettings.enablePlottingLogs}
              onCheckedChange={enablePlottingLogs => setLogSetting('enablePlottingLogs', enablePlottingLogs)}
            >
              Plot start and stop
            </SwitchRow>
            <NumericInput
              label="Retained entries"
              value={settings.logSettings.maxLogCount}
              onCommit={maxLogCount => setLogSetting('maxLogCount', maxLogCount)}
              parse={parseIntInRange(100, 10000)}
              hint="100–10000 entries"
            />
          </div>
        </section>
      </div>
    </Dialog>
  );
}
