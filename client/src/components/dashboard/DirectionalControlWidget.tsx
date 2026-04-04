import React, { useState, useRef, useEffect } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import {
  ArrowUpward,
  ArrowDownward,
  ArrowBack,
  ArrowForward,
  NorthEast,
  SouthEast,
  SouthWest,
  NorthWest,
} from '@mui/icons-material';
import { DirectionalControlWidgetConfig } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, scaledPx } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useToast } from '../ToastNotification';
import { useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';

interface DirectionalControlWidgetProps {
  config: DirectionalControlWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

/**
 * Directional Control Widget
 *
 * Generic multi-directional control pad for sending directional commands.
 * Supports 4-way (up/down/left/right) or 8-way (including diagonals) layouts.
 *
 * Example use cases:
 * - CNC jog controls (X+/X-/Y+/Y-/Z+/Z-)
 * - Robot arm movement
 * - Camera pan/tilt
 * - Game controller emulation
 */
export default function DirectionalControlWidget({ config, isEditMode, widgetSize }: DirectionalControlWidgetProps) {
  const { palette: { custom: c } } = useTheme();
  const { state, actions } = useDSHub();
  const { showError } = useToast();
  const [activeDirection, setActiveDirection] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isConnected = state.connection?.connected ?? false;
  const canControl = isConnected && (
    (state.connection?.interface === 'TCP' && state.connection.controlState === 1) ||
    (state.connection?.interface === 'UDP' && state.connection.controlState === 2)
  );
  const layout = config.layout || '4way';
  const baseButtonSize = config.buttonSize || 48;
  const buttonSize = widgetSize ? scaledPx(baseButtonSize, widgetSize.scale) : baseButtonSize;
  const color = config.color || '#00F2FF';

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  /**
   * Send directional command via the proper actions.sendCommand API
   */
  const sendDirectionCommand = (command: number, direction: string) => {
    if (!isConnected || isEditMode) return;

    if (!canControl) {
      showError('Take control of the device before sending commands');
      return;
    }

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Visual feedback
    setActiveDirection(direction);
    timeoutRef.current = setTimeout(() => setActiveDirection(null), 150);

    // Send system command through the DSHub actions API
    actions.sendCommand(0, 0, command);
  };

  /**
   * Get icon for direction
   */
  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'up': return <ArrowUpward />;
      case 'down': return <ArrowDownward />;
      case 'left': return <ArrowBack />;
      case 'right': return <ArrowForward />;
      case 'upLeft': return <NorthWest />;
      case 'upRight': return <NorthEast />;
      case 'downLeft': return <SouthWest />;
      case 'downRight': return <SouthEast />;
      default: return null;
    }
  };

  /**
   * Common button styling
   */
  const iconSize = Math.round(buttonSize * 0.5);

  const getButtonSx = (direction: string) => ({
    width: buttonSize,
    height: buttonSize,
    '& .MuiSvgIcon-root': { fontSize: iconSize },
    backgroundColor: activeDirection === direction ? alpha(color, 0.18) : c.ghost,
    border: `1.5px solid ${activeDirection === direction ? color : `${color}40`}`,
    color: color,
    borderRadius: 1,
    transition: 'background-color 0.1s ease, border-color 0.1s ease',
    '&:hover': {
      backgroundColor: alpha(color, 0.12),
      color: color,
      border: `1.5px solid ${color}`,
    },
    '&:active': {
      transform: 'scale(0.95)',
    },
    '&:disabled': {
      opacity: 0.3,
      cursor: 'not-allowed',
    },
  });

  // Find direction configuration
  const getDirectionConfig = (dir: string) => {
    return config.directions.find(d => d.direction === dir);
  };

  const upConfig = getDirectionConfig('up');
  const downConfig = getDirectionConfig('down');
  const leftConfig = getDirectionConfig('left');
  const rightConfig = getDirectionConfig('right');
  const upLeftConfig = getDirectionConfig('upLeft');
  const upRightConfig = getDirectionConfig('upRight');
  const downLeftConfig = getDirectionConfig('downLeft');
  const downRightConfig = getDirectionConfig('downRight');

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 1,
      }}
    >
      {/* Widget Label */}
      <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem', letterSpacing: '0.1em' }}>
        {config.label}
      </Typography>

      {/* 4-Way Layout */}
      {layout === '4way' && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(3, ${buttonSize}px)`,
            gridTemplateRows: `repeat(3, ${buttonSize}px)`,
            gap: 0.5,
          }}
        >
          {/* Row 1: Up */}
          <Box />
          {upConfig && (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(upConfig.command, 'up')}
              sx={getButtonSx('up')}
            >
              {getDirectionIcon('up')}
            </IconButton>
          )}
          <Box />

          {/* Row 2: Left, Center, Right */}
          {leftConfig && (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(leftConfig.command, 'left')}
              sx={getButtonSx('left')}
            >
              {getDirectionIcon('left')}
            </IconButton>
          )}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box sx={{
              width: Math.round(buttonSize * 0.3),
              height: Math.round(buttonSize * 0.3),
              borderRadius: '50%',
              border: `1px solid ${color}30`,
              backgroundColor: `${color}08`,
            }} />
          </Box>
          {rightConfig && (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(rightConfig.command, 'right')}
              sx={getButtonSx('right')}
            >
              {getDirectionIcon('right')}
            </IconButton>
          )}

          {/* Row 3: Down */}
          <Box />
          {downConfig && (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(downConfig.command, 'down')}
              sx={getButtonSx('down')}
            >
              {getDirectionIcon('down')}
            </IconButton>
          )}
          <Box />
        </Box>
      )}

      {/* 8-Way Layout */}
      {layout === '8way' && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(3, ${buttonSize}px)`,
            gridTemplateRows: `repeat(3, ${buttonSize}px)`,
            gap: 0.5,
          }}
        >
          {/* Row 1: Up-Left, Up, Up-Right */}
          {upLeftConfig ? (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(upLeftConfig.command, 'upLeft')}
              sx={getButtonSx('upLeft')}
            >
              {getDirectionIcon('upLeft')}
            </IconButton>
          ) : <Box />}
          {upConfig && (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(upConfig.command, 'up')}
              sx={getButtonSx('up')}
            >
              {getDirectionIcon('up')}
            </IconButton>
          )}
          {upRightConfig ? (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(upRightConfig.command, 'upRight')}
              sx={getButtonSx('upRight')}
            >
              {getDirectionIcon('upRight')}
            </IconButton>
          ) : <Box />}

          {/* Row 2: Left, Center, Right */}
          {leftConfig && (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(leftConfig.command, 'left')}
              sx={getButtonSx('left')}
            >
              {getDirectionIcon('left')}
            </IconButton>
          )}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box sx={{
              width: Math.round(buttonSize * 0.3),
              height: Math.round(buttonSize * 0.3),
              borderRadius: '50%',
              border: `1px solid ${color}30`,
              backgroundColor: `${color}08`,
            }} />
          </Box>
          {rightConfig && (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(rightConfig.command, 'right')}
              sx={getButtonSx('right')}
            >
              {getDirectionIcon('right')}
            </IconButton>
          )}

          {/* Row 3: Down-Left, Down, Down-Right */}
          {downLeftConfig ? (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(downLeftConfig.command, 'downLeft')}
              sx={getButtonSx('downLeft')}
            >
              {getDirectionIcon('downLeft')}
            </IconButton>
          ) : <Box />}
          {downConfig && (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(downConfig.command, 'down')}
              sx={getButtonSx('down')}
            >
              {getDirectionIcon('down')}
            </IconButton>
          )}
          {downRightConfig ? (
            <IconButton
              disabled={!isConnected || isEditMode}
              onClick={() => sendDirectionCommand(downRightConfig.command, 'downRight')}
              sx={getButtonSx('downRight')}
            >
              {getDirectionIcon('downRight')}
            </IconButton>
          ) : <Box />}
        </Box>
      )}

    </Box>
  );
}
