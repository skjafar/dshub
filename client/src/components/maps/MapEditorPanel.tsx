import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Button,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Divider,
  TextField,
  SelectChangeEvent
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import SaveAsIcon from '@mui/icons-material/SaveAs';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useSettings } from '../../contexts/SettingsContext';
import { useDSHub } from '../../contexts/DSHubContext';
import { useToast } from '../ToastNotification';
import { parseMapFile, MapEntry } from '../../maps/mapParser';
import { mapManager } from '../../maps/mapManager';
import { generateMapFile, getNextAddress, consolidateArrayEntries } from '../../utils/mapFileGenerator';
import { arrayMove } from '@dnd-kit/sortable';
import { DEFAULT_PROFILE_ID, CNC_PROFILE_ID, SysCommand } from '../../types/settings';
import { DataForm, DataAccessPermit } from '../../maps/mapParser';
import MapEntriesList from './MapEntriesList';
import MapExportDialog from './MapExportDialog';
import SysCommandsTab from './SysCommandsTab';
import { FONT_MONO } from '../../theme';

type MapType = 'registers' | 'parameters' | 'sysCommands';

const EMPTY_PROFILE_ID = '__empty__';

export default function MapEditorPanel() {
  const { getActiveProfile, updateProfile, getAllProfiles, createProfile } = useSettings();
  const { state } = useDSHub();
  const { showSuccess, showError } = useToast();

  const [currentTab, setCurrentTab] = useState<MapType>('registers');
  const [selectedProfileId, setSelectedProfileId] = useState(getActiveProfile()?.id || DEFAULT_PROFILE_ID);
  const [previousProfileId, setPreviousProfileId] = useState(getActiveProfile()?.id || DEFAULT_PROFILE_ID);
  const [registerEntries, setRegisterEntries] = useState<MapEntry[]>([]);
  const [parameterEntries, setParameterEntries] = useState<MapEntry[]>([]);
  const [sysCommandEntries, setSysCommandEntries] = useState<SysCommand[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Dialog states
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<MapEntry | null>(null);
  const [unsavedChangesDialogOpen, setUnsavedChangesDialogOpen] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);
  const [profileToOverwrite, setProfileToOverwrite] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [sysCommandAddDialogOpen, setSysCommandAddDialogOpen] = useState(false);
  const [sysCommandExportDialogOpen, setSysCommandExportDialogOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load profile data when selected profile changes
  useEffect(() => {
    loadProfile(selectedProfileId);
  }, [selectedProfileId]);

  const loadProfile = (profileId: string) => {
    if (profileId === EMPTY_PROFILE_ID) {
      // Empty profile - start from scratch
      setRegisterEntries([]);
      setParameterEntries([]);
      setSysCommandEntries([]);
      setHasUnsavedChanges(false);
      setPreviousProfileId(profileId);
      return;
    }

    const allProfiles = getAllProfiles();
    const profile = allProfiles.find(p => p.id === profileId);

    if (profile) {
      try {
        const regParsed = parseMapFile(profile.registersMap, true);
        const paramParsed = parseMapFile(profile.parametersMap, false);

        // Validate register order (read-only must come before read-write)
        if (!validateRegisterOrder(regParsed.entries)) {
          showError('Invalid register map: Read-only registers must be listed before read-write registers. Cannot load profile.');
          // Revert to previous profile
          setSelectedProfileId(previousProfileId);
          return;
        }

        setRegisterEntries(regParsed.entries);
        setParameterEntries(paramParsed.entries);
        setSysCommandEntries(profile.sysCommands || []);
        setHasUnsavedChanges(false);
        setPreviousProfileId(profileId);
      } catch (error) {
        showError('Failed to parse map files');
        console.error(error);
        // Revert to previous profile
        setSelectedProfileId(previousProfileId);
      }
    }
  };

  const handleProfileChange = (event: SelectChangeEvent<string>) => {
    const newProfileId = event.target.value;

    if (hasUnsavedChanges) {
      // Show confirmation dialog
      setPendingProfileId(newProfileId);
      setUnsavedChangesDialogOpen(true);
    } else {
      // Switch directly
      setSelectedProfileId(newProfileId);
    }
  };

  const handleUnsavedChangesConfirm = () => {
    if (pendingProfileId) {
      setSelectedProfileId(pendingProfileId);
      setPendingProfileId(null);
    }
    setUnsavedChangesDialogOpen(false);
  };

  const handleUnsavedChangesCancel = () => {
    setPendingProfileId(null);
    setUnsavedChangesDialogOpen(false);
  };

  const currentEntries = currentTab === 'registers' ? registerEntries : parameterEntries;
  const isRegisterMap = currentTab === 'registers';

  // Helper function to sort registers by access permission (read-only first)
  const sortRegistersByAccessPermit = (entries: MapEntry[]): MapEntry[] => {
    const readOnly = entries.filter(e => e.accessPermit === DataAccessPermit.READ_ONLY);
    const readWrite = entries.filter(e => e.accessPermit === DataAccessPermit.READ_WRITE);
    return [...readOnly, ...readWrite];
  };

  // Validate that registers are correctly sorted (read-only before read-write)
  const validateRegisterOrder = (entries: MapEntry[]): boolean => {
    let seenReadWrite = false;

    for (const entry of entries) {
      if (entry.accessPermit === DataAccessPermit.READ_WRITE) {
        seenReadWrite = true;
      } else if (entry.accessPermit === DataAccessPermit.READ_ONLY && seenReadWrite) {
        // Found a read-only entry after a read-write entry - invalid order
        return false;
      }
    }

    return true;
  };

  const handleUpdateEntry = (oldEntry: MapEntry, newData: Partial<MapEntry>) => {
    const entries = currentTab === 'registers' ? [...registerEntries] : [...parameterEntries];
    const entryType = isRegisterMap ? 'registers' : 'parameters';
    const baseName = oldEntry.name.replace(/\[\d+\]$/, '');

    // Find the position where we need to insert the new entries
    const insertIndex = entries.findIndex(e => {
      const eBaseName = e.name.replace(/\[\d+\]$/, '');
      return eBaseName === baseName;
    });

    // Remove old entries (all array elements if it was an array)
    const filtered = entries.filter(e => {
      const eBaseName = e.name.replace(/\[\d+\]$/, '');
      return eBaseName !== baseName;
    });

    // Calculate how many entries the old entry occupied
    const oldEntryCount = entries.filter(e => {
      const eBaseName = e.name.replace(/\[\d+\]$/, '');
      return eBaseName === baseName;
    }).length;

    // Calculate how many entries the new data will create
    const newEntryCount = newData.isArray && newData.arraySize ? newData.arraySize : 1;

    // Check if the update would exceed the 256 limit
    const totalAfterUpdate = filtered.length + newEntryCount;
    if (totalAfterUpdate > 256) {
      const excessCount = totalAfterUpdate - 256;
      showError(`Cannot update entry. This would create ${totalAfterUpdate} ${entryType}, exceeding the maximum of 256 by ${excessCount}.`);
      return;
    }

    // Create new entries maintaining the original address
    const newEntries = createEntriesFromData(newData, oldEntry.address, filtered);

    // Insert new entries at the original position
    const result = [...filtered];
    result.splice(insertIndex, 0, ...newEntries);

    // Recalculate addresses sequentially
    const readdressed = result.map((e, index) => ({ ...e, address: index }));

    if (currentTab === 'registers') {
      setRegisterEntries(readdressed);
    } else {
      setParameterEntries(readdressed);
    }

    setHasUnsavedChanges(true);
    showSuccess('Entry updated');
  };

  const handleDeleteEntry = (entry: MapEntry) => {
    setEntryToDelete(entry);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!entryToDelete) return;

    const entries = currentTab === 'registers' ? registerEntries : parameterEntries;
    const baseName = entryToDelete.name.replace(/\[\d+\]$/, '');

    // Remove entry and all array elements if it's an array
    const filtered = entries.filter(e => {
      const eBaseName = e.name.replace(/\[\d+\]$/, '');
      return eBaseName !== baseName;
    });

    // Recalculate addresses
    const readdressed = filtered.map((e, index) => ({ ...e, address: index }));

    if (currentTab === 'registers') {
      setRegisterEntries(readdressed);
    } else {
      setParameterEntries(readdressed);
    }

    setHasUnsavedChanges(true);
    setDeleteConfirmOpen(false);
    setEntryToDelete(null);
    showSuccess('Entry deleted');
  };

  const handleAddEntry = () => {
    const entries = currentTab === 'registers' ? [...registerEntries] : [...parameterEntries];
    const entryType = isRegisterMap ? 'registers' : 'parameters';

    // Check if we would exceed the 256 limit
    if (entries.length >= 256) {
      showError(`Cannot add more ${entryType}. Maximum of 256 ${entryType} allowed.`);
      return;
    }

    const nextAddress = getNextAddress(entries);

    // Generate a unique default name based on entry type
    const prefix = isRegisterMap ? 'NEW_REGISTER' : 'NEW_PARAMETER';
    let counter = 1;
    let newName = `${prefix}_${counter}`;
    while (entries.some(e => e.name === newName || e.name.startsWith(`${newName}[`))) {
      counter++;
      newName = `${prefix}_${counter}`;
    }

    // Create a new entry with default values
    const newEntry: MapEntry = {
      address: nextAddress,
      name: newName,
      type: DataForm.UINT,
      isArray: false,
      accessPermit: isRegisterMap ? DataAccessPermit.READ_ONLY : DataAccessPermit.READ_WRITE,
      showAsHex: false
    };

    const newEntries = [...entries, newEntry];

    // For registers, sort by access permission (read-only first)
    const sorted = isRegisterMap ? sortRegistersByAccessPermit(newEntries) : newEntries;

    // Recalculate addresses
    const readdressed = sorted.map((e, index) => ({ ...e, address: index }));

    if (currentTab === 'registers') {
      setRegisterEntries(readdressed);
    } else {
      setParameterEntries(readdressed);
    }

    showSuccess('Entry added');
    setHasUnsavedChanges(true);
  };

  const createEntriesFromData = (
    data: Partial<MapEntry>,
    startAddress: number,
    existingEntries: MapEntry[]
  ): MapEntry[] => {
    const entries: MapEntry[] = [];

    if (data.isArray && data.arraySize) {
      // Create array entries
      console.log(`[MapEditor] Creating array "${data.name}" with ${data.arraySize} (type: ${typeof data.arraySize}) elements starting at address ${startAddress}`);
      console.log(`[MapEditor] Full data object:`, JSON.stringify(data));
      for (let i = 0; i < data.arraySize; i++) {
        entries.push({
          address: startAddress + i,
          name: `${data.name}[${i}]`,
          type: data.type!,
          isArray: true,
          arraySize: data.arraySize,
          accessPermit: data.accessPermit!,
          showAsHex: data.showAsHex || false
        });
      }
      console.log(`[MapEditor] Created ${entries.length} array entries for "${data.name}"`);
    } else {
      // Create single entry
      entries.push({
        address: startAddress,
        name: data.name!,
        type: data.type!,
        isArray: false,
        accessPermit: data.accessPermit!,
        showAsHex: data.showAsHex || false
      });
    }

    return entries;
  };

  const handleReorder = (oldIndex: number, newIndex: number) => {
    const entries = currentTab === 'registers' ? [...registerEntries] : [...parameterEntries];
    const consolidatedEntries = consolidateArrayEntries(entries);

    // For registers, enforce access permission boundaries
    if (isRegisterMap) {
      const movedEntry = consolidatedEntries[oldIndex];
      const targetEntry = consolidatedEntries[newIndex];

      // Prevent moving read-only entries to read-write section and vice versa
      if (movedEntry.accessPermit !== targetEntry.accessPermit) {
        showError('Cannot move entries across Read-Only/Read-Write boundary');
        return;
      }
    }

    // Use arrayMove to reorder the consolidated entries
    const reorderedConsolidated = arrayMove(consolidatedEntries, oldIndex, newIndex);

    // Rebuild the full entries array from the reordered consolidated entries
    const newEntries: MapEntry[] = [];
    let currentAddress = 0;

    reorderedConsolidated.forEach((consolidatedEntry) => {
      if (consolidatedEntry.isArray && consolidatedEntry.arraySize) {
        // Recreate array entries
        for (let i = 0; i < consolidatedEntry.arraySize; i++) {
          newEntries.push({
            address: currentAddress++,
            name: `${consolidatedEntry.name}[${i}]`,
            type: consolidatedEntry.type,
            isArray: true,
            arraySize: consolidatedEntry.arraySize,
            accessPermit: consolidatedEntry.accessPermit,
            showAsHex: consolidatedEntry.showAsHex
          });
        }
      } else {
        // Add single entry
        newEntries.push({
          ...consolidatedEntry,
          address: currentAddress++
        });
      }
    });

    if (currentTab === 'registers') {
      setRegisterEntries(newEntries);
    } else {
      setParameterEntries(newEntries);
    }

    setHasUnsavedChanges(true);
  };

  const handleImportFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = parseMapFile(content, isRegisterMap);
        const entryType = isRegisterMap ? 'registers' : 'parameters';

        // Check if the imported file exceeds the 256 entry limit
        if (parsed.entries.length > 256) {
          showError(`Cannot import ${file.name}. File contains ${parsed.entries.length} ${entryType}, exceeding the maximum of 256.`);
          return;
        }

        // For registers, validate proper ordering (read-only before read-write)
        if (isRegisterMap && !validateRegisterOrder(parsed.entries)) {
          showError('Invalid register map: Read-only registers must be listed before read-write registers. Import aborted.');
          return;
        }

        if (currentTab === 'registers') {
          setRegisterEntries(parsed.entries);
        } else {
          setParameterEntries(parsed.entries);
        }

        setHasUnsavedChanges(true);
        showSuccess(`Imported ${parsed.entries.length} entries from ${file.name}`);
      } catch (error) {
        showError('Failed to parse map file');
        console.error(error);
      }
    };

    reader.readAsText(file);
    // Reset input to allow re-import of same file
    event.target.value = '';
  };

  const handleSaveToCurrentProfile = () => {
    if (selectedProfileId === EMPTY_PROFILE_ID) {
      showError('Cannot save to empty profile. Use "Save as New Profile" instead.');
      return;
    }

    if (selectedProfileId === DEFAULT_PROFILE_ID || selectedProfileId === CNC_PROFILE_ID) {
      showError('Cannot overwrite built-in profiles. Use "Save as New Profile" to create a custom profile.');
      return;
    }

    // Show overwrite confirmation
    setProfileToOverwrite(selectedProfileId);
    setOverwriteConfirmOpen(true);
  };

  const handleOverwriteConfirm = () => {
    if (!profileToOverwrite) return;

    try {
      const registersContent = generateMapFile(registerEntries, true);
      const parametersContent = generateMapFile(parameterEntries, false);

      const allProfiles = getAllProfiles();
      const profile = allProfiles.find(p => p.id === profileToOverwrite);
      const boardTypesContent = profile?.boardTypesMap;

      const success = updateProfile(
        profileToOverwrite,
        registersContent,
        parametersContent,
        sysCommandEntries,
        boardTypesContent
      );

      if (success) {
        mapManager.reload();
        setHasUnsavedChanges(false);
        showSuccess('Profile saved successfully. Map manager reloaded.');

        // DON'T reload from storage - just refresh the UI by re-parsing what we just saved
        // This ensures we display the consolidated/expanded entries correctly
        const regParsed = parseMapFile(registersContent, true);
        const paramParsed = parseMapFile(parametersContent, false);
        setRegisterEntries(regParsed.entries);
        setParameterEntries(paramParsed.entries);
      } else {
        showError('Failed to save profile');
      }
    } catch (error) {
      showError('Error saving profile');
      console.error(error);
    }

    setOverwriteConfirmOpen(false);
    setProfileToOverwrite(null);
  };

  const handleResetChanges = () => {
    setResetConfirmOpen(true);
  };

  const handleResetConfirm = () => {
    // Store current profile ID before reload
    const currentProfileId = selectedProfileId;
    loadProfile(currentProfileId);
    setResetConfirmOpen(false);
    showSuccess('Changes discarded. Profile reloaded.');
  };

  const handleSaveAsNewProfile = () => {
    setNewProfileName('');
    setSaveAsDialogOpen(true);
  };

  const handleSaveAsConfirm = () => {
    const trimmedName = newProfileName.trim();

    if (!trimmedName) {
      showError('Profile name cannot be empty');
      return;
    }

    // Check if name already exists
    const allProfiles = getAllProfiles();
    const nameExists = allProfiles.some(p => p.name.toLowerCase() === trimmedName.toLowerCase());

    if (nameExists) {
      showError('A profile with this name already exists');
      return;
    }

    try {
      const registersContent = generateMapFile(registerEntries, true);
      const parametersContent = generateMapFile(parameterEntries, false);

      // Get board types from current profile if available
      let boardTypesContent: string | undefined = undefined;
      if (selectedProfileId !== EMPTY_PROFILE_ID) {
        const currentProfile = allProfiles.find(p => p.id === selectedProfileId);
        boardTypesContent = currentProfile?.boardTypesMap;
      }

      const newProfileId = createProfile(trimmedName, registersContent, parametersContent, sysCommandEntries, boardTypesContent);

      // Refresh the UI by re-parsing what we just saved
      const regParsed = parseMapFile(registersContent, true);
      const paramParsed = parseMapFile(parametersContent, false);
      setRegisterEntries(regParsed.entries);
      setParameterEntries(paramParsed.entries);

      setHasUnsavedChanges(false);
      setPreviousProfileId(newProfileId); // Update previous to avoid triggering loadProfile
      setSelectedProfileId(newProfileId);
      showSuccess(`Profile "${trimmedName}" created successfully`);
      setSaveAsDialogOpen(false);
      setNewProfileName('');
    } catch (error) {
      showError('Error creating profile');
      console.error(error);
    }
  };

  const allProfiles = getAllProfiles();
  const selectedProfile = allProfiles.find(p => p.id === selectedProfileId);
  const canSaveToCurrentProfile = selectedProfileId !== EMPTY_PROFILE_ID && selectedProfileId !== DEFAULT_PROFILE_ID && selectedProfileId !== CNC_PROFILE_ID;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, gap: 1.5 }}>
      {/* Toolbar */}
      <Paper sx={{ p: 1.5 }}>
        {state.connection?.connected && (
          <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', mb: 1 }}>
            Device is connected. Saving changes will reload the map manager. You may need to reconnect for changes to take effect.
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {currentTab === 'sysCommands' ? (
            <>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setSysCommandAddDialogOpen(true)}
                size="small"
              >
                Add Entry
              </Button>
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={() => setSysCommandExportDialogOpen(true)}
                disabled={sysCommandEntries.length === 0}
                size="small"
              >
                Export
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddEntry}
                size="small"
              >
                Add Entry
              </Button>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={handleImportFile}
                size="small"
              >
                Import .map
              </Button>
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={() => setExportDialogOpen(true)}
                size="small"
              >
                Export
              </Button>
            </>
          )}
          <Box sx={{ flexGrow: 1 }} />
          {hasUnsavedChanges && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#FFAB00' }} />
              <Typography variant="caption" color="warning.main" sx={{ fontFamily: FONT_MONO, fontSize: '0.7rem' }}>
                Unsaved
              </Typography>
            </Box>
          )}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Profile</InputLabel>
            <Select
              value={selectedProfileId}
              onChange={handleProfileChange}
              label="Profile"
              sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem' }}
            >
              <MenuItem value={EMPTY_PROFILE_ID}>
                <em>Empty / Start from Scratch</em>
              </MenuItem>
              <Divider />
              {allProfiles.map(profile => (
                <MenuItem key={profile.id} value={profile.id}>
                  {profile.name} {profile.isDefault ? '(Default)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            color="warning"
            startIcon={<RestartAltIcon />}
            onClick={handleResetChanges}
            disabled={!hasUnsavedChanges}
            size="small"
          >
            Reset
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<SaveIcon />}
            onClick={handleSaveToCurrentProfile}
            disabled={!hasUnsavedChanges || !canSaveToCurrentProfile}
            size="small"
          >
            Save
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SaveAsIcon />}
            onClick={handleSaveAsNewProfile}
            size="small"
          >
            Save As
          </Button>
        </Box>
      </Paper>

      {/* Tabs */}
      <Paper sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Tabs value={currentTab} onChange={(_, val) => setCurrentTab(val)}>
          <Tab label={`Registers (${registerEntries.length})`} value="registers" sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem' }} />
          <Tab label={`Parameters (${parameterEntries.length})`} value="parameters" sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem' }} />
          <Tab label={`SYS_COMMANDs (${sysCommandEntries.length})`} value="sysCommands" sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem' }} />
        </Tabs>
        <Divider />
        <Box sx={{ p: 1.5, flexGrow: 1, overflow: 'auto' }}>
          {currentTab === 'sysCommands' ? (
            <SysCommandsTab
              commands={sysCommandEntries}
              onCommandsChange={(commands) => {
                setSysCommandEntries(commands);
                setHasUnsavedChanges(true);
              }}
              readOnly={false}
              profileName={selectedProfile?.name || 'Custom'}
              showAddDialog={sysCommandAddDialogOpen}
              onAddDialogClose={() => setSysCommandAddDialogOpen(false)}
              showExportDialog={sysCommandExportDialogOpen}
              onExportDialogClose={() => setSysCommandExportDialogOpen(false)}
            />
          ) : (
            <MapEntriesList
              entries={currentEntries}
              isRegisterMap={isRegisterMap}
              onUpdate={handleUpdateEntry}
              onDelete={handleDeleteEntry}
              onReorder={handleReorder}
            />
          )}
        </Box>
      </Paper>

      {/* Dialogs */}
      <MapExportDialog
        open={exportDialogOpen}
        entries={currentEntries}
        isRegisterMap={isRegisterMap}
        profileName={selectedProfile?.name || 'Custom'}
        onClose={() => setExportDialogOpen(false)}
      />

      {/* Unsaved Changes Confirmation Dialog */}
      <Dialog open={unsavedChangesDialogOpen} onClose={handleUnsavedChangesCancel}>
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes. Switching profiles will discard these changes. Do you want to continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleUnsavedChangesCancel}>Cancel</Button>
          <Button onClick={handleUnsavedChangesConfirm} color="warning" variant="contained">
            Discard Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Save As New Profile Dialog */}
      <Dialog open={saveAsDialogOpen} onClose={() => setSaveAsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Save as New Profile</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Enter a name for your new profile.
          </DialogContentText>
          <TextField
            autoFocus
            label="Profile Name"
            fullWidth
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSaveAsConfirm();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveAsDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveAsConfirm} variant="contained" color="primary">
            Create Profile
          </Button>
        </DialogActions>
      </Dialog>

      {/* Overwrite Confirmation Dialog */}
      <Dialog open={overwriteConfirmOpen} onClose={() => setOverwriteConfirmOpen(false)}>
        <DialogTitle>Confirm Overwrite</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to overwrite the profile "{selectedProfile?.name}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverwriteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleOverwriteConfirm} color="warning" variant="contained">
            Overwrite
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Changes Confirmation Dialog */}
      <Dialog open={resetConfirmOpen} onClose={() => setResetConfirmOpen(false)}>
        <DialogTitle>Reset Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to discard all unsaved changes? This will reload the profile "{selectedProfile?.name || 'current profile'}" and all your edits will be lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleResetConfirm} color="warning" variant="contained">
            Reset Changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "{entryToDelete?.name.replace(/\[\d+\]$/, '')}"?
            {entryToDelete?.isArray && ' This will delete all array elements.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".map"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </Box>
  );
}
