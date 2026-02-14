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
  Alert
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import { SysCommand } from '../../types/settings';
import { generateSysCommandMapFile, generateSysCommandHeaderFile } from '../../utils/sysCommandFileGenerator';
import { useToast } from '../ToastNotification';

interface SysCommandExportDialogProps {
  open: boolean;
  commands: SysCommand[];
  profileName: string;
  onClose: () => void;
}

export default function SysCommandExportDialog({
  open,
  commands,
  profileName,
  onClose
}: SysCommandExportDialogProps) {
  const [selectedTab, setSelectedTab] = useState(0);
  const { showSuccess } = useToast();

  const mapFileContent = useMemo(
    () => generateSysCommandMapFile(commands),
    [commands]
  );

  const headerFileContent = useMemo(
    () => generateSysCommandHeaderFile(commands, profileName),
    [commands, profileName]
  );

  const mapFileName = 'syscommands.map';
  const headerFileName = 'ds_sys_commands.h';

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
      <DialogTitle>Export SYS_COMMANDs</DialogTitle>
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
              This is the .map file format for SYS_COMMANDs. You can use this for documentation or future import functionality.
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
                sx: { fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace', fontSize: '0.875rem' }
              }}
              rows={15}
            />
          </Box>
        )}

        {selectedTab === 1 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              This is the C header file with an enum for firmware integration. Use this in your embedded C/C++ projects.
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
                sx: { fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace', fontSize: '0.875rem' }
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
