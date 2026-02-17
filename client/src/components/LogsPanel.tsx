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
  Download as ExportIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon
} from '@mui/icons-material';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { LogEntry } from '../types/shared';
import { FONT_MONO } from '../theme';

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
  const { state, actions } = useDSHub();
  const { settings } = useSettings();
  const [levelFilter, setLevelFilter] = useState<LogEntry['level'] | 'all'>('all');
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [isLoggingPaused, setIsLoggingPaused] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);
  const prevLogsRef = useRef<LogEntry[]>(state.logs);
  const prevScrollTopRef = useRef(0);
  const pausedLogsRef = useRef<LogEntry[]>([]);

  // Check if user is at bottom of scroll
  const checkIfAtBottom = () => {
    if (listContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listContainerRef.current;
      const threshold = 50; // pixels from bottom
      return scrollTop + clientHeight >= scrollHeight - threshold;
    }
    return true;
  };

  // Get the timestamp of the first visible log
  const getFirstVisibleLogTimestamp = (): number | null => {
    if (!listContainerRef.current) return null;

    const container = listContainerRef.current;
    const listItems = container.querySelectorAll('.log-item');

    for (let item of Array.from(listItems)) {
      const rect = (item as HTMLElement).getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      if (rect.top >= containerRect.top) {
        const timestamp = (item as HTMLElement).dataset.timestamp;
        return timestamp ? parseInt(timestamp) : null;
      }
    }
    return null;
  };

  // Smart scroll: maintain view position when logs are removed, or scroll to bottom if viewing oldest logs
  useEffect(() => {
    const prevLogs = prevLogsRef.current;
    const currentLogs = state.logs;
    const maxLogCount = settings.logSettings.maxLogCount;

    // Check if logs were removed from the beginning (buffer full)
    const logsWereRemoved = currentLogs.length === maxLogCount &&
                           prevLogs.length === maxLogCount &&
                           currentLogs.length > 0 &&
                           prevLogs.length > 0 &&
                           currentLogs[0].timestamp !== prevLogs[0].timestamp;

    if (logsWereRemoved && !isUserAtBottomRef.current && listContainerRef.current) {
      // Find which log was at the top of viewport
      const firstVisibleTimestamp = getFirstVisibleLogTimestamp();

      if (firstVisibleTimestamp) {
        // Check if this log still exists
        const logIndex = currentLogs.findIndex(log => log.timestamp === firstVisibleTimestamp);

        if (logIndex !== -1) {
          // Calculate if the log is in the "danger zone" (oldest 10%)
          const dangerZoneThreshold = Math.floor(maxLogCount * 0.1);

          if (logIndex < dangerZoneThreshold) {
            // Log is too old, scroll to bottom
            setTimeout(() => {
              if (listEndRef.current) {
                listEndRef.current.scrollIntoView({ behavior: 'smooth' });
                isUserAtBottomRef.current = true;
              }
            }, 0);
          } else {
            // Maintain scroll position - scroll to the same log
            setTimeout(() => {
              const logElement = listContainerRef.current?.querySelector(`[data-timestamp="${firstVisibleTimestamp}"]`);
              if (logElement) {
                logElement.scrollIntoView({ block: 'start', behavior: 'auto' });
              }
            }, 0);
          }
        } else {
          // Log was removed, scroll to bottom
          setTimeout(() => {
            if (listEndRef.current) {
              listEndRef.current.scrollIntoView({ behavior: 'smooth' });
              isUserAtBottomRef.current = true;
            }
          }, 0);
        }
      }
    } else if (currentLogs.length > prevLogs.length && isUserAtBottomRef.current && autoScrollEnabled) {
      // Normal case: new logs added and user is at bottom
      setTimeout(() => {
        if (listEndRef.current) {
          listEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 0);
    }

    prevLogsRef.current = currentLogs;
  }, [state.logs, autoScrollEnabled, settings.logSettings.maxLogCount]);

  // Track scroll position to determine if user is at bottom
  const handleScroll = () => {
    if (listContainerRef.current) {
      prevScrollTopRef.current = listContainerRef.current.scrollTop;
    }
    isUserAtBottomRef.current = checkIfAtBottom();
  };

  // When user manually enables auto-scroll, scroll to bottom immediately
  useEffect(() => {
    if (autoScrollEnabled && listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth' });
      isUserAtBottomRef.current = true;
    }
  }, [autoScrollEnabled]);

  // Handle pause/resume logging
  useEffect(() => {
    if (isLoggingPaused && pausedLogsRef.current.length === 0) {
      // Just paused - store current logs
      pausedLogsRef.current = state.logs;
    } else if (!isLoggingPaused) {
      // Resumed - clear paused logs
      pausedLogsRef.current = [];
    }
  }, [isLoggingPaused, state.logs]);

  // Use paused logs if paused, otherwise use current logs
  const displayLogs = isLoggingPaused ? pausedLogsRef.current : state.logs;

  const filteredLogs = displayLogs.filter(log =>
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
    a.download = `dshub-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLogs = () => {
    actions.clearLogs();
  };

  const levelCounts = displayLogs.reduce((acc, log) => {
    acc[log.level] = (acc[log.level] || 0) + 1;
    return acc;
  }, {} as Record<LogEntry['level'], number>);

  return (
    <Box>
      {/* Stats and Controls */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`Total: ${displayLogs.length}`}
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
                    checked={autoScrollEnabled}
                    onChange={(e) => setAutoScrollEnabled(e.target.checked)}
                    size="small"
                  />
                }
                label="Auto-scroll"
              />

              <IconButton
                onClick={() => setIsLoggingPaused(!isLoggingPaused)}
                title={isLoggingPaused ? "Resume Logging" : "Pause Logging"}
                size="small"
                color={isLoggingPaused ? "warning" : "default"}
              >
                {isLoggingPaused ? <PlayIcon /> : <PauseIcon />}
              </IconButton>

              <IconButton
                onClick={exportLogs}
                title="Export Logs"
                disabled={displayLogs.length === 0}
                size="small"
              >
                <ExportIcon />
              </IconButton>

              <IconButton
                onClick={clearLogs}
                title="Clear Logs"
                disabled={displayLogs.length === 0}
                size="small"
              >
                <ClearIcon />
              </IconButton>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Logs List */}
      <Paper sx={{
        height: 600,
        overflow: 'hidden',
        backgroundColor: '#0A0A0F',
        color: '#E8E8EC',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        {filteredLogs.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              {displayLogs.length === 0
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
            <List dense sx={{ fontFamily: FONT_MONO }}>
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
                    className="log-item"
                    data-timestamp={log.timestamp}
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
                              color: '#4A4A5A',
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
                              color: getLevelColor(log.level) === 'info' ? '#5CE1FF' :
                                     getLevelColor(log.level) === 'success' ? '#00E676' :
                                     getLevelColor(log.level) === 'warning' ? '#FFAB00' :
                                     getLevelColor(log.level) === 'error' ? '#FF3D71' :
                                     getLevelColor(log.level) === 'secondary' ? '#A78BFA' : '#E8E8EC',
                              fontWeight: 'bold',
                              minWidth: '80px'
                            }}
                          >
                            {log.level.toUpperCase()}:
                          </Typography>
                          <Typography
                            variant="body2"
                            component="span"
                            sx={{ color: '#E8E8EC', flex: 1 }}
                          >
                            {log.message}
                            {log.level === 'packet' && log.packetData && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" sx={{ display: 'block', color: '#A78BFA', mb: 0.5 }}>
                                  {log.packetData.direction} | {log.packetData.interface} | {log.packetData.destination} | {log.packetData.size} bytes
                                  {log.packetData.responseTime && ` | Response Time: ${log.packetData.responseTime}ms`}
                                </Typography>
                                {log.packetData.hexData && (
                                  <Box sx={{ bgcolor: '#0C0C0E', p: 1, borderRadius: 1, mb: 0.5 }}>
                                    <Typography variant="caption" sx={{ display: 'block', color: '#4CAF50', fontWeight: 'bold', mb: 0.5 }}>
                                      HEX DUMP:
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      component="pre"
                                      sx={{
                                        color: '#E0E0E0',
                                        fontFamily: FONT_MONO,
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
                                  <Box sx={{ bgcolor: '#0C0C0E', p: 1, borderRadius: 1 }}>
                                    <Typography variant="caption" sx={{ display: 'block', color: '#FF9800', fontWeight: 'bold', mb: 0.5 }}>
                                      PACKET ANALYSIS:
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        color: '#E0E0E0',
                                        fontFamily: FONT_MONO,
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