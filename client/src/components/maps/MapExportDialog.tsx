import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Tabs,
  Tab,
  TextField,
  Alert,
  IconButton,
  Tooltip
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import { MapEntry } from '../../maps/mapParser';
import { generateMapFile } from '../../utils/mapFileGenerator';
import { generateHeaderFile } from '../../utils/headerFileGenerator';
import { useToast } from '../ToastNotification';
import { FONT_MONO } from '../../theme';

interface MapExportDialogProps {
  open: boolean;
  entries: MapEntry[];
  isRegisterMap: boolean;
  profileName: string;
  onClose: () => void;
}

export default function MapExportDialog({
  open,
  entries,
  isRegisterMap,
  profileName,
  onClose
}: MapExportDialogProps) {
  const [selectedTab, setSelectedTab] = useState(0);
  const { showSuccess } = useToast();

  const mapFileContent = useMemo(
    () => generateMapFile(entries, isRegisterMap),
    [entries, isRegisterMap]
  );

  const headerFileContent = useMemo(
    () => generateHeaderFile(entries, isRegisterMap, profileName),
    [entries, isRegisterMap, profileName]
  );

  const mapFileName = isRegisterMap ? 'registers.map' : 'parameters.map';
  const headerFileName = isRegisterMap ? 'ds_register_names.h' : 'ds_parameter_names.h';

  const handleCopy = (content: string, fileType: string) => {
    navigator.clipboard.writeText(content);
    showSuccess(`${fileType} content copied to clipboard`);
  };

  const handleDownload = (content: string, fileName: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showSuccess(`${fileName} downloaded successfully`);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Export Map</DialogTitle>
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={selectedTab} onChange={(_, val) => setSelectedTab(val)}>
            <Tab label=".map File" />
            <Tab label="C Header (.h)" />
          </Tabs>
        </Box>

        {selectedTab === 0 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              This is the .map file format used by DSHub. Upload this file to create or update map profiles.
            </Alert>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={() => handleCopy(mapFileContent, '.map file')}
                size="small"
              >
                Copy
              </Button>
              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={() => handleDownload(mapFileContent, mapFileName)}
                size="small"
              >
                Download {mapFileName}
              </Button>
            </Box>
            <TextField
              multiline
              fullWidth
              value={mapFileContent}
              InputProps={{
                readOnly: true,
                sx: { fontFamily: FONT_MONO, fontSize: '0.875rem' }
              }}
              rows={15}
            />
          </Box>
        )}

        {selectedTab === 1 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              This is the C header file format for firmware integration. Use this in your embedded C/C++ projects.
            </Alert>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={() => handleCopy(headerFileContent, 'C header')}
                size="small"
              >
                Copy
              </Button>
              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={() => handleDownload(headerFileContent, headerFileName)}
                size="small"
              >
                Download {headerFileName}
              </Button>
            </Box>
            <TextField
              multiline
              fullWidth
              value={headerFileContent}
              InputProps={{
                readOnly: true,
                sx: { fontFamily: FONT_MONO, fontSize: '0.875rem' }
              }}
              rows={15}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
