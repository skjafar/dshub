import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Chip,
  Stack,
  Menu,
  MenuItem,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Tooltip
} from '@mui/material';
import {
  Download as DownloadIcon,
  Delete as DeleteIcon,
  CheckCircle as ActiveIcon,
  RadioButtonUnchecked as InactiveIcon,
  MoreVert as MoreIcon,
  Add as AddIcon,
  Upload as ImportIcon,
  FileUpload as ExportIcon,
  WarningAmber as WarningIcon,
  ErrorOutline as ErrorIcon
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastNotification';
import { useDSHub } from '../contexts/DSHubContext';
import { DEFAULT_PROFILE_ID, CNC_PROFILE_ID } from '../types/settings';
import type { ProfileImportError } from '../utils/profileFileFormat';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface MapProfilesPanelRef {
  openCreate: () => void;
  openImport: () => void;
}

// ---- Import error dialog ----

interface ImportErrorDialogProps {
  open: boolean;
  errors: ProfileImportError[];
  profileName: string;
  hasFatal: boolean;
  onImportAnyway: () => void;
  onClose: () => void;
}

function ImportErrorDialog({ open, errors, profileName, hasFatal, onImportAnyway, onClose }: ImportErrorDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {hasFatal ? <ErrorIcon color="error" /> : <WarningIcon color="warning" />}
        {hasFatal ? 'Profile Import Failed' : 'Import Warnings'}
      </DialogTitle>
      <DialogContent>
        {!hasFatal && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            The profile "{profileName}" has non-critical issues. You can still import it — problematic lines will be skipped.
          </Alert>
        )}
        {hasFatal && (
          <Alert severity="error" sx={{ mb: 2 }}>
            The file cannot be imported due to the following errors.
          </Alert>
        )}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Section</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Line</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Message</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Severity</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {errors.map((err, i) => (
              <TableRow key={i}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{err.section}</TableCell>
                <TableCell>{err.line ?? '—'}</TableCell>
                <TableCell>{err.message}</TableCell>
                <TableCell>
                  <Chip
                    label={err.fatal ? 'Fatal' : 'Warning'}
                    size="small"
                    color={err.fatal ? 'error' : 'warning'}
                    variant="outlined"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{hasFatal ? 'Close' : 'Cancel'}</Button>
        {!hasFatal && (
          <Button onClick={onImportAnyway} variant="contained" color="warning">
            Import Anyway
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ---- Main panel ----

const MapProfilesPanel = forwardRef<MapProfilesPanelRef>(function MapProfilesPanel(_, ref) {
  const {
    settings,
    getAllProfiles,
    createProfile,
    deleteProfile,
    activateProfile,
    exportProfile,
    importProfile,
  } = useSettings();
  const { showSuccess, showError, showWarning } = useToast();
  const { state } = useDSHub();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Import state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [pendingImportJson, setPendingImportJson] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<ProfileImportError[]>([]);
  const [importProfileName, setImportProfileName] = useState('');
  const [importErrorDialogOpen, setImportErrorDialogOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openCreate: () => setCreateDialogOpen(true),
    openImport: () => importInputRef.current?.click(),
  }));

  const profiles = getAllProfiles();

  // ---- Create profile (name only) ----

  const handleCreateProfile = () => {
    const name = profileName.trim();
    if (!name) {
      showError('Profile name cannot be empty');
      return;
    }
    const profileId = createProfile(name, '', '', undefined);
    showSuccess(`Profile "${name}" created — open Map Editor to set up maps`);
    setCreateDialogOpen(false);
    setProfileName('');
    activateProfile(profileId);
  };

  // ---- Activate / delete ----

  const handleActivateProfile = (profileId: string) => {
    const success = activateProfile(profileId);
    if (success) {
      showSuccess('Profile activated');
      if (state.connection?.connected) {
        showWarning('Maps updated — reconnect to apply changes');
      }
    } else {
      showError('Failed to activate profile');
    }
    setAnchorEl(null);
  };

  const handleDeleteProfile = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    if (window.confirm(`Delete profile "${profile.name}"? This cannot be undone.`)) {
      const success = deleteProfile(profileId);
      if (success) showSuccess('Profile deleted');
      else showError('Cannot delete built-in profile');
    }
    setAnchorEl(null);
  };

  // ---- Export profile ----

  const handleExportProfile = async (profileId: string) => {
    setAnchorEl(null);
    const json = exportProfile(profileId);
    if (!json) {
      showError('Failed to export profile');
      return;
    }
    const profile = profiles.find(p => p.id === profileId);
    const safeName = (profile?.name ?? 'profile').replace(/[^a-z0-9_\-]/gi, '_');
    try {
      const saved = await invoke<boolean>('save_text_file', {
        content: json,
        suggestedName: `${safeName}.dshub`,
        filterName: 'DSHub Profile',
        filterExt: 'dshub',
      });
      if (saved) showSuccess('Profile exported');
    } catch (e) {
      showError(`Export failed: ${String(e)}`);
    }
  };

  // ---- Import profile ----

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = '';

    if (file.size > MAX_FILE_SIZE) {
      showError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const json = ev.target?.result as string;
      // Validate before committing
      const result = importProfile(json); // dry-run via parseProfileFile internally — we call importProfile directly
      // importProfile both validates AND creates the profile if valid — we need to handle the two paths:
      // If fatal errors: just show dialog, profile was NOT created (importProfile skips creation on fatal)
      // If no errors: profile already created
      if (result.errors.length === 0) {
        showSuccess(`Profile "${result.file?.name ?? 'imported'}" imported successfully`);
        return;
      }
      const hasFatal = result.errors.some(e => e.fatal);
      if (!hasFatal && result.profileId) {
        // Profile was created but with warnings — show dialog so user is aware
        setImportErrors(result.errors);
        setImportProfileName(result.file?.name ?? '');
        setImportErrorDialogOpen(true);
        showSuccess(`Profile "${result.file?.name ?? 'imported'}" imported with warnings`);
        return;
      }
      // Fatal — profile not created, save json for "import anyway" (not applicable for fatal, but store anyway)
      setPendingImportJson(json);
      setImportErrors(result.errors);
      setImportProfileName(result.file?.name ?? '');
      setImportErrorDialogOpen(true);
    };
    reader.readAsText(file);
  };

  const handleImportAnyway = () => {
    // Already imported successfully (warnings only case handled above)
    setImportErrorDialogOpen(false);
    setPendingImportJson(null);
  };

  const handleImportErrorClose = () => {
    setImportErrorDialogOpen(false);
    setPendingImportJson(null);
  };

  // ---- Menu ----

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, profileId: string) => {
    setAnchorEl(event.currentTarget);
    setSelectedProfileId(profileId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedProfileId(null);
  };

  const isBuiltIn = (profileId: string) =>
    profileId === DEFAULT_PROFILE_ID || profileId === CNC_PROFILE_ID;

  return (
    <Card>
      <CardContent>
        <input
          type="file"
          accept=".dshub,.json"
          ref={importInputRef}
          onChange={handleImportFileChange}
          style={{ display: 'none' }}
        />

        <Typography variant="h6" sx={{ mb: 2 }}>Profiles</Typography>

        <List disablePadding>
          {profiles
            .slice()
            .sort((a, b) => {
              if (a.id === DEFAULT_PROFILE_ID) return -1;
              if (b.id === DEFAULT_PROFILE_ID) return 1;
              return (b.lastUsed ?? b.createdAt) - (a.lastUsed ?? a.createdAt);
            })
            .map((profile) => {
              const isActive = profile.id === settings.activeMapProfileId;
              const isDefault = isBuiltIn(profile.id);

              return (
                <ListItem
                  key={profile.id}
                  sx={{
                    border: isActive ? 2 : 1,
                    borderColor: isActive ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    mb: 1,
                    bgcolor: isActive ? 'action.selected' : 'background.paper',
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {isActive ? (
                          <ActiveIcon color="primary" fontSize="small" />
                        ) : (
                          <InactiveIcon color="disabled" fontSize="small" />
                        )}
                        <Typography variant="subtitle1">{profile.name}</Typography>
                        {isActive && <Chip label="Active" size="small" color="primary" />}
                        {isDefault && <Chip label="Built-in" size="small" variant="outlined" />}
                      </Box>
                    }
                    secondary={
                      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                        {!isDefault && profile.createdAt > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            Created: {new Date(profile.createdAt).toLocaleString()}
                          </Typography>
                        )}
                        {profile.lastUsed && (
                          <Typography variant="caption" color="text.secondary">
                            Last used: {new Date(profile.lastUsed).toLocaleString()}
                          </Typography>
                        )}
                      </Stack>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {!isActive ? (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleActivateProfile(profile.id)}
                        >
                          Activate
                        </Button>
                      ) : (
                        <Chip label="In Use" size="small" color="success" />
                      )}
                      <IconButton edge="end" onClick={(e) => handleMenuOpen(e, profile.id)}>
                        <MoreIcon />
                      </IconButton>
                    </Stack>
                  </ListItemSecondaryAction>
                </ListItem>
              );
            })}
        </List>

        {/* Context menu */}
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
          <MenuItem onClick={() => selectedProfileId && handleExportProfile(selectedProfileId)}>
            <ExportIcon fontSize="small" sx={{ mr: 1 }} />
            Export Profile
          </MenuItem>
          {selectedProfileId && !isBuiltIn(selectedProfileId) && (
            <MenuItem
              onClick={() => selectedProfileId && handleDeleteProfile(selectedProfileId)}
              sx={{ color: 'error.main' }}
            >
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
              Delete
            </MenuItem>
          )}
        </Menu>

        {/* Create profile dialog */}
        <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>New Profile</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Profile Name"
              fullWidth
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProfile()}
              placeholder="e.g., Production Config"
            />
            <Alert severity="info" sx={{ mt: 2 }}>
              The profile will start with empty maps. Open Map Editor to configure registers, parameters, and SYS_COMMANDs.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateProfile} variant="contained">Create</Button>
          </DialogActions>
        </Dialog>

        {/* Import error/warning dialog */}
        <ImportErrorDialog
          open={importErrorDialogOpen}
          errors={importErrors}
          profileName={importProfileName}
          hasFatal={importErrors.some(e => e.fatal)}
          onImportAnyway={handleImportAnyway}
          onClose={handleImportErrorClose}
        />

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            Profiles store registers, parameters, SYS_COMMANDs, metadata, and dashboard layout in a single{' '}
            <strong>.dshub</strong> file. Use <em>Export Profile</em> to share a profile with other users,
            and <em>Import</em> to load a profile from a .dshub file.
            {state.connection?.connected && ' Profile changes require reconnection to apply.'}
          </Typography>
        </Alert>
      </CardContent>
    </Card>
  );
});

export default MapProfilesPanel;
