import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Button, Chip, useTheme } from '@mui/material';
import {
  Build as ControlTakeIcon,
  PowerSettingsNew as DisconnectIcon,
  LinkOff as LinkOffIcon,
} from '@mui/icons-material';
import { useDSHub } from '../contexts/DSHubContext';
import EmptyState from './EmptyState';
import { ControlInterfaceState, InterfaceType, LogEntry } from '../types/shared';
import { FONT_MONO, FONT_BODY, FONT_HEADLINE } from '../theme';
import { hexCh } from '../appThemes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

interface StatTileProps {
  label: string;
  value: number;
  activeColor: string;
}

function StatTile({ label, value, activeColor }: StatTileProps) {
  const { palette: { custom: c } } = useTheme();
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0.5,
      px: 2,
      py: 1.5,
      backgroundColor: c.surfaceContainer,
      border: `1px solid ${c.ghost}`,
      borderRadius: '4px',
    }}>
      <Typography sx={{
        fontFamily: FONT_BODY,
        fontSize: '0.5625rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: c.outline,
        lineHeight: 1,
        userSelect: 'none',
      }}>
        {label}
      </Typography>
      <Typography sx={{
        fontFamily: FONT_MONO,
        fontSize: '1.5rem',
        fontWeight: 700,
        color: value > 0 ? activeColor : c.onSurfaceVar,
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </Typography>
    </Box>
  );
}

// ─── Detail Row ───────────────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  const { palette: { custom: c } } = useTheme();
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
      <Typography sx={{
        fontFamily: FONT_BODY,
        fontSize: '0.6875rem',
        color: c.outline,
        flexShrink: 0,
        mr: 2,
        userSelect: 'none',
      }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>{children}</Box>
    </Box>
  );
}

// ─── Activity log row ─────────────────────────────────────────────────────────

