// Enhanced LogsPanel with packet analysis support
import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Paper,
  Chip
} from '@mui/material';
import {
  Clear as ClearIcon,
  Download as ExportIcon
} from '@mui/icons-material';
import { useDeviceMon } from '../contexts/DeviceMonContext';
import { LogEntry } from '../types/shared';

const getLevelColor = (level: LogEntry['level']) => {
  switch (level) {
    case 'info':
      return 'info';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    case 'success':
      return 'success';
    case 'packet':
      return 'secondary';
    default:
      return 'default';
  }
};

export default function LogsPanel() {
  const { state, actions } = useDeviceMon();
  const [levelFilter, setLevelFilter] = useState<LogEntry['level'] | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const listEndRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.logs, autoScroll]);

  // Check if user has scrolled up and disable auto-scroll
  const handleScroll = () => {
    if (listContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;
      if (!isAtBottom && autoScroll) {
        setAutoScroll(false);
      } else if (isAtBottom && !autoScroll) {
        setAutoScroll(true);
      }
    }
  };

  const filteredLogs = state.logs.filter(log => 
    levelFilter === 'all' || log.level === levelFilter
  );

  const exportLogs = () => {
    const logData = filteredLogs
      .map(log => `${new Date(log.timestamp).toISOString()}\t${log.level.toUpperCase()}\t${log.message}`)
      .join('\n');
    
    const blob = new Blob([logData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `devicemon-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLogs = () => {
    actions.clearLogs();
  };

  const levelCounts = state.logs.reduce((acc, log) => {
    acc[log.level] = (acc[log.level] || 0) + 1;
    return acc;
  }, {} as Record<LogEntry['level'], number>);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h1">
          Activity Log ({state.logs.length} entries)
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={exportLogs} title="Export Logs" disabled={state.logs.length === 0}>
            <ExportIcon />
          </IconButton>
          <IconButton onClick={clearLogs} title="Clear Logs" disabled={state.logs.length === 0}>
            <ClearIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Stats and Controls */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`Total: ${state.logs.length}`}
                size="small"
                variant="outlined"
              />
              {Object.entries(levelCounts).map(([level, count]) => (
                <Chip
                  key={level}
                  label={`${level}: ${count}`}
                  size="small"
                  color={getLevelColor(level as LogEntry['level'])}
                  variant="outlined"
                />
              ))}
            </Box>
            
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Filter Level</InputLabel>
                <Select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value as LogEntry['level'] | 'all')}
                  label="Filter Level"
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="info">Info</MenuItem>
                  <MenuItem value="success">Success</MenuItem>
                  <MenuItem value="warning">Warning</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                  <MenuItem value="packet">Packets</MenuItem>
                </Select>
              </FormControl>
              
              <FormControlLabel
                control={
                  <Switch
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    size="small"
                  />
                }
                label="Auto-scroll"
              />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Logs List */}
      <Paper sx={{ 
        height: 600, 
        overflow: 'hidden',
        backgroundColor: '#1e1e1e',
        color: '#ffffff'
      }}>
        {filteredLogs.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              {state.logs.length === 0 
                ? 'No log entries yet. Activity will appear here as the application runs.'
                : `No ${levelFilter} log entries found.`
              }
            </Typography>
          </Box>
        ) : (
          <Box
            ref={listContainerRef}
            sx={{ 
              height: '100%', 
              overflow: 'auto',
              '& .MuiListItem-root': {
                borderBottom: '1px solid',
                borderColor: 'divider',
              }
            }}
            onScroll={handleScroll}
          >
            <List dense sx={{ fontFamily: 'Consolas, Monaco, "Lucida Console", monospace' }}>
              {filteredLogs.map((log, index) => {
                const timeStr = new Date(log.timestamp).toLocaleTimeString('en-US', { 
                  hour12: false, 
                  hour: '2-digit', 
                  minute: '2-digit', 
                  second: '2-digit' 
                });
                
                return (
                  <ListItem 
                    key={`${log.timestamp}-${index}`} 
                    alignItems="flex-start"
                    sx={{ 
                      color: '#ffffff',
                      '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' }
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', gap: 1, fontFamily: 'inherit' }}>
                          <Typography 
                            variant="body2" 
                            component="span"
                            sx={{ 
                              color: '#888888',
                              fontWeight: 'normal',
                              minWidth: '70px'
                            }}
                          >
                            [{timeStr}]
                          </Typography>
                          <Typography 
                            variant="body2" 
                            component="span"
                            sx={{ 
                              color: getLevelColor(log.level) === 'info' ? '#87CEEB' :
                                     getLevelColor(log.level) === 'success' ? '#90EE90' :
                                     getLevelColor(log.level) === 'warning' ? '#FFD700' :
                                     getLevelColor(log.level) === 'error' ? '#FF6B6B' :
                                     getLevelColor(log.level) === 'secondary' ? '#BB86FC' : '#FFFFFF',
                              fontWeight: 'bold',
                              minWidth: '80px'
                            }}
                          >
                            {log.level.toUpperCase()}:
                          </Typography>
                          <Typography
                            variant="body2"
                            component="span"
                            sx={{ color: '#ffffff', flex: 1 }}
                          >
                            {log.message}
                            {log.level === 'packet' && log.packetData && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" sx={{ display: 'block', color: '#BB86FC', mb: 0.5 }}>
                                  {log.packetData.direction} | {log.packetData.interface} | {log.packetData.destination} | {log.packetData.size} bytes
                                  {log.packetData.responseTime && ` | Response Time: ${log.packetData.responseTime}ms`}
                                </Typography>
                                {log.packetData.hexData && (
                                  <Box sx={{ bgcolor: '#1a1a1a', p: 1, borderRadius: 1, mb: 0.5 }}>
                                    <Typography variant="caption" sx={{ display: 'block', color: '#4CAF50', fontWeight: 'bold', mb: 0.5 }}>
                                      HEX DUMP:
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      component="pre"
                                      sx={{
                                        color: '#E0E0E0',
                                        fontFamily: 'monospace',
                                        margin: 0,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-all'
                                      }}
                                    >
                                      {log.packetData.hexData}
                                    </Typography>
                                  </Box>
                                )}
                                {log.packetData.analysis && (
                                  <Box sx={{ bgcolor: '#1a1a1a', p: 1, borderRadius: 1 }}>
                                    <Typography variant="caption" sx={{ display: 'block', color: '#FF9800', fontWeight: 'bold', mb: 0.5 }}>
                                      PACKET ANALYSIS:
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        color: '#E0E0E0',
                                        fontFamily: 'monospace',
                                        display: 'block',
                                        whiteSpace: 'pre-wrap'
                                      }}
                                    >
                                      {log.packetData.analysis}
                                    </Typography>
                                  </Box>
                                )}
                              </Box>
                            )}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                );
              })}
              <div ref={listEndRef} />
            </List>
          </Box>
        )}
      </Paper>
    </Box>
  );
}