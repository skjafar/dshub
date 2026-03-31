import React, { useRef, memo } from 'react';
import { Box, IconButton, Paper } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import {
  DashboardWidget as DashboardWidgetType,
  ButtonWidgetConfig,
  ValueReadWidgetConfig,
  ValueWriteWidgetConfig,
  MiniPlotWidgetConfig,
  DropdownWidgetConfig,
  StateLEDWidgetConfig,
  GaugeWidgetConfig,
  ProgressBarWidgetConfig,
  EncoderDisplayWidgetConfig,
  LEDIndicatorWidgetConfig,
  DirectionalControlWidgetConfig,
  SystemInfoWidgetConfig,
  DataTableWidgetConfig,
  AlarmListWidgetConfig,
  StatusMatrixWidgetConfig,
  ContainerWidgetConfig,
  WidgetConfig,
} from '../../types/dashboard';
import { useWidgetSize } from '../../hooks/useWidgetSize';
import { getWidgetScale, WidgetSizeInfo } from '../../utils/widgetScaling';
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
import DataTableWidget from './DataTableWidget';
import AlarmListWidget from './AlarmListWidget';
import StatusMatrixWidget from './StatusMatrixWidget';
import ContainerWidget from './ContainerWidget';

interface DashboardWidgetProps {
  widget: DashboardWidgetType;
  isEditMode: boolean;
  roundedCorners: boolean;
  cellSize: number;
  onEdit: (widgetId: string) => void;
  onDelete: (widgetId: string) => void;
  onUpdateConfig?: (widgetId: string, newConfig: WidgetConfig) => void;
}

function DashboardWidgetInner({ widget, isEditMode, roundedCorners, cellSize, onEdit, onDelete, onUpdateConfig }: DashboardWidgetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { width, height } = useWidgetSize(contentRef);
  const widgetSize = getWidgetScale(widget.type, width, height);

  // Container widgets render their own surface — skip the Paper wrapper
  if (widget.type === 'container') {
    return (
      <ContainerWidget
        widget={widget}
        config={widget.config as ContainerWidgetConfig}
        isEditMode={isEditMode}
        roundedCorners={roundedCorners}
        cellSize={cellSize}
        onUpdateConfig={onUpdateConfig}
        onEditSelf={onEdit}
        onDeleteSelf={onDelete}
      />
    );
  }

  const renderWidget = (ws: WidgetSizeInfo) => {
    switch (widget.type) {
      case 'button':
        return <ButtonWidget config={widget.config as ButtonWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'valueRead':
        return <ValueReadWidget config={widget.config as ValueReadWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'valueWrite':
        return <ValueWriteWidget config={widget.config as ValueWriteWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'miniPlot':
        return <MiniPlotWidget config={widget.config as MiniPlotWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'dropdown':
        return <DropdownWidget config={widget.config as DropdownWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'stateLED':
        return <StateLEDWidget config={widget.config as StateLEDWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'gauge':
        return <GaugeWidget config={widget.config as GaugeWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'progressBar':
        return <ProgressBarWidget config={widget.config as ProgressBarWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'encoderDisplay':
        return <EncoderDisplayWidget config={widget.config as EncoderDisplayWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'ledIndicator':
        return <LEDIndicatorWidget config={widget.config as LEDIndicatorWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'directionalControl':
        return <DirectionalControlWidget config={widget.config as DirectionalControlWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'systemInfo':
        return <SystemInfoWidget config={widget.config as SystemInfoWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'dataTable':
        return <DataTableWidget config={widget.config as DataTableWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'alarmList':
        return <AlarmListWidget config={widget.config as AlarmListWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
      case 'statusMatrix':
        return <StatusMatrixWidget config={widget.config as StatusMatrixWidgetConfig} isEditMode={isEditMode} widgetSize={ws} />;
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
        borderRadius: roundedCorners ? 1 : 0,
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
            backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.95),
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
            aria-label="Edit widget"
            onClick={(e) => { e.stopPropagation(); onEdit(widget.id); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            sx={{ padding: '3px', '&:hover': { color: 'primary.main' } }}
          >
            <EditIcon sx={{ fontSize: '0.875rem' }} />
          </IconButton>
          <IconButton
            size="small"
            aria-label="Delete widget"
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
      <Box ref={contentRef} sx={{ flex: 1, p: widget.type === 'button' ? 0 : 1, overflow: 'auto' }}>
        {renderWidget(widgetSize)}
      </Box>
    </Paper>
  );
}

const DashboardWidget = memo(DashboardWidgetInner);
export default DashboardWidget;
