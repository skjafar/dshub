import React from 'react';
import { Box, IconButton, Paper } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { DashboardWidget as DashboardWidgetType } from '../../types/dashboard';
import ButtonWidget from './ButtonWidget';
import ValueReadWidget from './ValueReadWidget';
import ValueWriteWidget from './ValueWriteWidget';
import MiniPlotWidget from './MiniPlotWidget';
import DropdownWidget from './DropdownWidget';

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
      default:
        return <Box>Unknown widget type</Box>;
    }
  };

  return (
    <Paper
      sx={{
        height: '100%',
        position: 'relative',
        border: isEditMode ? '2px dashed' : 'none',
        borderColor: isEditMode ? 'primary.main' : 'transparent',
        transition: 'border-color 0.2s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
      elevation={isEditMode ? 4 : 2}
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
            gap: 0.5,
            backgroundColor: 'background.paper',
            borderRadius: 1,
            padding: '2px',
            pointerEvents: 'auto'
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(widget.id);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            sx={{
              padding: '4px',
              '&:hover': { backgroundColor: 'primary.light', color: 'primary.contrastText' }
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(widget.id);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            sx={{
              padding: '4px',
              '&:hover': { backgroundColor: 'error.main', color: 'error.contrastText' }
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Widget content */}
      <Box sx={{ flex: 1, p: widget.type === 'button' ? 0 : 2, overflow: 'auto' }}>
        {renderWidget()}
      </Box>
    </Paper>
  );
}
