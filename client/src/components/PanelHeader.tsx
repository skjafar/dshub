import React, { useRef, useState, useLayoutEffect } from 'react';
import { Box, Divider, IconButton, Menu, Tooltip, Typography, useTheme } from '@mui/material';
import { MoreHoriz as OverflowIcon } from '@mui/icons-material';
import { HEADER_HEIGHT } from '../design/tokens';

export interface PanelHeaderProps {
  /** Short panel name. Rendered as the panel's heading. */
  title: string;
  /** Optional one-line context, e.g. a count or the active profile. */
  subtitle?: React.ReactNode;
  /**
   * The panel's main call to action. Stays visible at every width — it is the one
   * control that must never be hidden behind an overflow menu.
   */
  primaryAction?: React.ReactNode;
  /**
   * Secondary controls: refresh, intervals, filters, view options. Collapse into
   * an overflow menu when the header runs out of room.
   */
  actions?: React.ReactNode;
  /** Rendered flush right, after the actions. Never collapses. */
  status?: React.ReactNode;
}

/**
 * Consistent header for a content panel.
 *
 * These controls used to live in the global AppBar, which meant seven panels
 * injected seven different toolbars into one shared bar with no overflow
 * handling — at 1280px with dashboard edit mode on, the controls pushed the
 * connection status off screen entirely. Owning the header here also removes the
 * `useImperativeHandle` plumbing that previously let the AppBar reach into a
 * panel, including a ref read during render that showed a stale pending-write
 * count.
 */
export default function PanelHeader({
  title,
  subtitle,
  primaryAction,
  actions,
  status,
}: PanelHeaderProps): React.JSX.Element {
  const { palette: { custom: c } } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [overflowed, setOverflowed] = useState(false);
  const [overflowAnchor, setOverflowAnchor] = useState<HTMLElement | null>(null);

  // Collapse secondary actions once the row can no longer hold them.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !actions) return;

    const check = () => {
      // Measure against the un-collapsed layout: if the content is wider than the
      // box, collapse. Re-expand only when there is comfortable room again, so the
      // header does not oscillate on the threshold.
      const overflowing = container.scrollWidth > container.clientWidth + 1;
      setOverflowed(prev => {
        if (!prev) return overflowing;
        return container.clientWidth < 720;
      });
    };

    check();
    const observer = new ResizeObserver(check);
    observer.observe(container);
    return () => observer.disconnect();
  }, [actions]);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minHeight: HEADER_HEIGHT,
        mb: 2,
        pb: 1.5,
        borderBottom: `1px solid ${c.ghost}`,
      }}
    >
      <Box sx={{ minWidth: 0, flexShrink: 0 }}>
        <Typography
          component="h2"
          sx={{
            fontSize: '0.875rem',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: c.onSurface,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" sx={{ color: c.onSurfaceVar, display: 'block', lineHeight: 1.3 }}>
            {subtitle}
          </Typography>
        )}
      </Box>

      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          overflow: 'hidden',
          // Headroom for outlined-input floating labels, which sit above the
          // control's top edge and would otherwise be clipped by `overflow`.
          pt: 1,
          mt: -1,
        }}
      >
        {primaryAction}
        {primaryAction && actions && !overflowed && (
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.75 }} />
        )}
        {actions && !overflowed && (
          <Box ref={actionsRef} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {actions}
          </Box>
        )}
      </Box>

      {actions && overflowed && (
        <>
          <Tooltip title="More actions">
            <IconButton
              size="small"
              aria-label="More actions"
              onClick={(e) => setOverflowAnchor(e.currentTarget)}
            >
              <OverflowIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={overflowAnchor}
            open={Boolean(overflowAnchor)}
            onClose={() => setOverflowAnchor(null)}
            slotProps={{ paper: { sx: { p: 1.5, maxWidth: 360 } } }}
          >
            <Box
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1.5 }}
              onClick={(e) => e.stopPropagation()}
            >
              {actions}
            </Box>
          </Menu>
        </>
      )}

      {status && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>{status}</Box>}
    </Box>
  );
}
