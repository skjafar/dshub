import React from 'react';
import { Box, Typography, IconButton, Tooltip, Chip, useTheme } from '@mui/material';
import {
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';
import { MapEntry, DataForm, DataAccessPermit } from '../maps/mapParser';
import { int32ToFloat, formatFloat } from '../utils/floatConversion';
import { FONT_MONO, FONT_BODY, FONT_HEADLINE } from '../theme';
import { hexCh } from '../appThemes';

export const INSPECTOR_WIDTH = 296;


// ─── Formatters ───────────────────────────────────────────────────────────────

function toHex32(raw: number): string {
  return '0x' + (raw >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function toBin32(raw: number): string {
  return (raw >>> 0).toString(2).padStart(32, '0');
}

function decSigned(value: number): string {
  return (value | 0).toString(10);
}

function decUnsigned(value: number): string {
  return (value >>> 0).toString(10);
}

// ─── Bit visual row ───────────────────────────────────────────────────────────
// Shows one byte (8 bits) split into two nibbles, with tooltips per bit.

function BitRow({ byte, highBit }: { byte: number[]; highBit: number }) {
  const { palette: { custom: c } } = useTheme();
  return (
    <Box sx={{ display: 'flex', gap: '3px' }}>
      {[0, 1].map((nibble) => (
        <Box key={nibble} sx={{ display: 'flex', gap: '1.5px' }}>
          {byte.slice(nibble * 4, nibble * 4 + 4).map((bit, i) => {
            const pos = highBit - (nibble * 4 + i);
            return (
              <Tooltip
                key={i}
                title={`Bit ${pos} = ${bit}`}
                placement="top"
                arrow
                disableInteractive
              >
                <Box
                  sx={{
                    width: 16,
                    height: 20,
                    borderRadius: '1px',
                    backgroundColor: bit ? `rgba(${hexCh(c.primary)},0.12)` : c.surfaceHigh,
                    border: `1px solid ${bit ? `rgba(${hexCh(c.primary)},0.30)` : c.ghost}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    cursor: 'default',
                  }}
                >
                  <Typography sx={{
                    fontFamily: FONT_MONO,
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    color: bit ? c.primary : c.outline,
                    lineHeight: 1,
                    userSelect: 'none',
                  }}>
                    {bit}
                  </Typography>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

// Full 32-bit breakdown split by byte rows (31→24, 23→16, 15→8, 7→0).
function BitVisualization({ value }: { value: number }) {
  const { palette: { custom: c } } = useTheme();
  const bits = toBin32(value).split('').map(Number);
  const bytes = [
    { data: bits.slice(0, 8),  high: 31 },
    { data: bits.slice(8, 16), high: 23 },
    { data: bits.slice(16, 24), high: 15 },
    { data: bits.slice(24, 32), high: 7 },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {bytes.map(({ data, high }) => (
        <Box key={high}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: '2px', px: '1px' }}>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.5rem', color: c.outline, lineHeight: 1 }}>
              {high}
            </Typography>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.5rem', color: c.outline, lineHeight: 1 }}>
              {high - 7}
            </Typography>
          </Box>
          <BitRow byte={data} highBit={high} />
        </Box>
      ))}
    </Box>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { palette: { custom: c } } = useTheme();
  return (
    <Typography sx={{
      fontFamily: FONT_BODY,
      fontSize: '0.625rem',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: c.outline,
      mb: 0.75,
      userSelect: 'none',
    }}>
      {children}
    </Typography>
  );
}

function Sep() {
  const { palette: { custom: c } } = useTheme();
  return <Box sx={{ borderTop: `1px solid ${c.ghost}`, my: 1.25 }} />;
}

function ValueRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const { palette: { custom: c } } = useTheme();
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
      <Typography sx={{
        fontFamily: FONT_BODY,
        fontSize: '0.6875rem',
        color: c.outline,
        letterSpacing: '0.03em',
        flexShrink: 0,
        mr: 1,
        userSelect: 'none',
      }}>
        {label}
      </Typography>
      <Typography sx={{
        fontFamily: FONT_MONO,
        fontSize: '0.75rem',
        fontWeight: 600,
        color: highlight ? c.primary : c.onSurface,
        letterSpacing: '0.02em',
        wordBreak: 'break-all',
        textAlign: 'right',
      }}>
        {value}
      </Typography>
    </Box>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  const { palette: { custom: c } } = useTheme();
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
      <Typography sx={{
        fontFamily: FONT_BODY,
        fontSize: '0.6875rem',
        color: c.outline,
        letterSpacing: '0.02em',
        flexShrink: 0,
        mr: 1,
        userSelect: 'none',
      }}>
        {label}
      </Typography>
      {typeof value === 'string' ? (
        <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.6875rem', color: c.onSurfaceVar, textAlign: 'right', wordBreak: 'break-all' }}>
          {value}
        </Typography>
      ) : (
        <Box sx={{ textAlign: 'right' }}>{value}</Box>
      )}
    </Box>
  );
}

function ActionButton({
  icon, label, active, disabled, onClick, tip,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  tip: string;
}) {
  const { palette: { custom: c } } = useTheme();
  const ch = hexCh(c.primary);
  return (
    <Tooltip title={tip} placement="top" arrow disableInteractive>
      <Box
        component="button"
        onClick={disabled ? undefined : onClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          px: 1,
          py: 0.5,
          borderRadius: '4px',
          border: `1px solid ${active ? `rgba(${ch},0.25)` : c.ghost20}`,
          backgroundColor: active ? `rgba(${ch},0.08)` : 'transparent',
          color: disabled ? c.outline : active ? c.primary : c.onSurfaceVar,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: FONT_BODY,
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          opacity: disabled ? 0.38 : 1,
          transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
          '&:hover': disabled ? {} : {
            backgroundColor: active ? `rgba(${ch},0.12)` : `rgba(${ch},0.06)`,
            color: c.primary,
            borderColor: `rgba(${ch},0.30)`,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', fontSize: 14 }}>{icon}</Box>
        {label}
      </Box>
    </Tooltip>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface RegisterInspectorProps {
  open: boolean;
  onClose: () => void;
  mapEntry: MapEntry | undefined;
  value: number | null;
  valid: boolean;
  timestamp: number;
  dataType: 'register' | 'parameter' | 'sysRegister';
  isAutoRefresh: boolean;
  canRead: boolean;
  canToggleAutoRefresh: boolean;
  onRead: () => void;
  onToggleAutoRefresh: (enabled: boolean) => void;
}

export default function RegisterInspector({
  open,
  onClose,
  mapEntry,
  value,
  valid,
  timestamp,
  dataType,
  isAutoRefresh,
  canRead,
  canToggleAutoRefresh,
  onRead,
  onToggleAutoRefresh,
}: RegisterInspectorProps) {
  const { palette: { custom: c } } = useTheme();
  const isFloat = mapEntry?.type === DataForm.FLOAT;
  const isInt   = mapEntry?.type === DataForm.INT;

  // Pre-computed value representations
  const hexStr   = value !== null ? toHex32(value)       : '---';
  const binStr   = value !== null ? toBin32(value).match(/.{4}/g)!.join(' ') : '---';
  const decS     = value !== null ? decSigned(value)     : '---';
  const decU     = value !== null ? decUnsigned(value)   : '---';
  const floatStr = value !== null ? formatFloat(int32ToFloat(value)) : '---';

  // Status
  const statusColor = value === null ? c.outline : valid ? c.secondary : c.error;
  const statusLabel = value === null ? 'NOT READ' : valid ? 'VALID' : 'INVALID';

  // Access
  const isRW = mapEntry?.accessPermit === DataAccessPermit.READ_WRITE;
  const accessLabel = isRW ? 'R/W' : 'R/O';

  // Timestamp
  const tsStr = timestamp > 0
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '---';

  // Source label
  const sourceLabel = dataType === 'sysRegister' ? 'System Reg' : dataType === 'parameter' ? 'Parameter' : 'Register';

  // IEEE 754 float decomposition
  const floatParts = (isFloat && value !== null) ? (() => {
    const raw = value >>> 0;
    const sign   = (raw >>> 31) & 1;
    const exp    = (raw >>> 23) & 0xFF;
    const mant   = raw & 0x7FFFFF;
    const expBias = exp - 127;
    return { sign, exp, expBias, mant };
  })() : null;

  return (
    <Box
      sx={{
        width: open ? INSPECTOR_WIDTH : 0,
        minWidth: open ? INSPECTOR_WIDTH : 0,
        overflow: 'hidden',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        flexShrink: 0,
        alignSelf: 'flex-start',
        position: 'sticky',
        top: 0,
        maxHeight: 'calc(100vh - 120px)',
      }}
    >
      {/* Fixed-width inner box so content doesn't reflow during transition */}
      <Box sx={{
        width: INSPECTOR_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: c.surfaceLowest,
        borderLeft: `1px solid ${c.ghost}`,
        maxHeight: 'calc(100vh - 120px)',
        overflow: 'hidden',
      }}>
        {/* ── Header ────────────────────────────────────────────────── */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 0.75,
          borderBottom: `1px solid ${c.ghost}`,
          backgroundColor: c.surfaceContainer,
          flexShrink: 0,
        }}>
          <Typography sx={{
            fontFamily: FONT_BODY,
            fontSize: '0.625rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: c.outline,
            userSelect: 'none',
          }}>
            Inspector
          </Typography>
          <IconButton
            size="small"
            onClick={onClose}
            sx={{
              color: c.outline,
              width: 20,
              height: 20,
              borderRadius: '2px',
              '&:hover': { color: c.onSurface, backgroundColor: `rgba(${hexCh(c.primary)},0.06)` },
            }}
          >
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>

        {/* ── Scrollable body ────────────────────────────────────────── */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1.25 }}>
          {!mapEntry ? (
            /* Empty state */
            <Box sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 6,
              gap: 0.75,
              opacity: 0.45,
            }}>
              <Box sx={{ width: 4, height: 4, borderRadius: '1px', backgroundColor: c.outline }} />
              <Typography sx={{
                fontFamily: FONT_BODY,
                fontSize: '0.6875rem',
                letterSpacing: '0.04em',
                color: c.outline,
                textTransform: 'uppercase',
                textAlign: 'center',
                lineHeight: 1.8,
              }}>
                {'Select a row\nto inspect'}
              </Typography>
            </Box>
          ) : (
            <>
              {/* ── Name ──────────────────────────────────────────────── */}
              <Typography sx={{
                fontFamily: FONT_HEADLINE,
                fontSize: '0.9375rem',
                fontWeight: 700,
                color: c.onSurface,
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
                wordBreak: 'break-all',
                mb: 0.75,
              }}>
                {mapEntry.name}
              </Typography>

              {/* ── Identity chips ─────────────────────────────────────── */}
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.25 }}>
                {/* Hex address */}
                <Chip label={`0x${mapEntry.address.toString(16).toUpperCase().padStart(2, '0')}`} size="small" sx={{
                  fontFamily: FONT_MONO, fontSize: '0.625rem', height: 20, borderRadius: '2px',
                  backgroundColor: c.surfaceHigh, color: c.onSurfaceVar, '& .MuiChip-label': { px: 0.75 },
                }} />
                {/* Decimal address */}
                <Chip label={String(mapEntry.address)} size="small" sx={{
                  fontFamily: FONT_MONO, fontSize: '0.625rem', height: 20, borderRadius: '2px',
                  backgroundColor: 'transparent', border: `1px solid ${c.ghost20}`, color: c.outline,
                  '& .MuiChip-label': { px: 0.75 },
                }} />
                {/* Access */}
                <Chip label={accessLabel} size="small" sx={{
                  fontFamily: FONT_MONO, fontSize: '0.625rem', height: 20, borderRadius: '2px', fontWeight: 700,
                  backgroundColor: isRW ? `rgba(${hexCh(c.secondary)},0.08)` : 'transparent',
                  border: `1px solid ${isRW ? `rgba(${hexCh(c.secondary)},0.20)` : c.ghost20}`,
                  color: isRW ? c.secondary : c.outline,
                  '& .MuiChip-label': { px: 0.75 },
                }} />
                {/* Type */}
                <Chip label={mapEntry.type} size="small" sx={{
                  fontFamily: FONT_MONO, fontSize: '0.625rem', height: 20, borderRadius: '2px',
                  backgroundColor: `rgba(${hexCh(c.primary)},0.06)`, border: `1px solid rgba(${hexCh(c.primary)},0.15)`,
                  color: c.primary, '& .MuiChip-label': { px: 0.75 },
                }} />
              </Box>

              <Sep />

              {/* ── Current value ──────────────────────────────────────── */}
              <SectionLabel>Current Value</SectionLabel>
              {value === null ? (
                <Typography sx={{ fontFamily: FONT_BODY, fontSize: '0.6875rem', color: c.outline, mb: 1.25 }}>
                  Not read yet — press Read
                </Typography>
              ) : isFloat ? (
                <Box sx={{ mb: 1.25 }}>
                  <ValueRow label="Float" value={floatStr} highlight />
                  <ValueRow label="Hex"   value={hexStr} />
                  <ValueRow label="Dec"   value={decS} />
                </Box>
              ) : isInt ? (
                <Box sx={{ mb: 1.25 }}>
                  <ValueRow label="Dec"  value={decS}  highlight />
                  <ValueRow label="UDec" value={decU} />
                  <ValueRow label="Hex"  value={hexStr} />
                </Box>
              ) : (
                /* uint32_t / hex */
                <Box sx={{ mb: 1.25 }}>
                  <ValueRow label="Dec" value={decU}  highlight />
                  <ValueRow label="Hex" value={hexStr} />
                </Box>
              )}

              {/* ── Bit breakdown (integer types) ──────────────────────── */}
              {!isFloat && (
                <>
                  <Sep />
                  <SectionLabel>Bit Breakdown · 32-bit</SectionLabel>
                  {value === null ? (
                    <Typography sx={{ fontFamily: FONT_BODY, fontSize: '0.6875rem', color: c.outline, mb: 1.25 }}>
                      Read value to visualise bits
                    </Typography>
                  ) : (
                    <Box sx={{ mb: 1.25 }}>
                      <BitVisualization value={value} />
                      {/* Binary string below the visual */}
                      <Typography sx={{
                        fontFamily: FONT_MONO,
                        fontSize: '0.5rem',
                        color: c.outline,
                        letterSpacing: '0.08em',
                        wordBreak: 'break-all',
                        lineHeight: 1.7,
                        mt: 0.75,
                      }}>
                        {binStr}
                      </Typography>
                    </Box>
                  )}
                </>
              )}

              {/* ── IEEE 754 decomposition (float type) ───────────────── */}
              {isFloat && floatParts && (
                <>
                  <Sep />
                  <SectionLabel>IEEE 754 Decomposition</SectionLabel>
                  <Box sx={{ mb: 1.25 }}>
                    <ValueRow label="Sign" value={floatParts.sign === 0 ? '+ (positive)' : '− (negative)'} />
                    <ValueRow label="Exp"  value={`${floatParts.exp}  (2^${floatParts.expBias > 0 ? '+' : ''}${floatParts.expBias})`} />
                    <ValueRow label="Mant" value={`0x${floatParts.mant.toString(16).toUpperCase().padStart(6, '0')}`} />
                    <ValueRow label="Hex"  value={hexStr} />
                  </Box>
                </>
              )}

              <Sep />

              {/* ── Metadata ───────────────────────────────────────────── */}
              <SectionLabel>Metadata</SectionLabel>
              <Box sx={{ mb: 1.25 }}>
                <MetaRow label="Source" value={sourceLabel} />
                <MetaRow label="Access" value={accessLabel} />
                <MetaRow label="Type"   value={mapEntry.type} />
                {mapEntry.isArray && (
                  <MetaRow label="Array" value={`element of [${mapEntry.arraySize}]`} />
                )}
                <MetaRow label="Status" value={
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.6875rem', fontWeight: 700, color: statusColor }}>
                    {statusLabel}
                  </Typography>
                } />
                <MetaRow label="Updated" value={tsStr} />
              </Box>

              <Sep />

              {/* ── Actions ────────────────────────────────────────────── */}
              <SectionLabel>Actions</SectionLabel>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                <ActionButton
                  icon={<RefreshIcon sx={{ fontSize: 13 }} />}
                  label="Read"
                  disabled={!canRead}
                  onClick={onRead}
                  tip="Read current value from device"
                />
                <ActionButton
                  icon={<TimerIcon sx={{ fontSize: 13 }} />}
                  label={isAutoRefresh ? 'Auto ON' : 'Auto'}
                  active={isAutoRefresh}
                  disabled={!canToggleAutoRefresh}
                  onClick={() => onToggleAutoRefresh(!isAutoRefresh)}
                  tip={isAutoRefresh ? 'Remove from auto-refresh' : 'Add to auto-refresh'}
                />
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
