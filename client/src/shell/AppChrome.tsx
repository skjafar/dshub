import { useState } from 'react';
import {
  AppWindow,
  BookOpen,
  Check,
  Gear,
  Info,
  Moon,
  PencilSimple,
  Plugs,
  PlugsConnected,
  Stack,
  Sun,
  SquaresFour,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { APP_THEMES, getThemeById } from '../appThemes';
import { ControlBadge, LinkStatus } from './LinkStatus';
import { holdsControl } from './linkState';
import { Button, Menu, Popover, TextField, Tooltip } from '../ui';
import type { PaneMenuEntry } from './daughterWindows';
import { PaneMenuItems } from './PaneMenuItems';
import type { PaneKind } from './paneRegistry';
import { AboutDialog } from './AboutDialog';
import { ConnectDialog } from './ConnectDialog';
import { GuideDialog } from './GuideDialog';
import { ProfilesDialog } from './ProfilesDialog';
import { SettingsDialog } from './SettingsDialog';
import { SettingsResetNoticeDialog } from './SettingsResetNoticeDialog';
import { WorkspacesDialog } from './WorkspacesDialog';
import type { StoredWorkspace } from './workspaceStore';
import styles from './AppChrome.module.css';

/** One open Daughter Window, as the Main Window's own list needs it. */
export interface DaughterWindowSummary {
  readonly id: string;
  /** The window's current display label — a user-set custom name if it has one, otherwise auto-derived from its open Panes, otherwise a positional fallback (`daughterWindows.ts`'s `windowLabel`). */
  readonly label: string;
  /** Whether `label` above is the user-set custom name — decides whether the rename field starts pre-filled with it (edit what is actually there) or blank (type a new one, rather than freezing an auto-derived label that was never meant to be literal). */
  readonly isCustomName: boolean;
}

export interface AppChromeProps {
  /** What the Panes menu offers — resolved by the shell, since it needs the live dock api to know where an already-open singleton actually is. */
  readonly paneMenuEntries: readonly PaneMenuEntry[];
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
   * Called before any Profiles-dialog action that may change the active
   * Profile, so the outgoing one's Workspace is saved with what it actually
   * shows before the switch. See `ProfilesDialog`'s own doc comment.
   */
  readonly onBeforeProfileChange: () => void;
  /** The Workspace's currently open Daughter Windows, so a window buried behind another application is still reachable (spec.md). */
  readonly daughterWindows: readonly DaughterWindowSummary[];
  readonly onFocusDaughterWindow: (id: string) => void;
  readonly onCloseDaughterWindow: (id: string) => void;
  /** Sets (a non-blank name) or clears (a blank one) a Daughter Window's own custom name (`.scratch/daughter-windows-native` issue 07's own naming follow-up). */
  readonly onRenameDaughterWindow: (id: string, name: string) => void;
}

/** A row's own interaction state — renaming or not, mirroring `WorkspacesDialog.tsx`'s own `WorkspaceRow` pattern (minus an armed-delete state: closing a Daughter Window needs no confirmation). */
type WindowRowMode = { readonly kind: 'view' } | { readonly kind: 'editing'; readonly draft: string };
const WINDOW_VIEW_MODE: WindowRowMode = { kind: 'view' };

interface DaughterWindowRowProps {
  readonly window: DaughterWindowSummary;
  readonly onFocus: () => void;
  readonly onClose: () => void;
  readonly onRename: (name: string) => void;
}

/**
 * One row of the "Daughter Windows" popover — its own name (click to
 * focus), a rename action, and close. The rename field starts pre-filled
 * with the current custom name if there is one, or blank — with the
 * currently-shown auto-derived label only as a `placeholder` hint — if
 * there is not, since committing that derived text literally would freeze
 * it in place rather than let it keep following what that Window has open.
 * Saving a blank value clears any custom name, reverting to the
 * auto-derived label again.
 */
function DaughterWindowRow({ window: win, onFocus, onClose, onRename }: DaughterWindowRowProps): React.JSX.Element {
  const [mode, setMode] = useState<WindowRowMode>(WINDOW_VIEW_MODE);

  const commitRename = (draft: string): void => {
    onRename(draft.trim());
    setMode(WINDOW_VIEW_MODE);
  };

  if (mode.kind === 'editing') {
    return (
      <div className={styles.windowRow}>
        <TextField
          aria-label={`Rename ${win.label}`}
          autoFocus
          placeholder={win.label}
          value={mode.draft}
          onChange={e => setMode({ kind: 'editing', draft: e.target.value })}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename(mode.draft);
            if (e.key === 'Escape') setMode(WINDOW_VIEW_MODE);
          }}
        />
        <Button variant="ghost" size="sm" aria-label="Save name" onClick={() => commitRename(mode.draft)}>
          <Check size={14} weight="bold" />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Cancel rename" onClick={() => setMode(WINDOW_VIEW_MODE)}>
          <X size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.windowRow}>
      <Button variant="ghost" size="sm" onClick={onFocus}>
        {win.label}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Rename ${win.label}`}
        onClick={() => setMode({ kind: 'editing', draft: win.isCustomName ? win.label : '' })}
      >
        <PencilSimple size={14} />
      </Button>
      <Button variant="ghost" size="sm" aria-label={`Close ${win.label}`} onClick={onClose}>
        <X size={14} />
      </Button>
    </div>
  );
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
  paneMenuEntries,
  onOpenPane,
  workspaces,
  activeWorkspaceId,
  defaultWorkspaceId,
  onSwitchWorkspace,
  onSaveWorkspaceAs,
  onRenameWorkspace,
  onDeleteWorkspace,
  onBeforeProfileChange,
  daughterWindows,
  onFocusDaughterWindow,
  onCloseDaughterWindow,
  onRenameDaughterWindow,
}: AppChromeProps): React.JSX.Element {
  const { state, actions } = useDSHub();
  const { settings, updateSettings, justMigrated, profilesCarriedOver } = useSettings();
  const [connectOpen, setConnectOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  // Seeded from `justMigrated`, which is fixed for the session — closing this
  // once is enough, it never needs to reopen on its own.
  const [resetNoticeOpen, setResetNoticeOpen] = useState(justMigrated);

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
                <span className={styles.countBadge} aria-hidden>
                  {state.unreadLogCount > 99 ? '99+' : state.unreadLogCount}
                </span>
              ) : null}
            </Button>
          }
        >
          <PaneMenuItems entries={paneMenuEntries} onOpenPane={onOpenPane} />
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

        {daughterWindows.length > 0 ? (
          <Popover
            trigger={
              <Button variant="ghost" size="sm" aria-label="Daughter Windows">
                <AppWindow size={16} />
                Windows
                <span className={styles.countBadge} aria-hidden>
                  {daughterWindows.length}
                </span>
              </Button>
            }
          >
            <div className={styles.windowList}>
              {daughterWindows.map(win => (
                <DaughterWindowRow
                  key={win.id}
                  window={win}
                  onFocus={() => onFocusDaughterWindow(win.id)}
                  onClose={() => onCloseDaughterWindow(win.id)}
                  onRename={name => onRenameDaughterWindow(win.id, name)}
                />
              ))}
            </div>
          </Popover>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          aria-label="Profiles"
          onClick={() => setProfilesOpen(true)}
        >
          <UsersThree size={16} />
          Profiles
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
      <SettingsResetNoticeDialog
        open={resetNoticeOpen}
        onOpenChange={setResetNoticeOpen}
        profilesCarriedOver={profilesCarriedOver}
        onOpenProfiles={() => setProfilesOpen(true)}
      />
    </header>
  );
}
