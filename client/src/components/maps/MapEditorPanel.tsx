import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Divider,
  TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useSettings } from '../../contexts/SettingsContext';
import { useDSHub } from '../../contexts/DSHubContext';
import { useToast } from '../ToastNotification';
import { parseMapFile, MapEntry } from '../../maps/mapParser';
import { mapManager } from '../../maps/mapManager';
import { generateMapFile, getNextAddress, consolidateArrayEntries } from '../../utils/mapFileGenerator';
import { arrayMove } from '@dnd-kit/sortable';
import { DEFAULT_PROFILE_ID, CNC_PROFILE_ID, SysCommand, EntryMetadata, MapProfile } from '../../types/settings';
import { DataForm, DataAccessPermit } from '../../maps/mapParser';
import MapEntriesList from './MapEntriesList';
import MapExportDialog from './MapExportDialog';
import SysCommandsTab from './SysCommandsTab';
import { logger } from '../../utils/logger';
import { FONT_MONO } from '../../theme';
import { exportMapProfilePdf } from '../../utils/pdfExporter';

export const EMPTY_PROFILE_ID = '__empty__';

type MapType = 'registers' | 'parameters' | 'sysCommands';

// ── Public interface exposed to parent via ref ────────────────────────────────

export interface MapEditorBarState {
  hasUnsavedChanges: boolean;
  canSave: boolean;
  selectedProfileId: string;
  allProfiles: MapProfile[];
}

export interface MapEditorPanelRef {
  save: () => void;
  saveAs: () => void;
  reset: () => void;
  exportPdf: () => void;
  changeProfile: (id: string) => void;
}

interface MapEditorPanelProps {
  onBarStateChange?: (state: MapEditorBarState) => void;
}

// ─────────────────────────────────────────────────────────────────────────────

