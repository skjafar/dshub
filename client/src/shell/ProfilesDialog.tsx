import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, DownloadSimple, Plus, TrashSimple, UploadSimple } from '@phosphor-icons/react';
import { useBackendPort } from '../contexts/BackendPortContext';
import { useSettings } from '../contexts/SettingsContext';
import { CNC_PROFILE_ID, DEFAULT_PROFILE_ID } from '../types/settings';
import type { MapProfile } from '../types/settings';
import type { ProfileImportError } from '../utils/profileFileFormat';
import { Button, Dialog, TextField, cx } from '../ui';
import styles from './ProfilesDialog.module.css';

export interface ProfilesDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Called before any action here that may change the active Profile — switch,
   * create, delete-of-the-active-one, or a clean import, all of which
   * `SettingsContext` may flip `activeMapProfileId` from underneath. The active
   * Workspace has to be saved with what it actually shows *before* that
   * happens, the same reasoning `enterFocusMode` documents for unmounting the
   * Workspace: once the Profile changes, the Panes reading the old one are gone.
   */
  readonly onBeforeProfileChange: () => void;
}

/** How long an armed delete stays armed before it resets, in case blur never fires. Matches `WorkspacesDialog`. */
const DELETE_ARM_TIMEOUT_MS = 3000;

function isBuiltIn(profileId: string): boolean {
  return profileId === DEFAULT_PROFILE_ID || profileId === CNC_PROFILE_ID;
}

interface ProfileRowProps {
  readonly profile: MapProfile;
  readonly active: boolean;
  readonly onSwitch: () => void;
  readonly onExport: () => void;
  readonly onDelete: () => void;
}

function ProfileRow({ profile, active, onSwitch, onExport, onDelete }: ProfileRowProps): React.JSX.Element {
  const builtIn = isBuiltIn(profile.id);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), DELETE_ARM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={cx(styles.name, active && styles.active)}
        onClick={onSwitch}
        disabled={active}
      >
        <span className={styles.activeMark}>{active ? <Check size={14} weight="bold" /> : null}</span>
        <span className={styles.nameText}>{profile.name}</span>
        {builtIn ? <span className={styles.tag}>Built-in</span> : null}
      </button>
      <Button variant="ghost" size="sm" aria-label={`Export ${profile.name}`} onClick={onExport}>
        <DownloadSimple size={14} />
      </Button>
      <Button
        variant={armed ? 'danger' : 'ghost'}
        size="sm"
        aria-label={armed ? `Confirm deleting ${profile.name}` : `Delete ${profile.name}`}
        disabled={builtIn}
        onClick={() => (armed ? onDelete() : setArmed(true))}
        onBlur={() => setArmed(false)}
      >
        <TrashSimple size={14} />
        {armed ? 'Confirm?' : null}
      </Button>
    </div>
  );
}

/**
 * Creating, switching, importing and exporting Profiles.
 *
 * A dialog rather than a Pane: these are configuration tasks for the whole
 * application, not a working tool docked beside others — the same distinction
 * that keeps connecting in the chrome instead of a Pane of its own. Built-in
 * Profiles (Default, the CNC demo) can be exported and switched to like any
 * other, but never deleted, and their Map is edited nowhere in this build.
 */
