import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Tooltip, useTheme } from '@mui/material';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { ControlInterfaceState } from '../types/shared';
import { FONT_MONO } from '../theme';

export const STATUS_BAR_HEIGHT = 32;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Sep() {
  const { palette: { custom: c } } = useTheme();
  return (
    <Box sx={{ width: '1px', height: 10, backgroundColor: c.ghostSep, mx: 1.25, flexShrink: 0 }} />
  );
}

interface ItemProps {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  tip?: string;
}

function Item({ label, value, valueColor, tip }: ItemProps) {
  const { palette: { custom: c } } = useTheme();
  const content = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
      <Typography
        component="span"
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.625rem',
          fontWeight: 500,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: c.outline,
          userSelect: 'none',
          lineHeight: 1,
        }}
      >
        {label}
      </Typography>
      <Typography
        component="span"
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: valueColor ?? c.onSurface,
          letterSpacing: '0.03em',
          lineHeight: 1,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
  return tip
    ? <Tooltip title={tip} placement="top" arrow disableInteractive>{content}</Tooltip>
    : content;
}

// 4×4px status square (Stitch "architectural grid" status indicator)
function StatusSquare({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <Box
      sx={{
        width: 5,
        height: 5,
        borderRadius: '1px',
        backgroundColor: color,
        flexShrink: 0,
        ...(pulse && {
          animation: 'sb-blink 1s step-end infinite',
          '@keyframes sb-blink': {
            '0%,100%': { opacity: 1 },
            '50%':     { opacity: 0.15 },
          },
        }),
      }}
    />
  );
}

// Format seconds → HH:MM:SS or MM:SS
function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─── StatusBar ────────────────────────────────────────────────────────────────

