import { Button, Dialog } from '../ui';
import styles from './SettingsResetNoticeDialog.module.css';

export interface SettingsResetNoticeDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * False when the stored settings were corrupt or unreadable rather than
   * merely old-shaped — Profiles did not carry across either in that case,
   * and the copy below has to say so rather than reassuring someone their
   * Maps and Commands survived when they didn't.
   */
  readonly profilesCarriedOver: boolean;
  /** Opens the Profiles dialog, so "preserve your work" is one click away rather than an instruction to go find it. */
  readonly onOpenProfiles: () => void;
}

/**
 * Shown once, the first time this build loads a settings blob saved before
 * schema versioning existed (ticket 21).
 *
 * The ordinary case is `profilesCarriedOver`: Profiles carry across
 * untouched; everything else that reset — Dashboards, Workspaces, layouts
 * and preferences — is named here explicitly so an Engineer opening the
 * rebuilt application to find their Dashboards gone reads it as intended,
 * not as data loss. A stored blob can also be corrupt rather than merely
 * old-shaped, though — nothing recoverable, Profiles included — and that is
 * a different, honest thing to say than "your Profiles are safe."
 */
export function SettingsResetNoticeDialog({
  open,
  onOpenChange,
  profilesCarriedOver,
  onOpenProfiles,
}: SettingsResetNoticeDialogProps): React.JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="This is the rebuilt interface"
      description={
        profilesCarriedOver
          ? 'Dashboards, Workspaces, layouts and preferences were reset. Profiles were not.'
          : 'The stored settings could not be read, so everything reset — Profiles included.'
      }
      footer={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            onOpenChange(false);
            onOpenProfiles();
          }}
        >
          Open Profiles
        </Button>
      }
    >
      <div className={styles.body}>
        {profilesCarriedOver ? (
          <>
            <p className={styles.paragraph}>
              Your Profiles — Maps, per-entry descriptions and units, and Command catalogues — carried across
              untouched. Nothing there needs re-entering.
            </p>
            <p className={styles.paragraph}>
              Dashboards, Workspaces, layouts and preferences reset to defaults. The old settings shape had no
              version to migrate them from safely, so this rebuild starts them fresh rather than guessing at what
              they meant.
            </p>
          </>
        ) : (
          <p className={styles.paragraph}>
            The previous settings were damaged or unreadable — this can happen after a truncated write, or storage
            edited by hand — so nothing could be carried forward, including Profiles. If you have a Profile exported
            as a file from before, import it from the Profiles dialog to restore your Maps, metadata and Commands.
          </p>
        )}
        <p className={styles.paragraph}>
          To protect against a reset like this one in future, export your Profile as a file from the Profiles
          dialog — it carries your Maps, metadata and Commands.
        </p>
      </div>
    </Dialog>
  );
}