export function ProfilesDialog({ open, onOpenChange, onBeforeProfileChange }: ProfilesDialogProps): React.JSX.Element {
  const { settings, getAllProfiles, createProfile, activateProfile, deleteProfile, exportProfile, importProfile } =
    useSettings();
  const port = useBackendPort();
  const [newName, setNewName] = useState('');
  const [importErrors, setImportErrors] = useState<readonly ProfileImportError[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * A Profile just created, waiting to be activated once it actually appears
   * in `settings.mapProfiles`.
   *
   * `createProfile` only queues its `setSettings` call — it does not update
   * `settings` in place — so calling `activateProfile` synchronously right
   * after would have it read the *pre-create* `mapProfiles` array, fail its
   * own existence check silently, and activate nothing. Waiting for the next
   * render where the new Profile is actually present sidesteps the race
   * rather than reproducing it.
   */
  const [pendingActivation, setPendingActivation] = useState<string | null>(null);

  useEffect(() => {
    if (pendingActivation === null) return;
    if (!settings.mapProfiles.some(p => p.id === pendingActivation)) return;
    activateProfile(pendingActivation);
    setPendingActivation(null);
    onOpenChange(false);
  }, [pendingActivation, settings.mapProfiles, activateProfile, onOpenChange]);

  // Starts blank every time the dialog opens, matching `WorkspacesDialog`: a
  // name typed and abandoned last time, or an old import's error banner,
  // must never resurface unrelated to what is being done this time.
  useEffect(() => {
    if (open) {
      setNewName('');
      setImportErrors(null);
    }
  }, [open]);

  const profiles = useMemo(() => {
    const all = getAllProfiles();
    const builtIn = all.filter(p => isBuiltIn(p.id));
    const custom = all
      .filter(p => !isBuiltIn(p.id))
      .slice()
      .sort((a, b) => (b.lastUsed ?? b.createdAt) - (a.lastUsed ?? a.createdAt));
    return [...builtIn, ...custom];
  }, [getAllProfiles]);

  const handleCreate = (): void => {
    const trimmed = newName.trim();
    if (trimmed === '') return;
    onBeforeProfileChange();
    setPendingActivation(createProfile(trimmed, '', ''));
    setNewName('');
  };

  const handleSwitch = (id: string): void => {
    if (id === settings.activeMapProfileId) return;
    onBeforeProfileChange();
    activateProfile(id);
    onOpenChange(false);
  };

  const handleDelete = (id: string): void => {
    // Deleting the active Profile falls back to the default one
    // (`SettingsContext.deleteProfile`), which is itself a Profile switch.
    onBeforeProfileChange();
    deleteProfile(id);
  };

  const handleExport = (profile: MapProfile): void => {
    const json = exportProfile(profile.id);
    if (json === null) return;
    const safeName = profile.name.replace(/[^a-z0-9_-]/gi, '_') || 'profile';
    void port.files.saveText({
      content: json,
      suggestedName: `${safeName}.dshub`,
      filterName: 'DSHub Profile',
      filterExt: 'dshub',
    });
  };

  const handleImportFile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = event => {
      const json = event.target?.result;
      if (typeof json !== 'string') return;
      onBeforeProfileChange();
      const result = importProfile(json);
      if (result.errors.length === 0) {
        onOpenChange(false);
        return;
      }
      // A fatal error means `importProfile` created nothing and the active
      // Profile did not change; a non-fatal one still imported and activated,
      // with the warnings shown so the gap between what was asked for and what
      // was actually loaded is never silent.
      setImportErrors(result.errors);
    };
    reader.readAsText(file);
  };

  const hasFatal = importErrors?.some(e => e.fatal) ?? false;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Profiles"
      description="A Profile carries the Maps, Commands, Dashboards and Workspaces for one Device. Switching re-skins the application for it."
    >
      <div className={styles.body}>
        <div className={styles.createRow}>
          <TextField
            label="New Profile"
            placeholder="e.g. Production Config"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
          <Button variant="primary" onClick={handleCreate} disabled={newName.trim() === ''}>
            <Plus size={14} /> Create
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <UploadSimple size={14} /> Import…
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dshub,.json"
            className={styles.hiddenInput}
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) handleImportFile(file);
            }}
          />
        </div>

        {importErrors !== null ? (
          <div className={cx(styles.importNotice, hasFatal && styles.importNoticeFatal)} role="alert">
            <p className={styles.importHeading}>{hasFatal ? 'Import failed' : 'Imported with warnings'}</p>
            <ul className={styles.importList}>
              {importErrors.map((err, index) => (
                <li key={index}>
                  {err.section}
                  {err.line !== undefined ? ` (line ${err.line})` : ''}: {err.message}
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" onClick={() => setImportErrors(null)}>
              Dismiss
            </Button>
          </div>
        ) : null}

        <div className={styles.list}>
          {profiles.map(profile => (
            <ProfileRow
              key={profile.id}
              profile={profile}
              active={profile.id === settings.activeMapProfileId}
              onSwitch={() => handleSwitch(profile.id)}
              onExport={() => handleExport(profile)}
              onDelete={() => handleDelete(profile.id)}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