const MapEditorPanel = forwardRef<MapEditorPanelRef, MapEditorPanelProps>(
  function MapEditorPanel({ onBarStateChange }, ref) {
  const { getActiveProfile, updateProfile, getAllProfiles, createProfile } = useSettings();
  const { state } = useDSHub();
  const { showSuccess, showError, showWarning } = useToast();

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

  // ── Computed ──────────────────────────────────────────────────────────────
  const allProfiles = getAllProfiles();
  const selectedProfile = allProfiles.find(p => p.id === selectedProfileId);
  const canSaveToCurrentProfile =
    selectedProfileId !== EMPTY_PROFILE_ID &&
    selectedProfileId !== DEFAULT_PROFILE_ID &&
    selectedProfileId !== CNC_PROFILE_ID;

  // ── Notify parent of bar state changes ───────────────────────────────────
  useEffect(() => {
    onBarStateChange?.({
      hasUnsavedChanges,
      canSave: canSaveToCurrentProfile,
      selectedProfileId,
      allProfiles,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedChanges, canSaveToCurrentProfile, selectedProfileId, allProfiles.length]);

  // ── Expose imperative actions to parent ──────────────────────────────────
  useImperativeHandle(ref, () => ({
    save: handleSaveToCurrentProfile,
    saveAs: handleSaveAsNewProfile,
    reset: handleResetChanges,
    exportPdf: () => exportMapProfilePdf(
      selectedProfile?.name || 'Custom',
      registerEntries,
      parameterEntries,
      sysCommandEntries
    ),
    changeProfile: handleProfileChange,
  }));

  // ── Profile loading ───────────────────────────────────────────────────────
  useEffect(() => {
    loadProfile(selectedProfileId);
  }, [selectedProfileId]);

  const loadProfile = (profileId: string) => {
    if (profileId === EMPTY_PROFILE_ID) {
      setRegisterEntries([]);
      setParameterEntries([]);
      setSysCommandEntries([]);
      setHasUnsavedChanges(false);
      setPreviousProfileId(profileId);
      return;
    }

    const profiles = getAllProfiles();
    const profile = profiles.find(p => p.id === profileId);

    if (profile) {
      try {
        const regParsed = parseMapFile(profile.registersMap, true);
        const paramParsed = parseMapFile(profile.parametersMap, false);

        if (!validateRegisterOrder(regParsed.entries)) {
          showError('Invalid register map: Read-only registers must be listed before read-write registers. Cannot load profile.');
          setSelectedProfileId(previousProfileId);
          return;
        }

        const regMeta = profile.registersMetadata ?? {};
        const paramMeta = profile.parametersMetadata ?? {};

        setRegisterEntries(regParsed.entries.map(e => {
          const baseName = e.name.replace(/\[\d+\]$/, '');
          const m = regMeta[baseName];
          return m ? { ...e, unit: m.unit, description: m.description, valueList: m.valueList } : e;
        }));
        setParameterEntries(paramParsed.entries.map(e => {
          const baseName = e.name.replace(/\[\d+\]$/, '');
          const m = paramMeta[baseName];
          return m ? { ...e, unit: m.unit, description: m.description, valueList: m.valueList } : e;
        }));
        setSysCommandEntries(profile.sysCommands || []);
        setHasUnsavedChanges(false);
        setPreviousProfileId(profileId);
      } catch (error) {
        showError('Failed to parse map files');
        console.error(error);
        setSelectedProfileId(previousProfileId);
      }
    }
  };

  const handleProfileChange = (newProfileId: string) => {
    if (hasUnsavedChanges) {
      setPendingProfileId(newProfileId);
      setUnsavedChangesDialogOpen(true);
    } else {
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  const sortRegistersByAccessPermit = (entries: MapEntry[]): MapEntry[] => {
    const readOnly = entries.filter(e => e.accessPermit === DataAccessPermit.READ_ONLY);
    const readWrite = entries.filter(e => e.accessPermit === DataAccessPermit.READ_WRITE);
    return [...readOnly, ...readWrite];
  };

  const validateRegisterOrder = (entries: MapEntry[]): boolean => {
    let seenReadWrite = false;
    for (const entry of entries) {
      if (entry.accessPermit === DataAccessPermit.READ_WRITE) {
        seenReadWrite = true;
      } else if (entry.accessPermit === DataAccessPermit.READ_ONLY && seenReadWrite) {
        return false;
      }
    }
    return true;
  };

  const extractMetadata = (entries: MapEntry[]): Record<string, EntryMetadata> => {
    const meta: Record<string, EntryMetadata> = {};
    consolidateArrayEntries(entries).forEach(e => {
      const name = e.name.replace(/\[\d+\]$/, '');
      if (e.unit || e.description || (e.valueList && e.valueList.length > 0)) {
        meta[name] = { unit: e.unit, description: e.description, valueList: e.valueList };
      }
    });
    return meta;
  };

  // ── Entry CRUD ────────────────────────────────────────────────────────────
  const handleUpdateEntry = (oldEntry: MapEntry, newData: Partial<MapEntry>) => {
    const entries = currentTab === 'registers' ? [...registerEntries] : [...parameterEntries];
    const entryType = isRegisterMap ? 'registers' : 'parameters';
    const baseName = oldEntry.name.replace(/\[\d+\]$/, '');

    const insertIndex = entries.findIndex(e => e.name.replace(/\[\d+\]$/, '') === baseName);
    const filtered = entries.filter(e => e.name.replace(/\[\d+\]$/, '') !== baseName);
    const newEntryCount = newData.isArray && newData.arraySize ? newData.arraySize : 1;

    if (filtered.length + newEntryCount > 256) {
      const excess = filtered.length + newEntryCount - 256;
      showError(`Cannot update entry. This would create ${filtered.length + newEntryCount} ${entryType}, exceeding the maximum of 256 by ${excess}.`);
      return;
    }

    const newEntries = createEntriesFromData({ ...oldEntry, ...newData }, oldEntry.address, filtered);
    const result = [...filtered];
    result.splice(insertIndex, 0, ...newEntries);
    const readdressed = result.map((e, index) => ({ ...e, address: index }));

    if (currentTab === 'registers') setRegisterEntries(readdressed);
    else setParameterEntries(readdressed);

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
    const filtered = entries.filter(e => e.name.replace(/\[\d+\]$/, '') !== baseName);
    const readdressed = filtered.map((e, index) => ({ ...e, address: index }));

    if (currentTab === 'registers') setRegisterEntries(readdressed);
    else setParameterEntries(readdressed);

    setHasUnsavedChanges(true);
    setDeleteConfirmOpen(false);
    setEntryToDelete(null);
    showSuccess('Entry deleted');
  };

  const handleAddEntry = () => {
    const entries = currentTab === 'registers' ? [...registerEntries] : [...parameterEntries];
    const entryType = isRegisterMap ? 'registers' : 'parameters';

    if (entries.length >= 256) {
      showError(`Cannot add more ${entryType}. Maximum of 256 ${entryType} allowed.`);
      return;
    }

    const prefix = isRegisterMap ? 'NEW_REGISTER' : 'NEW_PARAMETER';
    let counter = 1;
    let newName = `${prefix}_${counter}`;
    while (entries.some(e => e.name === newName || e.name.startsWith(`${newName}[`))) {
      counter++;
      newName = `${prefix}_${counter}`;
    }

    const newEntry: MapEntry = {
      address: getNextAddress(entries),
      name: newName,
      type: DataForm.UINT,
      isArray: false,
      accessPermit: isRegisterMap ? DataAccessPermit.READ_ONLY : DataAccessPermit.READ_WRITE,
      showAsHex: false,
    };

    const sorted = isRegisterMap ? sortRegistersByAccessPermit([...entries, newEntry]) : [...entries, newEntry];
    const readdressed = sorted.map((e, index) => ({ ...e, address: index }));

    if (currentTab === 'registers') setRegisterEntries(readdressed);
    else setParameterEntries(readdressed);

    showSuccess('Entry added');
    setHasUnsavedChanges(true);
  };

  const createEntriesFromData = (data: Partial<MapEntry>, startAddress: number, _existing: MapEntry[]): MapEntry[] => {
    const entries: MapEntry[] = [];
    if (data.isArray && data.arraySize) {
      logger.log(`[MapEditor] Creating array "${data.name}" with ${data.arraySize} elements at address ${startAddress}`);
      for (let i = 0; i < data.arraySize; i++) {
        entries.push({
          address: startAddress + i,
          name: `${data.name}[${i}]`,
          type: data.type!,
          isArray: true,
          arraySize: data.arraySize,
          accessPermit: data.accessPermit!,
          showAsHex: data.showAsHex || false,
          unit: data.unit,
          description: data.description,
          valueList: data.valueList,
        });
      }
    } else {
      entries.push({
        address: startAddress,
        name: data.name!,
        type: data.type!,
        isArray: false,
        accessPermit: data.accessPermit!,
        showAsHex: data.showAsHex || false,
        unit: data.unit,
        description: data.description,
        valueList: data.valueList,
      });
    }
    return entries;
  };

  const handleReorder = (oldIndex: number, newIndex: number) => {
    const entries = currentTab === 'registers' ? [...registerEntries] : [...parameterEntries];
    const consolidated = consolidateArrayEntries(entries);

    if (isRegisterMap && consolidated[oldIndex].accessPermit !== consolidated[newIndex].accessPermit) {
      showError('Cannot move entries across Read-Only/Read-Write boundary');
      return;
    }

    const reordered = arrayMove(consolidated, oldIndex, newIndex);
    const newEntries: MapEntry[] = [];
    let addr = 0;

    reordered.forEach(e => {
      if (e.isArray && e.arraySize) {
        for (let i = 0; i < e.arraySize; i++) {
          newEntries.push({ ...e, address: addr++, name: `${e.name}[${i}]` });
        }
      } else {
        newEntries.push({ ...e, address: addr++ });
      }
    });

    if (currentTab === 'registers') setRegisterEntries(newEntries);
    else setParameterEntries(newEntries);

    setHasUnsavedChanges(true);
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImportFile = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = parseMapFile(content, isRegisterMap);
        const entryType = isRegisterMap ? 'registers' : 'parameters';

        if (parsed.entries.length > 256) {
          showError(`Cannot import ${file.name}. File contains ${parsed.entries.length} ${entryType}, exceeding the maximum of 256.`);
          return;
        }
        if (isRegisterMap && !validateRegisterOrder(parsed.entries)) {
          showError('Invalid register map: Read-only registers must be listed before read-write registers. Import aborted.');
          return;
        }

        if (parsed.errors.length > 0) {
          const lines = parsed.errors.map(err => `  Line ${err.line}: ${err.message}`).join('\n');
          showWarning(`Imported with ${parsed.errors.length} issue${parsed.errors.length > 1 ? 's' : ''} (problematic lines skipped):\n${lines}`);
        }

        if (currentTab === 'registers') setRegisterEntries(parsed.entries);
        else setParameterEntries(parsed.entries);

        setHasUnsavedChanges(true);
        showSuccess(`Imported ${parsed.entries.length} entries from ${file.name}`);
      } catch (error) {
        showError('Failed to parse map file');
        console.error(error);
      }
    };

    reader.readAsText(file);
    event.target.value = '';
  };

  // ── Save / Reset ──────────────────────────────────────────────────────────
  const handleSaveToCurrentProfile = () => {
    if (selectedProfileId === EMPTY_PROFILE_ID) {
      showError('Cannot save to empty profile. Use "Save As" to create a named profile.');
      return;
    }
    if (selectedProfileId === DEFAULT_PROFILE_ID || selectedProfileId === CNC_PROFILE_ID) {
      showError('Cannot overwrite built-in profiles. Use "Save As" to create a custom profile.');
      return;
    }
    setProfileToOverwrite(selectedProfileId);
    setOverwriteConfirmOpen(true);
  };

  const handleOverwriteConfirm = () => {
    if (!profileToOverwrite) return;
    try {
      const registersContent = generateMapFile(registerEntries, true);
      const parametersContent = generateMapFile(parameterEntries, false);
      const profile = getAllProfiles().find(p => p.id === profileToOverwrite);
      const regsMeta = extractMetadata(registerEntries);
      const paramsMeta = extractMetadata(parameterEntries);

      const success = updateProfile(profileToOverwrite, registersContent, parametersContent, sysCommandEntries, profile?.boardTypesMap, regsMeta, paramsMeta);

      if (success) {
        mapManager.reload();
        setHasUnsavedChanges(false);
        showSuccess('Profile saved successfully.');
        const regParsed = parseMapFile(registersContent, true);
        const paramParsed = parseMapFile(parametersContent, false);
        setRegisterEntries(regParsed.entries.map(e => { const m = regsMeta[e.name.replace(/\[\d+\]$/, '')]; return m ? { ...e, ...m } : e; }));
        setParameterEntries(paramParsed.entries.map(e => { const m = paramsMeta[e.name.replace(/\[\d+\]$/, '')]; return m ? { ...e, ...m } : e; }));
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

  const handleResetChanges = () => setResetConfirmOpen(true);

  const handleResetConfirm = () => {
    loadProfile(selectedProfileId);
    setResetConfirmOpen(false);
    showSuccess('Changes discarded. Profile reloaded.');
  };

  const handleSaveAsNewProfile = () => {
    setNewProfileName('');
    setSaveAsDialogOpen(true);
  };

  const handleSaveAsConfirm = () => {
    const trimmedName = newProfileName.trim();
    if (!trimmedName) { showError('Profile name cannot be empty'); return; }

    const profiles = getAllProfiles();
    if (profiles.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      showError('A profile with this name already exists');
      return;
    }

    try {
      const registersContent = generateMapFile(registerEntries, true);
      const parametersContent = generateMapFile(parameterEntries, false);
      const boardTypesContent = selectedProfileId !== EMPTY_PROFILE_ID ? profiles.find(p => p.id === selectedProfileId)?.boardTypesMap : undefined;
      const regsMeta = extractMetadata(registerEntries);
      const paramsMeta = extractMetadata(parameterEntries);

      const newProfileId = createProfile(trimmedName, registersContent, parametersContent, sysCommandEntries, boardTypesContent, regsMeta, paramsMeta);

      const regParsed = parseMapFile(registersContent, true);
      const paramParsed = parseMapFile(parametersContent, false);
      setRegisterEntries(regParsed.entries.map(e => { const m = regsMeta[e.name.replace(/\[\d+\]$/, '')]; return m ? { ...e, ...m } : e; }));
      setParameterEntries(paramParsed.entries.map(e => { const m = paramsMeta[e.name.replace(/\[\d+\]$/, '')]; return m ? { ...e, ...m } : e; }));

      setHasUnsavedChanges(false);
      setPreviousProfileId(newProfileId);
      setSelectedProfileId(newProfileId);
      showSuccess(`Profile "${trimmedName}" created successfully`);
      setSaveAsDialogOpen(false);
      setNewProfileName('');
    } catch (error) {
      showError('Error creating profile');
      console.error(error);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, gap: 1.5 }}>

      {/* Connected device warning */}
      {state.connection?.connected && (
        <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', px: 0.5 }}>
          Device connected — saving will reload the map manager. You may need to reconnect for changes to take effect.
        </Typography>
      )}

      {/* Tabs + per-tab toolbar + content */}
      <Paper sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Tabs value={currentTab} onChange={(_, val) => setCurrentTab(val)}>
          <Tab label={`Registers (${registerEntries.length})`} value="registers" sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem' }} />
          <Tab label={`Parameters (${parameterEntries.length})`} value="parameters" sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem' }} />
          <Tab label={`SYS_COMMANDs (${sysCommandEntries.length})`} value="sysCommands" sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem' }} />
        </Tabs>
        <Divider />

        {/* Per-tab action toolbar */}
        <Box sx={{ px: 1.5, py: 1, display: 'flex', gap: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          {currentTab === 'sysCommands' ? (
            <>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSysCommandAddDialogOpen(true)} size="small">
                Add Entry
              </Button>
              <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={() => setSysCommandExportDialogOpen(true)} disabled={sysCommandEntries.length === 0} size="small">
                Export
              </Button>
            </>
          ) : (
            <>
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddEntry} size="small">
                Add Entry
              </Button>
              <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={handleImportFile} size="small">
                Import .map
              </Button>
              <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={() => setExportDialogOpen(true)} size="small">
                Export
              </Button>
            </>
          )}
        </Box>

        <Box sx={{ p: 1.5, flexGrow: 1, overflow: 'auto' }}>
          {currentTab === 'sysCommands' ? (
            <SysCommandsTab
              commands={sysCommandEntries}
              onCommandsChange={(commands) => { setSysCommandEntries(commands); setHasUnsavedChanges(true); }}
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

      {/* ── Dialogs ── */}
      <MapExportDialog open={exportDialogOpen} entries={currentEntries} isRegisterMap={isRegisterMap} profileName={selectedProfile?.name || 'Custom'} onClose={() => setExportDialogOpen(false)} />

      <Dialog open={unsavedChangesDialogOpen} onClose={handleUnsavedChangesCancel}>
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>You have unsaved changes. Switching profiles will discard these changes. Do you want to continue?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleUnsavedChangesCancel}>Cancel</Button>
          <Button onClick={handleUnsavedChangesConfirm} color="warning" variant="contained">Discard Changes</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={saveAsDialogOpen} onClose={() => setSaveAsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Save as New Profile</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>Enter a name for your new profile.</DialogContentText>
          <TextField
            autoFocus label="Profile Name" fullWidth value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAsConfirm(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveAsDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveAsConfirm} variant="contained" color="primary">Create Profile</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={overwriteConfirmOpen} onClose={() => setOverwriteConfirmOpen(false)}>
        <DialogTitle>Confirm Overwrite</DialogTitle>
        <DialogContent>
          <DialogContentText>Are you sure you want to overwrite the profile "{selectedProfile?.name}"? This action cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverwriteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleOverwriteConfirm} color="warning" variant="contained">Overwrite</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={resetConfirmOpen} onClose={() => setResetConfirmOpen(false)}>
        <DialogTitle>Reset Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>Discard all unsaved changes and reload the profile "{selectedProfile?.name || 'current profile'}"?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleResetConfirm} color="warning" variant="contained">Reset Changes</Button>
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
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      <input ref={fileInputRef} type="file" accept=".map" style={{ display: 'none' }} onChange={handleFileChange} />
    </Box>
  );
});

export default MapEditorPanel;
