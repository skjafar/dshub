import { useState } from 'react';
import {
  ArrowsOut,
  BookOpen,
  Gear,
  Info,
  Moon,
  Plugs,
  PlugsConnected,
  Stack,
  Sun,
  SquaresFour,
  UsersThree,
} from '@phosphor-icons/react';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { APP_THEMES, getThemeById } from '../appThemes';
import { ControlBadge, LinkStatus } from './LinkStatus';
import { holdsControl } from './linkState';
import { Button, Menu, MenuItem, MenuLabel, Tooltip } from '../ui';
import { PANES } from './paneRegistry';
import type { PaneKind } from './paneRegistry';
import { AboutDialog } from './AboutDialog';
import { ConnectDialog } from './ConnectDialog';
import { GuideDialog } from './GuideDialog';
import { ProfilesDialog } from './ProfilesDialog';
import { SettingsDialog } from './SettingsDialog';
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
  /**
   * The Dashboard Focus Mode would open on right now — the Profile's
   * remembered one if it still exists, else its first Dashboard — or null
   * when the Profile has none at all. Resolved by the shell rather than
   * here, since it needs `dashboardsByProfile`, which nothing else in the
   * chrome reads.
   */
  readonly focusTargetDashboardId: string | null;
  readonly onEnterFocusMode: (dashboardId: string) => void;
  /**
   * Called before any Profiles-dialog action that may change the active
   * Profile, so the outgoing one's Workspace is saved with what it actually
   * shows before the switch. See `ProfilesDialog`'s own doc comment.
   */
  readonly onBeforeProfileChange: () => void;
}

/** What the Panes trigger says, so the unread badge it carries is announced too. */
function panesButtonLabel(unreadLogCount: number): string {
  if (unreadLogCount === 0) return 'Panes';
  const entries = unreadLogCount === 1 ? 'entry' : 'entries';
  return `Panes — ${unreadLogCount} unread activity log ${entries}`;
}

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
  focusTargetDashboardId,
  onEnterFocusMode,
  onBeforeProfileChange,
}: AppChromeProps): React.JSX.Element {
  const { state, actions } = useDSHub();
  const { settings, updateSettings } = useSettings();
  const [connectOpen, setConnectOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const connected = state.connection?.connected ?? false;

  const activeTheme = getThemeById(settings.colorThemeId);
  const nextTheme =
    APP_THEMES.find(t => t.mode !== activeTheme.mode) ?? activeTheme;

  return (
    <header className={styles.chrome}>
      <span className={styles.brand}>DSHUB</span>

      <LinkStatus />
      <ControlBadge />

      {connected && !holdsControl(state.connection) ? (
        <Button variant="primary" size="sm" onClick={() => actions.takeControl()}>
          Take Control
        </Button>
      ) : null}

      <span className={styles.spacer} />

      <div className={styles.group}>
        <Menu
          align="end"
          trigger={
            <Button variant="ghost" size="sm" aria-label={panesButtonLabel(state.unreadLogCount)}>
              <SquaresFour size={16} />
              Panes
              {state.unreadLogCount > 0 ? (
                <span className={styles.unreadBadge} aria-hidden>
                  {state.unreadLogCount > 99 ? '99+' : state.unreadLogCount}
                </span>
              ) : null}
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

        <Button
          variant="ghost"
          size="sm"
          aria-label="Profiles"
          onClick={() => setProfilesOpen(true)}
        >
          <UsersThree size={16} />
          Profiles
        </Button>

        <Tooltip content={focusTargetDashboardId === null ? 'No Dashboards yet' : 'Show a Dashboard full-canvas, layout locked'}>
          <span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Focus Mode"
              disabled={focusTargetDashboardId === null}
              onClick={() => {
                if (focusTargetDashboardId !== null) onEnterFocusMode(focusTargetDashboardId);
              }}
            >
              <ArrowsOut size={16} />
              Focus Mode
            </Button>
          </span>
        </Tooltip>

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

        <Button variant="ghost" size="sm" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <Gear size={16} />
        </Button>

        <Button variant="ghost" size="sm" aria-label="About" onClick={() => setAboutOpen(true)}>
          <Info size={16} />
        </Button>

        <Button variant="ghost" size="sm" aria-label="Guide" onClick={() => setGuideOpen(true)}>
          <BookOpen size={16} />
        </Button>

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
      <ProfilesDialog open={profilesOpen} onOpenChange={setProfilesOpen} onBeforeProfileChange={onBeforeProfileChange} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} onOpenGuide={() => setGuideOpen(true)} />
      <GuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </header>
  );
}
