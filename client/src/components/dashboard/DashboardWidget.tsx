import React from 'react';
import { Box, IconButton, Paper } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { DashboardWidget as DashboardWidgetType } from '../../types/dashboard';
import ButtonWidget from './ButtonWidget';
import ValueReadWidget from './ValueReadWidget';
import ValueWriteWidget from './ValueWriteWidget';
import MiniPlotWidget from './MiniPlotWidget';
import DropdownWidget from './DropdownWidget';
import StateLEDWidget from './StateLEDWidget';
import GaugeWidget from './GaugeWidget';
import ProgressBarWidget from './ProgressBarWidget';
import EncoderDisplayWidget from './EncoderDisplayWidget';
import LEDIndicatorWidget from './LEDIndicatorWidget';
import DirectionalControlWidget from './DirectionalControlWidget';
import SystemInfoWidget from './SystemInfoWidget';

interface DashboardWidgetProps {
  widget: DashboardWidgetType;
  isEditMode: boolean;
  onEdit: (widgetId: string) => void;
  onDelete: (widgetId: string) => void;
}

export default function DashboardWidget({ widget, isEditMode, onEdit, onDelete }: DashboardWidgetProps) {
  const renderWidget = () => {
    switch (widget.type) {
      case 'button':
        return <ButtonWidget config={widget.config as any} isEditMode={isEditMode} />;
      case 'valueRead':
        return <ValueReadWidget config={widget.config as any} isEditMode={isEditMode} />;
      case 'valueWrite':
        return <ValueWriteWidget config={widget.config as any} isEditMode={isEditMode} />;
      case 'miniPlot':
        return <MiniPlotWidget config={widget.config as any} isEditMode={isEditMode} />;
      case 'dropdown':
        return <DropdownWidget config={widget.config as any} isEditMode={isEditMode} />;
      case 'stateLED':
        return <StateLEDWidget config={widget.config as any} isEditMode={isEditMode} />;
      case 'gauge':
        return <GaugeWidget config={widget.config as any} isEditMode={isEditMode} />;
      case 'progressBar':
        return <ProgressBarWidget config={widget.config as any} isEditMode={isEditMode} />;
      case 'encoderDisplay':
        return <EncoderDisplayWidget config={widget.config as any} isEditMode={isEditMode} />;
      case 'ledIndicator':
        return <LEDIndicatorWidget config={widget.config as any} isEditMode={isEditMode} />;
      case 'directionalControl':
        return <DirectionalControlWidget config={widget.config as any} isEditMode={isEditMode} />;
      case 'systemInfo':
        return <SystemInfoWidget config={widget.config as any} isEditMode={isEditMode} />;
      default:
        return <Box>Unknown widget type</Box>;
    }
  };

  return (
    <Paper
      sx={{
        height: '100%',
        position: 'relative',
        border: isEditMode ? '1.5px dashed' : '1px solid',
        borderColor: isEditMode ? 'primary.main' : 'divider',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
      elevation={0}
    >
      {/* Edit mode controls */}
      {isEditMode && (
        <Box
          className="widget-controls"
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            zIndex: 1000,
            display: 'flex',
            gap: 0.25,
            backgroundColor: 'rgba(20, 20, 26, 0.85)',
            backdropFilter: 'blur(8px)',
            borderRadius: '4px',
            padding: '2px',
            border: '1px solid',
            borderColor: 'divider',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onEdit(widget.id); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            sx={{ padding: '3px', '&:hover': { color: 'primary.main' } }}
          >
            <EditIcon sx={{ fontSize: '0.875rem' }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onDelete(widget.id); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            sx={{ padding: '3px', '&:hover': { color: 'error.main' } }}
          >
            <DeleteIcon sx={{ fontSize: '0.875rem' }} />
          </IconButton>
        </Box>
      )}

      {/* Widget content */}
      <Box sx={{ flex: 1, p: widget.type === 'button' ? 0 : 1.5, overflow: 'auto' }}>
        {renderWidget()}
      </Box>
    </Paper>
  );
}
