// Enhanced LogsPanel with virtualized scrolling for performance
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
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
  PlayArrow as PlayIcon,
  Receipt as ReceiptIcon
} from '@mui/icons-material';
import EmptyState from './EmptyState';
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

const getLevelTextColor = (level: LogEntry['level']): string => {
  switch (level) {
    case 'info': return '#5CE1FF';
    case 'success': return '#00E676';
    case 'warning': return '#FFAB00';
    case 'error': return '#FF3D71';
    case 'packet': return '#A78BFA';
    default: return '#E8E8EC';
  }
};

// Row heights for virtual scrolling
const SIMPLE_ROW_HEIGHT = 36;
const PACKET_ROW_HEIGHT = 200;

function getRowHeight(log: LogEntry): number {
  if (log.level === 'packet' && log.packetData) {
    return PACKET_ROW_HEIGHT;
  }
  return SIMPLE_ROW_HEIGHT;
}

// Virtualized log row component
function LogRow({ log, style }: { log: LogEntry; style: React.CSSProperties }) {
  const timeStr = new Date(log.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <Box
      className="log-item"
      data-timestamp={log.timestamp}
      style={style}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        px: 2,
        py: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        fontFamily: FONT_MONO,
        fontSize: '0.875rem',
        '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
        overflow: 'hidden',
      }}
    >
      <Typography
        variant="body2"
        component="span"
        sx={{
          color: '#4A4A5A',
          fontWeight: 'normal',
          minWidth: '70px',
          flexShrink: 0,
        }}
      >
        [{timeStr}]
      </Typography>
      <Typography
        variant="body2"
        component="span"
        sx={{
          color: getLevelTextColor(log.level),
          fontWeight: 'bold',
          minWidth: '80px',
          flexShrink: 0,
        }}
      >
        {log.level.toUpperCase()}:
      </Typography>
      <Box sx={{ color: '#E8E8EC', flex: 1, overflow: 'hidden' }}>
        <Typography variant="body2" component="span" sx={{ color: '#E8E8EC' }}>
          {log.message}
        </Typography>
        {log.level === 'packet' && log.packetData && (
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#A78BFA', mb: 0.5 }}>
              {log.packetData.direction} | {log.packetData.interface} | {log.packetData.destination} | {log.packetData.size} bytes
              {log.packetData.responseTime && ` | Response Time: ${log.packetData.responseTime}ms`}
            </Typography>
            {log.packetData.hexData && (
              <Box sx={{ bgcolor: '#0C0C0E', p: 0.5, borderRadius: 1, mb: 0.5 }}>
                <Typography variant="caption" sx={{ display: 'block', color: '#4CAF50', fontWeight: 'bold', mb: 0.25 }}>
                  HEX DUMP:
                </Typography>
                <Typography
                  variant="caption"
                  component="pre"
                  sx={{ color: '#E0E0E0', fontFamily: FONT_MONO, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                >
                  {log.packetData.hexData}
                </Typography>
              </Box>
            )}
            {log.packetData.analysis && (
              <Box sx={{ bgcolor: '#0C0C0E', p: 0.5, borderRadius: 1 }}>
                <Typography variant="caption" sx={{ display: 'block', color: '#FF9800', fontWeight: 'bold', mb: 0.25 }}>
                  PACKET ANALYSIS:
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: '#E0E0E0', fontFamily: FONT_MONO, display: 'block', whiteSpace: 'pre-wrap' }}
                >
                  {log.packetData.analysis}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default function LogsPanel() {
  const { state, actions } = useDSHub();
  const { settings } = useSettings();
  const [levelFilter, setLevelFilter] = useState<LogEntry['level'] | 'all'>('all');
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [isLoggingPaused, setIsLoggingPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pausedLogsRef = useRef<LogEntry[]>([]);

  // Handle pause/resume logging
  useEffect(() => {
    if (isLoggingPaused && pausedLogsRef.current.length === 0) {
      pausedLogsRef.current = state.logs;
    } else if (!isLoggingPaused) {
      pausedLogsRef.current = [];
    }
  }, [isLoggingPaused, state.logs]);

  // Use paused logs if paused, otherwise use current logs
  const displayLogs = isLoggingPaused ? pausedLogsRef.current : state.logs;

  const filteredLogs = useMemo(() =>
    displayLogs.filter(log => levelFilter === 'all' || log.level === levelFilter),
    [displayLogs, levelFilter]
  );

  // Precompute row offsets for variable-height virtual scrolling
  const rowMeta = useMemo(() => {
    const offsets: number[] = [];
    let total = 0;
    for (const log of filteredLogs) {
      offsets.push(total);
      total += getRowHeight(log);
    }
    return { offsets, totalHeight: total };
  }, [filteredLogs]);

  // Virtual scroll state
  const [scrollTop, setScrollTop] = useState(0);
  const CONTAINER_HEIGHT = 600;
  const OVERSCAN = 5;

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScrollEnabled && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScrollEnabled]);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  // Binary search for first visible row
  const startIndex = useMemo(() => {
    const { offsets } = rowMeta;
    if (offsets.length === 0) return 0;
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (offsets[mid] + getRowHeight(filteredLogs[mid]) <= scrollTop) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return Math.max(0, lo - OVERSCAN);
  }, [scrollTop, rowMeta, filteredLogs]);

  const endIndex = useMemo(() => {
    const { offsets } = rowMeta;
    const bottomEdge = scrollTop + CONTAINER_HEIGHT;
    let idx = startIndex;
    while (idx < offsets.length && offsets[idx] < bottomEdge) {
      idx++;
    }
    return Math.min(offsets.length, idx + OVERSCAN);
  }, [scrollTop, startIndex, rowMeta]);

  // Render only visible rows
  const visibleRows = useMemo(() => {
    const rows: React.ReactNode[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      const log = filteredLogs[i];
      rows.push(
        <LogRow
          key={`${log.timestamp}-${i}`}
          log={log}
          style={{
            position: 'absolute',
            top: rowMeta.offsets[i],
            left: 0,
            right: 0,
            height: getRowHeight(log),
          }}
        />
      );
    }
    return rows;
  }, [startIndex, endIndex, filteredLogs, rowMeta]);

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

  const levelCounts = useMemo(() =>
    displayLogs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    }, {} as Record<LogEntry['level'], number>),
    [displayLogs]
  );

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
                aria-label={isLoggingPaused ? "Resume logging" : "Pause logging"}
                title={isLoggingPaused ? "Resume Logging" : "Pause Logging"}
                size="small"
                color={isLoggingPaused ? "warning" : "default"}
              >
                {isLoggingPaused ? <PlayIcon /> : <PauseIcon />}
              </IconButton>

              <IconButton
                onClick={exportLogs}
                aria-label="Export logs"
                title="Export Logs"
                disabled={displayLogs.length === 0}
                size="small"
              >
                <ExportIcon />
              </IconButton>

              <IconButton
                onClick={actions.clearLogs}
                aria-label="Clear logs"
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

      {/* Logs List — virtualized */}
      <Paper sx={{
        height: CONTAINER_HEIGHT,
        overflow: 'hidden',
        backgroundColor: '#0A0A0F',
        color: '#E8E8EC',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        {filteredLogs.length === 0 ? (
          <EmptyState
            icon={<ReceiptIcon />}
            title={displayLogs.length === 0 ? 'No Log Entries' : `No ${levelFilter} Entries`}
            subtitle={displayLogs.length === 0
              ? 'Activity will appear here as the application runs.'
              : 'Try changing the filter level to see other entries.'}
          />
        ) : (
          <Box
            ref={containerRef}
            onScroll={handleScroll}
            sx={{ height: '100%', overflow: 'auto' }}
          >
            <Box sx={{ position: 'relative', height: rowMeta.totalHeight }}>
              {visibleRows}
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