export default function StatusBar() {
  const theme = useTheme();
  const c = theme.palette.custom;
  const { state } = useDSHub();
  const { settings } = useSettings();

  // Live clock
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Connection uptime — tracked from moment connected becomes true
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

  // ── Derived state ───────────────────────────────────────────────────────────

  const conn      = state.connection;
  const connected = conn?.connected ?? false;

  // Connection LED color
  const connColor = state.connecting
    ? c.tertiary        // connecting → amber/tertiary
    : connected
      ? c.secondary     // online → lime/secondary
      : conn
        ? c.error       // disconnected (known device) → error
        : c.outline;    // no device → muted

  // Control state
  let ctrlLabel  = 'NO CTRL';
  let ctrlColor  = c.outline;
  if (conn) {
    const { controlState, interface: iface } = conn;
    const hasCtrl =
      (iface === 'TCP' && controlState === ControlInterfaceState.TCP_DATASTREAM) ||
      (iface === 'UDP' && controlState === ControlInterfaceState.UDP_DATASTREAM);
    switch (controlState) {
      case ControlInterfaceState.UNDECIDED:
        ctrlLabel = 'NO CTRL';  ctrlColor = c.outline; break;
      case ControlInterfaceState.TCP_DATASTREAM:
        ctrlLabel = 'TCP CTRL'; ctrlColor = hasCtrl ? c.secondary : c.tertiary; break;
      case ControlInterfaceState.UDP_DATASTREAM:
        ctrlLabel = 'UDP CTRL'; ctrlColor = hasCtrl ? c.secondary : c.tertiary; break;
      case ControlInterfaceState.TCP_CLI:
        ctrlLabel = 'TCP CLI';  ctrlColor = c.tertiary; break;
      case ControlInterfaceState.USB:
        ctrlLabel = 'USB CTRL'; ctrlColor = c.secondary; break;
      default:
        ctrlLabel = 'UNKNOWN';  ctrlColor = c.outline;
    }
  }

  // Counts
  const regCount   = state.registers.size;
  const paramCount = state.parameters.size;
  const sysRegCount = state.systemRegisters.size;
  const plotCount  = state.activePlots.size;
  const arAddrs    = state.autoRefresh.activeAddresses.size +
                     state.autoRefresh.activeParameterAddresses.size +
                     state.autoRefresh.activeSystemAddresses.size;
  const profileName = settings.mapProfiles.find(p => p.id === settings.activeMapProfileId)?.name;

  const timeStr = now.toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  const barBg     = c.surfaceLowest;
  const barBorder = `1px solid ${c.ghostSep}`;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: STATUS_BAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        px: 1.5,
        backgroundColor: barBg,
        borderTop: barBorder,
        zIndex: 1201,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ── Connection LED ────────────────────────────────────────────────── */}
      <Box
        sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: connColor,
          flexShrink: 0,
          mr: 0.75,
          boxShadow: connected ? `0 0 5px ${connColor}` : 'none',
          animation: state.connecting ? 'conn-pulse 0.9s ease-in-out infinite' : 'none',
          '@keyframes conn-pulse': {
            '0%,100%': { opacity: 1, transform: 'scale(1)' },
            '50%':      { opacity: 0.3, transform: 'scale(0.7)' },
          },
        }}
      />

      {/* ── Device identity ───────────────────────────────────────────────── */}
      {conn ? (
        <Tooltip
          title={connected ? 'Device connected' : state.connecting ? 'Connecting…' : 'Device disconnected'}
          placement="top"
          arrow
          disableInteractive
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            {conn.deviceName && (
              <Typography sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: connected ? c.onSurface : c.outline,
                letterSpacing: '0.04em',
                lineHeight: 1,
              }}>
                {conn.deviceName}
              </Typography>
            )}
            <Typography sx={{
              fontFamily: FONT_MONO,
              fontSize: '0.6875rem',
              color: c.outline,
              letterSpacing: '0.03em',
              lineHeight: 1,
            }}>
              {conn.ip}:{conn.port}
            </Typography>
            <Typography sx={{
              fontFamily: FONT_MONO,
              fontSize: '0.625rem',
              fontWeight: 700,
              color: c.primary,
              letterSpacing: '0.07em',
              lineHeight: 1,
            }}>
              {conn.interface}
            </Typography>
            <Typography sx={{
              fontFamily: FONT_MONO,
              fontSize: '0.625rem',
              fontWeight: 700,
              color: connColor,
              letterSpacing: '0.07em',
              lineHeight: 1,
            }}>
              {state.connecting ? 'CONNECTING' : connected ? 'ONLINE' : 'OFFLINE'}
            </Typography>
          </Box>
        </Tooltip>
      ) : (
        <Typography sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.625rem',
          fontWeight: 500,
          color: c.outline,
          letterSpacing: '0.07em',
          lineHeight: 1,
        }}>
          NO DEVICE
        </Typography>
      )}

      {/* ── Control state ─────────────────────────────────────────────────── */}
      {conn && (
        <>
          <Sep />
          <Tooltip title="Device control interface state" placement="top" arrow disableInteractive>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <StatusSquare color={ctrlColor} />
              <Typography sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.625rem',
                fontWeight: 700,
                color: ctrlColor,
                letterSpacing: '0.07em',
                lineHeight: 1,
              }}>
                {ctrlLabel}
              </Typography>
            </Box>
          </Tooltip>
        </>
      )}

      <Sep />

      {/* ── Data metrics ─────────────────────────────────────────────────── */}
      <Item
        label="REG"
        value={regCount}
        valueColor={regCount > 0 ? c.onSurface : c.outline}
        tip={`${regCount} register${regCount !== 1 ? 's' : ''} loaded`}
      />
      <Box sx={{ mr: 1 }} />
      <Item
        label="PAR"
        value={paramCount}
        valueColor={paramCount > 0 ? c.onSurface : c.outline}
        tip={`${paramCount} parameter${paramCount !== 1 ? 's' : ''} loaded`}
      />
      {sysRegCount > 0 && (
        <>
          <Box sx={{ mr: 1 }} />
          <Item
            label="SYS"
            value={sysRegCount}
            valueColor={c.onSurface}
            tip={`${sysRegCount} system register${sysRegCount !== 1 ? 's' : ''}`}
          />
        </>
      )}
      <Box sx={{ mr: 1 }} />
      <Item
        label="PLT"
        value={plotCount}
        valueColor={plotCount > 0 ? c.primary : c.outline}
        tip={`${plotCount} active plot series`}
      />

      {/* ── Auto-refresh ──────────────────────────────────────────────────── */}
      {state.autoRefresh.enabled && arAddrs > 0 && (
        <>
          <Sep />
          <Tooltip title={`Auto-refresh: ${arAddrs} address${arAddrs !== 1 ? 'es' : ''} @ ${state.autoRefresh.interval}ms`} placement="top" arrow disableInteractive>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <StatusSquare color={c.primary} pulse />
              <Typography sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.625rem',
                fontWeight: 700,
                color: c.primary,
                letterSpacing: '0.06em',
                lineHeight: 1,
              }}>
                AUTO
              </Typography>
              <Typography sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: c.onSurface,
                letterSpacing: '0.03em',
                lineHeight: 1,
              }}>
                {state.autoRefresh.interval}ms
              </Typography>
              <Typography sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.625rem',
                color: c.outline,
                letterSpacing: '0.03em',
                lineHeight: 1,
              }}>
                ×{arAddrs}
              </Typography>
            </Box>
          </Tooltip>
        </>
      )}

      {/* ── Scan status ───────────────────────────────────────────────────── */}
      {state.isScanning && (
        <>
          <Sep />
          <Tooltip title="Network scan in progress" placement="top" arrow disableInteractive>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <StatusSquare color={c.tertiary} pulse />
              <Typography sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.625rem',
                fontWeight: 700,
                color: c.tertiary,
                letterSpacing: '0.07em',
                lineHeight: 1,
              }}>
                SCANNING
              </Typography>
            </Box>
          </Tooltip>
        </>
      )}

      {/* ── Discovered devices (when scan has results and not currently scanning) */}
      {!state.isScanning && state.discoveredDevices.length > 0 && (
        <>
          <Sep />
          <Item
            label="FOUND"
            value={state.discoveredDevices.length}
            valueColor={c.secondary}
            tip={`${state.discoveredDevices.length} device${state.discoveredDevices.length !== 1 ? 's' : ''} on network`}
          />
        </>
      )}

      {/* ── Connection uptime ────────────────────────────────────────────── */}
      {uptimeSec !== null && uptimeSec >= 0 && (
        <>
          <Sep />
          <Tooltip title="Connection uptime" placement="top" arrow disableInteractive>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
              <Typography sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.625rem',
                fontWeight: 500,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: c.outline,
                lineHeight: 1,
              }}>
                UP
              </Typography>
              <Typography sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: c.secondary,
                letterSpacing: '0.03em',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtUptime(uptimeSec)}
              </Typography>
            </Box>
          </Tooltip>
        </>
      )}

      {/* ── Spacer ───────────────────────────────────────────────────────── */}
      <Box sx={{ flexGrow: 1 }} />

      {/* ── Unread logs ──────────────────────────────────────────────────── */}
      {state.unreadLogCount > 0 && (
        <>
          <Tooltip title={`${state.unreadLogCount} unread log entr${state.unreadLogCount !== 1 ? 'ies' : 'y'}`} placement="top" arrow disableInteractive>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <StatusSquare color={c.tertiary} pulse />
              <Typography sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.625rem',
                fontWeight: 700,
                color: c.tertiary,
                letterSpacing: '0.07em',
                lineHeight: 1,
              }}>
                LOG
              </Typography>
              <Typography sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: c.tertiary,
                letterSpacing: '0.03em',
                lineHeight: 1,
              }}>
                {state.unreadLogCount > 99 ? '99+' : state.unreadLogCount}
              </Typography>
            </Box>
          </Tooltip>
          <Sep />
        </>
      )}

      {/* ── Active map profile ───────────────────────────────────────────── */}
      {profileName && (
        <>
          <Item
            label="MAP"
            value={profileName}
            valueColor={c.onSurface}
            tip={`Active map profile: ${profileName}`}
          />
          <Sep />
        </>
      )}

      {/* ── Clock ────────────────────────────────────────────────────────── */}
      <Tooltip title="Local time" placement="top" arrow disableInteractive>
        <Typography sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.6875rem',
          fontWeight: 500,
          color: c.outline,
          letterSpacing: '0.06em',
          lineHeight: 1,
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {timeStr}
        </Typography>
      </Tooltip>
    </Box>
  );
}
