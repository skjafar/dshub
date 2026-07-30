// Enhanced LogsPanel with virtualized scrolling for performance
import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
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
  Tooltip,
  useTheme
} from '@mui/material';
import {
  Clear as ClearIcon,
  Download as ExportIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Receipt as ReceiptIcon
} from '@mui/icons-material';
import EmptyState from './EmptyState';
import PanelHeader from './PanelHeader';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { LogEntry } from '../types/shared';
import { FONT_MONO } from '../design/tokens';

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
      return 'default';
    default:
      return 'default';
  }
};

/**
 * Level colour from the theme's semantic ramp. These were hardcoded dark-mode
 * hexes, which rendered as pale-on-white and were unreadable on light themes.
 */
const useLevelTextColor = (): ((level: LogEntry['level']) => string) => {
  const { palette: { custom: c } } = useTheme();
  return (level) => {
    switch (level) {
      case 'success': return c.status.ok;
      case 'warning': return c.status.warn;
      case 'error':   return c.status.error;
      case 'packet':  return c.status.info;
      case 'info':
      default:        return c.onSurfaceVar;
    }
  };
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
  const { palette: { custom: c } } = useTheme();
  const levelColor = useLevelTextColor()(log.level);
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
        fontSize: '0.8125rem',
        '&:hover': { backgroundColor: c.ghost },
        overflow: 'hidden',
      }}
    >
      <Typography
        variant="body2"
        component="span"
        sx={{
          color: c.outline,
          fontFamily: FONT_MONO,
          fontVariantNumeric: 'tabular-nums',
          minWidth: '68px',
          flexShrink: 0,
        }}
      >
        {timeStr}
      </Typography>
      <Typography
        variant="body2"
        component="span"
        sx={{
          color: levelColor,
          fontWeight: 600,
          letterSpacing: '0.04em',
          minWidth: '68px',
          flexShrink: 0,
        }}
      >
        {log.level.toUpperCase()}
      </Typography>
      <Box sx={{ color: 'text.primary', flex: 1, overflow: 'hidden' }}>
        <Typography variant="body2" component="span" sx={{ color: 'text.primary' }}>
          {log.message}
        </Typography>
        {log.level === 'packet' && log.packetData && (
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="caption" sx={{ display: 'block', color: c.status.info, mb: 0.5 }}>
              {log.packetData.direction} · {log.packetData.interface} · {log.packetData.destination} · {log.packetData.size} bytes
              {log.packetData.responseTime !== undefined && ` · ${log.packetData.responseTime} ms`}
            </Typography>
            {log.packetData.hexData && (
              <Box sx={{ bgcolor: c.surfaceLowest, border: `1px solid ${c.ghost}`, p: 0.75, borderRadius: 1, mb: 0.5 }}>
                <Typography variant="label" sx={{ display: 'block', color: c.onSurfaceVar, mb: 0.25 }}>
                  Hex dump
                </Typography>
                <Typography
                  variant="caption"
                  component="pre"
                  sx={{ color: c.onSurface, fontFamily: FONT_MONO, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                >
                  {log.packetData.hexData}
                </Typography>
              </Box>
            )}
            {log.packetData.analysis && (
              <Box sx={{ bgcolor: c.surfaceLowest, border: `1px solid ${c.ghost}`, p: 0.75, borderRadius: 1 }}>
                <Typography variant="label" sx={{ display: 'block', color: c.onSurfaceVar, mb: 0.25 }}>
                  Packet analysis
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: c.onSurface, fontFamily: FONT_MONO, display: 'block', whiteSpace: 'pre-wrap' }}
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
  const { palette: { custom: c } } = useTheme();
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

  // Virtual scroll state. The viewport was a fixed 600px regardless of window
  // size, so a maximised window showed the same small log slot as a small one.
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const OVERSCAN = 5;
  // The scroll container only exists when there are rows to show, so the
  // measuring effect must re-run when that flips.
  const hasVisibleLogs = filteredLogs.length > 0;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasVisibleLogs]);

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
    const bottomEdge = scrollTop + viewportHeight;
    let idx = startIndex;
    while (idx < offsets.length && offsets[idx] < bottomEdge) {
      idx++;
    }
    return Math.min(offsets.length, idx + OVERSCAN);
  }, [scrollTop, startIndex, rowMeta, viewportHeight]);

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
      <PanelHeader
        title="Activity Logs"
        subtitle={
          <Box component="span" sx={{ display: 'inline-flex', gap: 1, flexWrap: 'wrap' }}>
            <span>{displayLogs.length} total</span>
            {Object.entries(levelCounts).map(([level, count]) => (
              <span key={level}>· {level} {count}</span>
            ))}
          </Box>
        }
        actions={
          <>
            <FormControl size="small" sx={{ minWidth: 128 }}>
              <InputLabel>Level</InputLabel>
              <Select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as LogEntry['level'] | 'all')}
                label="Level"
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
              label={<Typography variant="body2">Auto-scroll</Typography>}
              sx={{ ml: 0, whiteSpace: 'nowrap' }}
            />
          </>
        }
        status={
          <>
            <Tooltip title={isLoggingPaused ? 'Resume logging' : 'Pause logging'}>
              <IconButton
                onClick={() => setIsLoggingPaused(!isLoggingPaused)}
                aria-label={isLoggingPaused ? 'Resume logging' : 'Pause logging'}
                size="small"
                color={isLoggingPaused ? 'warning' : 'default'}
              >
                {isLoggingPaused ? <PlayIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Export visible entries">
              <span>
                <IconButton onClick={exportLogs} aria-label="Export logs" disabled={displayLogs.length === 0} size="small">
                  <ExportIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Clear log">
              <span>
                <IconButton onClick={actions.clearLogs} aria-label="Clear logs" disabled={displayLogs.length === 0} size="small">
                  <ClearIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </>
        }
      />

      {/* Logs List — virtualized */}
      <Paper sx={{
        // Fill the remaining viewport rather than a fixed slot.
        height: 'calc(100vh - 260px)',
        minHeight: 320,
        overflow: 'hidden',
        backgroundColor: c.surfaceLowest,
        color: 'text.primary',
        border: `1px solid ${c.ghost}`,
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
