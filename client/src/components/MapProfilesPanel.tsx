import React, { useState, useRef } from 'react';
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
  MenuItem
} from '@mui/material';
import {
  Upload as UploadIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  CheckCircle as ActiveIcon,
  RadioButtonUnchecked as InactiveIcon,
  MoreVert as MoreIcon,
  Add as AddIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastNotification';
import { useDSHub } from '../contexts/DSHubContext';
import { DEFAULT_PROFILE_ID } from '../types/settings';

// Maximum file size for map files (10MB) - prevents OOM attacks
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

export default function MapProfilesPanel() {
  const {
    settings,
    getAllProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    activateProfile,
    downloadProfileMaps
  } = useSettings();
  const { showSuccess, showError, showWarning } = useToast();
  const { state } = useDSHub();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // File inputs
  const [registersFile, setRegistersFile] = useState<File | null>(null);
  const [parametersFile, setParametersFile] = useState<File | null>(null);
  const [boardTypesFile, setBoardTypesFile] = useState<File | null>(null);
  const [systemRegistersFile, setSystemRegistersFile] = useState<File | null>(null);
  const registersInputRef = useRef<HTMLInputElement>(null);
  const parametersInputRef = useRef<HTMLInputElement>(null);
  const boardTypesInputRef = useRef<HTMLInputElement>(null);
  const systemRegistersInputRef = useRef<HTMLInputElement>(null);

  const profiles = getAllProfiles();

  const handleCreateProfile = async () => {
    if (!profileName.trim()) {
      showError('Profile name cannot be empty');
      return;
    }

    if (!registersFile || !parametersFile) {
      showError('Both register and parameter map files are required');
      return;
    }

    try {
      // Validate file sizes to prevent OOM attacks
      if (registersFile.size > MAX_FILE_SIZE) {
        showError(`Registers map file is too large (${(registersFile.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`);
        return;
      }
      if (parametersFile.size > MAX_FILE_SIZE) {
        showError(`Parameters map file is too large (${(parametersFile.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`);
        return;
      }
      if (boardTypesFile && boardTypesFile.size > MAX_FILE_SIZE) {
        showError(`Board types map file is too large (${(boardTypesFile.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`);
        return;
      }
      if (systemRegistersFile && systemRegistersFile.size > MAX_FILE_SIZE) {
        showError(`System registers map file is too large (${(systemRegistersFile.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`);
        return;
      }

      const registersContent = await registersFile.text();
      const parametersContent = await parametersFile.text();
      const boardTypesContent = boardTypesFile ? await boardTypesFile.text() : undefined;
      const systemRegistersContent = systemRegistersFile ? await systemRegistersFile.text() : undefined;

      const profileId = createProfile(profileName, registersContent, parametersContent, undefined, boardTypesContent, systemRegistersContent);
      showSuccess(`Profile "${profileName}" created successfully`);

      setCreateDialogOpen(false);
      setProfileName('');
      setRegistersFile(null);
      setParametersFile(null);
      setBoardTypesFile(null);
      setSystemRegistersFile(null);

      // Activate the newly created profile
      handleActivateProfile(profileId);
    } catch (error) {
      showError('Failed to read map files');
    }
  };

  const handleUpdateProfile = async () => {
    if (!selectedProfileId) return;

    if (!registersFile || !parametersFile) {
      showError('Both register and parameter map files are required');
      return;
    }

    try {
      // Validate file sizes to prevent OOM attacks
      if (registersFile.size > MAX_FILE_SIZE) {
        showError(`Registers map file is too large (${(registersFile.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`);
        return;
      }
      if (parametersFile.size > MAX_FILE_SIZE) {
        showError(`Parameters map file is too large (${(parametersFile.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`);
        return;
      }
      if (boardTypesFile && boardTypesFile.size > MAX_FILE_SIZE) {
        showError(`Board types map file is too large (${(boardTypesFile.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`);
        return;
      }
      if (systemRegistersFile && systemRegistersFile.size > MAX_FILE_SIZE) {
        showError(`System registers map file is too large (${(systemRegistersFile.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`);
        return;
      }

      const registersContent = await registersFile.text();
      const parametersContent = await parametersFile.text();
      const boardTypesContent = boardTypesFile ? await boardTypesFile.text() : undefined;
      const systemRegistersContent = systemRegistersFile ? await systemRegistersFile.text() : undefined;

      const success = updateProfile(selectedProfileId, registersContent, parametersContent, undefined, boardTypesContent, systemRegistersContent);

      if (success) {
        showSuccess('Profile updated successfully');
        setEditDialogOpen(false);
        setRegistersFile(null);
        setParametersFile(null);
        setBoardTypesFile(null);
        setSystemRegistersFile(null);

        // If updating the active profile, re-activate it to refresh maps
        if (selectedProfileId === settings.activeMapProfileId) {
          handleActivateProfile(selectedProfileId);
        }
      } else {
        showError('Failed to update profile');
      }
    } catch (error) {
      showError('Failed to read map files');
    }
  };

  const handleActivateProfile = (profileId: string) => {
    const success = activateProfile(profileId);
    if (success) {
      showSuccess('Profile activated');

      // If connected, trigger map reload
      if (state.connection?.connected) {
        showWarning('Maps updated - reconnect to apply changes');
      }
    } else {
      showError('Failed to activate profile');
    }
    setAnchorEl(null);
  };

  const handleDeleteProfile = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    if (window.confirm(`Are you sure you want to delete profile "${profile.name}"?`)) {
      const success = deleteProfile(profileId);
      if (success) {
        showSuccess('Profile deleted');
      } else {
        showError('Cannot delete default profile');
      }
    }
    setAnchorEl(null);
  };

  const handleDownloadMaps = (profileId: string) => {
    const maps = downloadProfileMaps(profileId);
    if (!maps) {
      showError('Failed to download maps');
      return;
    }

    const profile = profiles.find(p => p.id === profileId);
    const baseName = profile?.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'maps';

    // Download registers map
    const registersBlob = new Blob([maps.registers], { type: 'text/plain' });
    const registersUrl = URL.createObjectURL(registersBlob);
    const registersLink = document.createElement('a');
    registersLink.href = registersUrl;
    registersLink.download = `${baseName}_registers.map`;
    document.body.appendChild(registersLink);
    registersLink.click();
    document.body.removeChild(registersLink);
    URL.revokeObjectURL(registersUrl);

    // Download parameters map
    const parametersBlob = new Blob([maps.parameters], { type: 'text/plain' });
    const parametersUrl = URL.createObjectURL(parametersBlob);
    const parametersLink = document.createElement('a');
    parametersLink.href = parametersUrl;
    parametersLink.download = `${baseName}_parameters.map`;
    document.body.appendChild(parametersLink);
    parametersLink.click();
    document.body.removeChild(parametersLink);
    URL.revokeObjectURL(parametersUrl);

    // Download board types map if available
    if (maps.boardTypes) {
      const boardTypesBlob = new Blob([maps.boardTypes], { type: 'text/plain' });
      const boardTypesUrl = URL.createObjectURL(boardTypesBlob);
      const boardTypesLink = document.createElement('a');
      boardTypesLink.href = boardTypesUrl;
      boardTypesLink.download = `${baseName}_boardtypes.map`;
      document.body.appendChild(boardTypesLink);
      boardTypesLink.click();
      document.body.removeChild(boardTypesLink);
      URL.revokeObjectURL(boardTypesUrl);
    }

    // Download system registers map if available
    if (maps.systemRegisters) {
      const sysRegBlob = new Blob([maps.systemRegisters], { type: 'text/plain' });
      const sysRegUrl = URL.createObjectURL(sysRegBlob);
      const sysRegLink = document.createElement('a');
      sysRegLink.href = sysRegUrl;
      sysRegLink.download = `${baseName}_system_registers.map`;
      document.body.appendChild(sysRegLink);
      sysRegLink.click();
      document.body.removeChild(sysRegLink);
      URL.revokeObjectURL(sysRegUrl);
    }

    const fileCount = 2 + (maps.boardTypes ? 1 : 0) + (maps.systemRegisters ? 1 : 0);
    showSuccess(`Maps downloaded (${fileCount} files)`);
    setAnchorEl(null);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, profileId: string) => {
    setAnchorEl(event.currentTarget);
    setSelectedProfileId(profileId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedProfileId(null);
  };

  const openEditDialog = (profileId: string) => {
    setSelectedProfileId(profileId);
    setEditDialogOpen(true);
    setAnchorEl(null);
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Map Profiles</Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Profile
          </Button>
        </Box>

        <List>
          {profiles
            .sort((a, b) => {
              // Default always first
              if (a.id === DEFAULT_PROFILE_ID) return -1;
              if (b.id === DEFAULT_PROFILE_ID) return 1;
              // Then by most recently used
              return (b.lastUsed || b.createdAt) - (a.lastUsed || a.createdAt);
            })
            .map((profile) => {
              const isActive = profile.id === settings.activeMapProfileId;
              const isDefault = profile.id === DEFAULT_PROFILE_ID;

              return (
                <ListItem
                  key={profile.id}
                  sx={{
                    border: isActive ? 2 : 1,
                    borderColor: isActive ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    mb: 1,
                    bgcolor: isActive ? 'action.selected' : 'background.paper'
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
                        {isDefault && <Chip label="Default" size="small" variant="outlined" />}
                      </Box>
                    }
                    secondary={
                      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
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
                    <Stack direction="row" spacing={1}>
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
                      <IconButton
                        edge="end"
                        onClick={(e) => handleMenuOpen(e, profile.id)}
                      >
                        <MoreIcon />
                      </IconButton>
                    </Stack>
                  </ListItemSecondaryAction>
                </ListItem>
              );
            })}
        </List>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={() => selectedProfileId && handleDownloadMaps(selectedProfileId)}>
            <DownloadIcon fontSize="small" sx={{ mr: 1 }} />
            Download Maps
          </MenuItem>
          {selectedProfileId !== DEFAULT_PROFILE_ID && (
            <>
              <MenuItem onClick={() => selectedProfileId && openEditDialog(selectedProfileId)}>
                <EditIcon fontSize="small" sx={{ mr: 1 }} />
                Update Maps
              </MenuItem>
              <MenuItem
                onClick={() => selectedProfileId && handleDeleteProfile(selectedProfileId)}
                sx={{ color: 'error.main' }}
              >
                <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                Delete
              </MenuItem>
            </>
          )}
        </Menu>

        {/* Create Profile Dialog */}
        <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Create New Map Profile</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Profile Name"
              fullWidth
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="e.g., Production Config, Test Setup"
              sx={{ mb: 2 }}
            />

            <Typography variant="subtitle2" gutterBottom>
              Registers Map File
            </Typography>
            <input
              type="file"
              accept=".map"
              ref={registersInputRef}
              onChange={(e) => setRegistersFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => registersInputRef.current?.click()}
              fullWidth
              sx={{ mb: 2 }}
            >
              {registersFile ? registersFile.name : 'Upload Registers Map'}
            </Button>

            <Typography variant="subtitle2" gutterBottom>
              Parameters Map File
            </Typography>
            <input
              type="file"
              accept=".map"
              ref={parametersInputRef}
              onChange={(e) => setParametersFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => parametersInputRef.current?.click()}
              fullWidth
              sx={{ mb: 2 }}
            >
              {parametersFile ? parametersFile.name : 'Upload Parameters Map'}
            </Button>

            <Typography variant="subtitle2" gutterBottom>
              Board Types Map File (Optional)
            </Typography>
            <input
              type="file"
              accept=".map"
              ref={boardTypesInputRef}
              onChange={(e) => setBoardTypesFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => boardTypesInputRef.current?.click()}
              fullWidth
              sx={{ mb: 2 }}
            >
              {boardTypesFile ? boardTypesFile.name : 'Upload Board Types Map (Optional)'}
            </Button>

            <Typography variant="subtitle2" gutterBottom>
              System Registers Map File (Optional)
            </Typography>
            <input
              type="file"
              accept=".map"
              ref={systemRegistersInputRef}
              onChange={(e) => setSystemRegistersFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => systemRegistersInputRef.current?.click()}
              fullWidth
            >
              {systemRegistersFile ? systemRegistersFile.name : 'Upload System Registers Map (Optional)'}
            </Button>

            <Alert severity="info" sx={{ mt: 2 }}>
              Upload register and parameter map files (.map format) to create a new profile. Board types and system registers maps are optional.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateProfile} variant="contained">
              Create
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit Profile Dialog */}
        <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Update Map Files</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Upload new map files to update this profile.
            </Typography>

            <Typography variant="subtitle2" gutterBottom>
              Registers Map File
            </Typography>
            <input
              type="file"
              accept=".map"
              onChange={(e) => setRegistersFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
              id="edit-registers-input"
            />
            <label htmlFor="edit-registers-input">
              <Button
                variant="outlined"
                component="span"
                startIcon={<UploadIcon />}
                fullWidth
                sx={{ mb: 2 }}
              >
                {registersFile ? registersFile.name : 'Upload Registers Map'}
              </Button>
            </label>

            <Typography variant="subtitle2" gutterBottom>
              Parameters Map File
            </Typography>
            <input
              type="file"
              accept=".map"
              onChange={(e) => setParametersFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
              id="edit-parameters-input"
            />
            <label htmlFor="edit-parameters-input">
              <Button
                variant="outlined"
                component="span"
                startIcon={<UploadIcon />}
                fullWidth
                sx={{ mb: 2 }}
              >
                {parametersFile ? parametersFile.name : 'Upload Parameters Map'}
              </Button>
            </label>

            <Typography variant="subtitle2" gutterBottom>
              Board Types Map File (Optional)
            </Typography>
            <input
              type="file"
              accept=".map"
              onChange={(e) => setBoardTypesFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
              id="edit-boardtypes-input"
            />
            <label htmlFor="edit-boardtypes-input">
              <Button
                variant="outlined"
                component="span"
                startIcon={<UploadIcon />}
                fullWidth
                sx={{ mb: 2 }}
              >
                {boardTypesFile ? boardTypesFile.name : 'Upload Board Types Map (Optional)'}
              </Button>
            </label>

            <Typography variant="subtitle2" gutterBottom>
              System Registers Map File (Optional)
            </Typography>
            <input
              type="file"
              accept=".map"
              onChange={(e) => setSystemRegistersFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
              id="edit-systemregisters-input"
            />
            <label htmlFor="edit-systemregisters-input">
              <Button
                variant="outlined"
                component="span"
                startIcon={<UploadIcon />}
                fullWidth
              >
                {systemRegistersFile ? systemRegistersFile.name : 'Upload System Registers Map (Optional)'}
              </Button>
            </label>

            <Alert severity="warning" sx={{ mt: 2 }}>
              Register and parameter map files are required. Board types and system registers maps are optional.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateProfile} variant="contained">
              Update
            </Button>
          </DialogActions>
        </Dialog>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            Map profiles store register and parameter mappings. Create custom profiles by uploading .map files,
            or download existing profiles for backup. The default profile cannot be edited but can be downloaded.
            {state.connection?.connected && ' Profile changes require reconnection to apply.'}
          </Typography>
        </Alert>
      </CardContent>
    </Card>
  );
}
