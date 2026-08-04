import { useState } from 'react';
import { Moon, Plugs, PlugsConnected, Stack, Sun, SquaresFour } from '@phosphor-icons/react';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { APP_THEMES, getThemeById } from '../appThemes';
import { controlHolderOf, controlLabel, linkStateOf } from './linkState';
import type { LinkState } from './linkState';
import { Button, Menu, MenuItem, MenuLabel, Tooltip, cx } from '../ui';
import { PANES } from './paneRegistry';
import type { PaneKind } from './paneRegistry';
import { ConnectDialog } from './ConnectDialog';
import { WorkspacesDialog } from './WorkspacesDialog';
import type { StoredWorkspace } from './workspaceStore';
import styles from './AppChrome.module.css';

export interface AppChromeProps {
  /** Pane kinds currently open, so the menu can say which are already there. */
  readonly openKinds: readonly PaneKind[];
  readonly onOpenPane: (kind: PaneKind) => void;
  /** The active Profile's named Workspaces, for the Workspaces dialog. */
  readonly workspaces: readonly StoredWorkspace[];
  readonly activeWorkspaceId: string;
  readonly defaultWorkspaceId: string;
  readonly onSwitchWorkspace: (id: string) => void;
  readonly onSaveWorkspaceAs: (name: string) => void;
  readonly onRenameWorkspace: (id: string, name: string) => void;
  readonly onDeleteWorkspace: (id: string) => void;
}

const LED_CLASS: Readonly<Record<LinkState, string>> = {
  online: styles.ledOnline,
  connecting: styles.ledConnecting,
  reconnecting: styles.ledReconnecting,
  disconnected: styles.ledDown,
  'no device': '',
};

const LINK_LABEL: Readonly<Record<LinkState, string>> = {
  online: 'Online',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  disconnected: 'Offline',
  'no device': 'No device',
};

/**
 * The application chrome.
 *
 * Carries what is true regardless of which Pane is focused: which Device this
 * is, whether the link is live, and who holds Control. Those three never move
 * into a Pane, because an Operator has to be able to answer "is what I am
 * looking at current?" without first finding the right surface.
 *
 * Connecting lives here rather than in a Pane of its own. It was a destination
 * in the old interface, which meant a permanent slot in the navigation for
 * something nobody returns to once they are connected.
 */
export function AppChrome({
  openKinds,
  onOpenPane,
  workspaces,
  activeWorkspaceId,
  defaultWorkspaceId,
  onSwitchWorkspace,
  onSaveWorkspaceAs,
  onRenameWorkspace,
  onDeleteWorkspace,
}: AppChromeProps): React.JSX.Element {
  const { state, actions } = useDSHub();
  const { settings, updateSettings } = useSettings();
  const [connectOpen, setConnectOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);

  const link = linkStateOf(state.connection, state.connecting);
  const control = controlHolderOf(state.connection);
  const connected = state.connection?.connected ?? false;

  const activeTheme = getThemeById(settings.colorThemeId);
  const nextTheme =
    APP_THEMES.find(t => t.mode !== activeTheme.mode) ?? activeTheme;

  return (
    <header className={styles.chrome}>
      <span className={styles.brand}>DSHUB</span>

      <div className={styles.link} role="status" aria-label="Device link">
        <span className={cx(styles.led, LED_CLASS[link])} aria-hidden />
        {/* The state is always shown, never replaced by the Device's name. A
            drop that is signalled only by an LED colour is a drop an Operator
            can look straight at and miss. */}
        <span className={cx(styles.linkLabel, link !== 'online' && styles.linkLabelAlert)}>
          {LINK_LABEL[link]}
        </span>
        {state.connection ? (
          <>
            <span className={styles.deviceName}>{state.connection.deviceName}</span>
            <span className={styles.address}>
              {state.connection.ip}:{state.connection.port}
            </span>
          </>
        ) : null}
      </div>

      <span
        className={cx(
          styles.control,
          control.kind === 'ours' && styles.controlHeld,
          control.kind === 'elsewhere' && styles.controlElsewhere
        )}
      >
        {controlLabel(control)}
      </span>

      {connected && control.kind !== 'ours' ? (
        <Button variant="primary" size="sm" onClick={() => actions.takeControl()}>
          Take Control
        </Button>
      ) : null}

      <span className={styles.spacer} />

      <div className={styles.group}>
        <Menu
          align="end"
          trigger={
            <Button variant="ghost" size="sm" aria-label="Panes">
              <SquaresFour size={16} />
              Panes
            </Button>
          }
        >
          <MenuLabel>Open a pane</MenuLabel>
          {PANES.map(pane => {
            const alreadyOpen = pane.singleton && openKinds.includes(pane.kind);
            return (
              <MenuItem key={pane.kind} onSelect={() => onOpenPane(pane.kind)}>
                {pane.title}
                {alreadyOpen ? ' — already open' : ''}
              </MenuItem>
            );
          })}
        </Menu>

        <Button
          variant="ghost"
          size="sm"
          aria-label="Workspaces"
          onClick={() => setWorkspacesOpen(true)}
        >
          <Stack size={16} />
          Workspaces
        </Button>

        <Tooltip content={`Switch to ${nextTheme.name}`}>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Switch to ${nextTheme.name} theme`}
            onClick={() => updateSettings({ colorThemeId: nextTheme.id })}
          >
            {activeTheme.mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </Tooltip>

        {connected ? (
          <Button variant="secondary" size="sm" onClick={() => actions.disconnectDevice()}>
            <Plugs size={16} />
            Disconnect
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => setConnectOpen(true)}>
            <PlugsConnected size={16} />
            Connect
          </Button>
        )}
      </div>

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <WorkspacesDialog
        open={workspacesOpen}
        onOpenChange={setWorkspacesOpen}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        defaultWorkspaceId={defaultWorkspaceId}
        onSwitch={onSwitchWorkspace}
        onSaveAs={onSaveWorkspaceAs}
        onRename={onRenameWorkspace}
        onDelete={onDeleteWorkspace}
      />
    </header>
  );
}
