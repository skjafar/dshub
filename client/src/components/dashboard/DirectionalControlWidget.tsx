import React, { useState } from 'react';
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
import { useDSHub } from '../../contexts/DSHubContext';

interface DirectionalControlWidgetProps {
  config: DirectionalControlWidgetConfig;
  isEditMode: boolean;
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
export default function DirectionalControlWidget({ config, isEditMode }: DirectionalControlWidgetProps) {
  const { state, actions } = useDSHub();
  const [activeDirection, setActiveDirection] = useState<string | null>(null);

  const isConnected = state.connection?.connected ?? false;
  const layout = config.layout || '4way';
  const buttonSize = config.buttonSize || 48;
  const color = config.color || '#00F2FF';

  /**
   * Send directional command via the proper actions.sendCommand API
   */
  const sendDirectionCommand = (command: number, direction: string) => {
    if (!isConnected || isEditMode) return;

    // Visual feedback
    setActiveDirection(direction);
    setTimeout(() => setActiveDirection(null), 150);

    // Send system command through the DSHub actions API
    actions.sendCommand(command, 0);
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
  const getButtonSx = (direction: string) => ({
    width: buttonSize,
    height: buttonSize,
    backgroundColor: activeDirection === direction ? color : 'rgba(0, 0, 0, 0.1)',
    border: `2px solid ${color}`,
    color: activeDirection === direction ? '#000' : color,
    borderRadius: 1,
    transition: 'all 0.15s ease',
    boxShadow: activeDirection === direction ? `0 0 15px ${color}` : 'none',
    '&:hover': {
      backgroundColor: color,
      color: '#000',
      boxShadow: `0 0 10px ${color}`,
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
        p: 2,
      }}
    >
      {/* Widget Label */}
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
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
              border: `1px solid rgba(255, 255, 255, 0.1)`,
              borderRadius: 1,
            }}
          />
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
              border: `1px solid rgba(255, 255, 255, 0.1)`,
              borderRadius: 1,
            }}
          />
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

      {/* Connection Status */}
      {!isConnected && (
        <Typography variant="caption" color="error">
          Not connected
        </Typography>
      )}
    </Box>
  );
}