function LogRow({ entry }: { entry: LogEntry }) {
  const { palette: { custom: c } } = useTheme();

  const levelColor =
    entry.level === 'error'   ? c.error    :
    entry.level === 'warning' ? c.tertiary :
    entry.level === 'success' ? c.secondary :
    c.outline;

  const catLabel = entry.category === 'autoRefresh' ? 'AUTO' : entry.category.toUpperCase().slice(0, 4);

  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 1,
      py: 0.5,
      borderBottom: `1px solid ${c.ghost}`,
      '&:last-child': { borderBottom: 'none' },
    }}>
      <Typography sx={{
        fontFamily: FONT_MONO,
        fontSize: '0.5625rem',
        color: c.outlineVar,
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.6,
      }}>
        {fmtTime(entry.timestamp)}
      </Typography>
      <Typography sx={{
        fontFamily: FONT_MONO,
        fontSize: '0.5rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        color: levelColor,
        flexShrink: 0,
        width: 28,
        lineHeight: 1.6,
      }}>
        {catLabel}
      </Typography>
      <Typography sx={{
        fontFamily: FONT_BODY,
        fontSize: '0.6875rem',
        color: entry.level === 'error' ? c.error : entry.level === 'warning' ? c.tertiary : c.onSurfaceVar,
        lineHeight: 1.5,
        wordBreak: 'break-word',
      }}>
        {entry.message}
      </Typography>
    </Box>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeviceDashboard() {
  const { palette: { custom: c } } = useTheme();
  const { state, actions } = useDSHub();

  // Uptime counter — mirrors StatusBar pattern
  const connectedAtRef = useRef<number | null>(null);
  const [uptimeSec, setUptimeSec] = useState<number | null>(null);

  useEffect(() => {
    if (state.connection?.connected) {
      if (connectedAtRef.current === null) {
        connectedAtRef.current = Date.now();
        setUptimeSec(0);
      }
    } else {
      connectedAtRef.current = null;
      setUptimeSec(null);
    }
  }, [state.connection?.connected]);

  useEffect(() => {
    if (connectedAtRef.current === null) return;
    const id = setInterval(() => {
      if (connectedAtRef.current !== null) {
        setUptimeSec(Math.floor((Date.now() - connectedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state.connection?.connected]);

  // ── No device ───────────────────────────────────────────────────────────────

  if (!state.connection) {
    return (
      <EmptyState
        icon={<LinkOffIcon />}
        title="No Device Connected"
        subtitle="Use the Device Scanner to discover and connect to a device on your network."
      />
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const conn      = state.connection;
  const connected = conn.connected;

  const canControl =
    connected && (
      (conn.interface === InterfaceType.TCP && conn.controlState === ControlInterfaceState.TCP_DATASTREAM) ||
      (conn.interface === InterfaceType.UDP && conn.controlState === ControlInterfaceState.UDP_DATASTREAM)
    );

  const controlLabel = (() => {
    switch (conn.controlState) {
      case ControlInterfaceState.TCP_DATASTREAM: return 'TCP Datastream';
      case ControlInterfaceState.UDP_DATASTREAM: return 'UDP Datastream';
      case ControlInterfaceState.TCP_CLI:        return 'TCP CLI (read-only)';
      case ControlInterfaceState.USB:            return 'USB CLI (read-only)';
      default:                                   return 'No control';
    }
  })();

  const connDotColor = state.connecting ? c.tertiary : connected ? c.secondary : c.error;

  const arAddrs =
    state.autoRefresh.activeAddresses.size +
    state.autoRefresh.activeParameterAddresses.size +
    state.autoRefresh.activeSystemAddresses.size;

  const recentLogs = [...state.logs]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* ── Section 1: Device Hero Band ─────────────────────────────────── */}
      <Box sx={{
        backgroundColor: c.surfaceContainer,
        border: `1px solid ${c.ghost}`,
        borderRadius: '6px',
        px: 2.5,
        py: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
      }}>
        {/* Status dot */}
        <Box sx={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          backgroundColor: connDotColor,
          flexShrink: 0,
          boxShadow: connected ? `0 0 6px ${connDotColor}` : 'none',
          ...(state.connecting && {
            animation: 'dd-pulse 0.9s ease-in-out infinite',
            '@keyframes dd-pulse': {
              '0%,100%': { opacity: 1, transform: 'scale(1)' },
              '50%':      { opacity: 0.25, transform: 'scale(0.65)' },
            },
          }),
        }} />

        {/* Device identity */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, flexGrow: 1, flexWrap: 'wrap' }}>
          {conn.deviceName && (
            <Typography sx={{
              fontFamily: FONT_HEADLINE,
              fontSize: '1rem',
              fontWeight: 700,
              color: connected ? c.onSurface : c.outline,
              letterSpacing: '-0.01em',
              lineHeight: 1,
            }}>
              {conn.deviceName}
            </Typography>
          )}
          <Typography sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.8125rem',
            color: c.outline,
            letterSpacing: '0.03em',
            lineHeight: 1,
          }}>
            {conn.ip}:{conn.port}
          </Typography>
          <Typography sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.6875rem',
            fontWeight: 700,
            color: c.primary,
            letterSpacing: '0.07em',
            lineHeight: 1,
          }}>
            {conn.interface}
          </Typography>
          <Typography sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: state.connecting ? c.tertiary : connected ? c.secondary : c.error,
            letterSpacing: '0.06em',
            lineHeight: 1,
          }}>
            {state.connecting ? 'CONNECTING' : connected ? 'ONLINE' : 'OFFLINE'}
          </Typography>

          {/* Uptime */}
          {uptimeSec !== null && uptimeSec >= 0 && (
            <Typography sx={{
              fontFamily: FONT_MONO,
              fontSize: '0.6875rem',
              color: c.outline,
              letterSpacing: '0.04em',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              UP {fmtUptime(uptimeSec)}
            </Typography>
          )}

          {/* Control state */}
          <Typography sx={{
            fontFamily: FONT_BODY,
            fontSize: '0.6875rem',
            color: canControl ? c.secondary : c.outlineVar,
            lineHeight: 1,
          }}>
            · {controlLabel}
          </Typography>
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          {!canControl && connected && (
            <Button
              size="small"
              variant="contained"
              startIcon={<ControlTakeIcon sx={{ fontSize: '14px !important' }} />}
              onClick={actions.takeControl}
              sx={{
                fontFamily: FONT_BODY,
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.03em',
                textTransform: 'none',
                backgroundColor: `rgba(${hexCh(c.primary)},0.12)`,
                color: c.primary,
                border: `1px solid rgba(${hexCh(c.primary)},0.25)`,
                boxShadow: 'none',
                '&:hover': {
                  backgroundColor: `rgba(${hexCh(c.primary)},0.18)`,
                  boxShadow: 'none',
                },
              }}
            >
              Take Control
            </Button>
          )}
          {connected && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<DisconnectIcon sx={{ fontSize: '14px !important' }} />}
              onClick={actions.disconnectDevice}
              sx={{
                fontFamily: FONT_BODY,
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.03em',
                textTransform: 'none',
                color: c.error,
                borderColor: `rgba(${hexCh(c.error)},0.30)`,
                '&:hover': {
                  borderColor: c.error,
                  backgroundColor: `rgba(${hexCh(c.error)},0.06)`,
                },
              }}
            >
              Disconnect
            </Button>
          )}
        </Box>
      </Box>

      {/* ── Section 2: Stat Tiles ────────────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
        <StatTile label="Registers"     value={state.registers.size}    activeColor={c.primary} />
        <StatTile label="Parameters"    value={state.parameters.size}   activeColor={c.primary} />
        <StatTile label="Active Plots"  value={state.activePlots.size}  activeColor={c.secondary} />
        <StatTile label="Auto-refresh"  value={arAddrs}                 activeColor={c.tertiary} />
      </Box>

      {/* ── Section 3: Two-column body ───────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.5fr' }, gap: 2, alignItems: 'start' }}>

        {/* Left — Connection Details */}
        <Box sx={{
          backgroundColor: c.surfaceContainer,
          border: `1px solid ${c.ghost}`,
          borderRadius: '6px',
          px: 2,
          py: 1.75,
        }}>
          <Typography sx={{
            fontFamily: FONT_BODY,
            fontSize: '0.5625rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: c.outline,
            mb: 1.5,
            userSelect: 'none',
          }}>
            Connection
          </Typography>

          <DetailRow label="Interface">
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem', fontWeight: 600, color: c.primary }}>
              {conn.interface}
            </Typography>
          </DetailRow>

          <DetailRow label="Control">
            <Box sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: canControl ? c.secondary : c.tertiary,
              flexShrink: 0,
            }} />
            <Typography sx={{ fontFamily: FONT_BODY, fontSize: '0.8125rem', color: canControl ? c.secondary : c.onSurfaceVar }}>
              {controlLabel}
            </Typography>
          </DetailRow>

          <DetailRow label="Address">
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem', color: c.onSurface }}>
              {conn.ip}
            </Typography>
          </DetailRow>

          <DetailRow label="Port">
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.8125rem', color: c.onSurface }}>
              {conn.port}
            </Typography>
          </DetailRow>

          <DetailRow label="Status">
            <Box sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              px: 0.75,
              py: 0.25,
              borderRadius: '3px',
              backgroundColor: connected
                ? `rgba(${hexCh(c.secondary)},0.10)`
                : `rgba(${hexCh(c.error)},0.10)`,
              border: `1px solid ${connected
                ? `rgba(${hexCh(c.secondary)},0.25)`
                : `rgba(${hexCh(c.error)},0.25)`}`,
            }}>
              <Typography sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: connected ? c.secondary : c.error,
              }}>
                {connected ? 'CONNECTED' : 'DISCONNECTED'}
              </Typography>
            </Box>
          </DetailRow>

          {/* Control action */}
          {canControl ? (
            <Box sx={{ mt: 1.5 }}>
              <Chip
                label="Write operations enabled"
                size="small"
                sx={{
                  fontFamily: FONT_BODY,
                  fontSize: '0.625rem',
                  height: 20,
                  borderRadius: '3px',
                  backgroundColor: `rgba(${hexCh(c.secondary)},0.10)`,
                  border: `1px solid rgba(${hexCh(c.secondary)},0.25)`,
                  color: c.secondary,
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            </Box>
          ) : (
            connected && (
              <Box sx={{ mt: 1.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ControlTakeIcon sx={{ fontSize: '13px !important' }} />}
                  onClick={actions.takeControl}
                  fullWidth
                  sx={{
                    fontFamily: FONT_BODY,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    letterSpacing: '0.03em',
                    textTransform: 'none',
                    color: c.primary,
                    borderColor: `rgba(${hexCh(c.primary)},0.30)`,
                    '&:hover': {
                      borderColor: c.primary,
                      backgroundColor: `rgba(${hexCh(c.primary)},0.06)`,
                    },
                  }}
                >
                  Take Control
                </Button>
              </Box>
            )
          )}
        </Box>

        {/* Right — Activity Feed */}
        <Box sx={{
          backgroundColor: c.surfaceContainer,
          border: `1px solid ${c.ghost}`,
          borderRadius: '6px',
          px: 2,
          py: 1.75,
        }}>
          <Typography sx={{
            fontFamily: FONT_BODY,
            fontSize: '0.5625rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: c.outline,
            mb: 1.5,
            userSelect: 'none',
          }}>
            Activity Feed
          </Typography>

          {recentLogs.length === 0 ? (
            <Typography sx={{ fontFamily: FONT_BODY, fontSize: '0.6875rem', color: c.outline }}>
              No activity yet
            </Typography>
          ) : (
            <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
              {recentLogs.map((entry, i) => (
                <LogRow key={i} entry={entry} />
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
