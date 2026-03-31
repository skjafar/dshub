import React, { useRef, useState, useCallback, useEffect, memo } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { Layout } from 'react-grid-layout';
import GridLayout from 'react-grid-layout';
import {
  DashboardWidget as DashboardWidgetType,
  ContainerWidgetConfig,
  WidgetConfig,
  WidgetType,
  DEFAULT_WIDGET_SIZES,
  generateWidgetId,
  findNextAvailablePosition,
} from '../../types/dashboard';
import { useWidgetSize } from '../../hooks/useWidgetSize';
import DashboardWidget from './DashboardWidget';
import WidgetConfigDialog from './WidgetConfigDialog';

interface ContainerWidgetProps {
  widget: DashboardWidgetType;
  config: ContainerWidgetConfig;
  isEditMode: boolean;
  roundedCorners: boolean;
  cellSize: number;
  onUpdateConfig?: (widgetId: string, newConfig: WidgetConfig) => void;
  onEditSelf: (widgetId: string) => void;
  onDeleteSelf: (widgetId: string) => void;
}

interface ChildConfigDialogState {
  open: boolean;
  mode: 'add' | 'edit';
  childId?: string;
  childType?: WidgetType;
  childConfig?: WidgetConfig;
}

function ContainerWidgetInner({
  widget,
  config,
  isEditMode,
  roundedCorners,
  cellSize,
  onUpdateConfig,
  onEditSelf,
  onDeleteSelf,
}: ContainerWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width: containerWidth, height: containerHeight } = useWidgetSize(containerRef);
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [childConfigDialog, setChildConfigDialog] = useState<ChildConfigDialogState>({
    open: false,
    mode: 'add',
  });
  const [deleteContainerConfirm, setDeleteContainerConfirm] = useState(false);
  const [undoState, setUndoState] = useState<{ open: boolean; deletedWidget: DashboardWidgetType | null }>({
    open: false,
    deletedWidget: null,
  });

  useEffect(() => {
    return () => {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const handleChildLayoutChange = useCallback((layout: Layout[]) => {
    if (!isEditMode || !onUpdateConfig) return;
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
    layoutTimerRef.current = setTimeout(() => {
      const updatedChildren = config.childWidgets.map(child => {
        const newLayout = layout.find(l => l.i === child.id);
        return newLayout ? { ...child, layout: newLayout } : child;
      });
      onUpdateConfig(widget.id, { ...config, childWidgets: updatedChildren });
    }, 300);
  }, [isEditMode, onUpdateConfig, config, widget.id]);

  const handleEditChild = useCallback((childId: string) => {
    const child = config.childWidgets.find(w => w.id === childId);
    if (child) {
      setChildConfigDialog({ open: true, mode: 'edit', childId, childType: child.type, childConfig: child.config });
    }
  }, [config.childWidgets]);

  const handleDeleteChild = useCallback((childId: string) => {
    if (!onUpdateConfig) return;
    const deletedWidget = config.childWidgets.find(w => w.id === childId);
    if (!deletedWidget) return;

    // Optimistic delete
    const updatedChildren = config.childWidgets.filter(w => w.id !== childId);
    onUpdateConfig(widget.id, { ...config, childWidgets: updatedChildren });

    // Show undo snackbar
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState({ open: true, deletedWidget });
    undoTimerRef.current = setTimeout(() => {
      setUndoState({ open: false, deletedWidget: null });
    }, 4000);
  }, [config, widget.id, onUpdateConfig]);

  const handleUndoDelete = useCallback(() => {
    if (!undoState.deletedWidget || !onUpdateConfig) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    onUpdateConfig(widget.id, { ...config, childWidgets: [...config.childWidgets, undoState.deletedWidget] });
    setUndoState({ open: false, deletedWidget: null });
  }, [undoState.deletedWidget, config, widget.id, onUpdateConfig]);

  const handleSaveChild = useCallback((type: WidgetType, childConfig: WidgetConfig) => {
    if (!onUpdateConfig) return;

    if (childConfigDialog.mode === 'add') {
      const childId = generateWidgetId();
      const defaultSize = DEFAULT_WIDGET_SIZES[type];
      const existingLayouts = config.childWidgets.map(w => w.layout);
      const position = findNextAvailablePosition(existingLayouts, defaultSize, 12);
      const newChild: DashboardWidgetType = {
        id: childId,
        type,
        config: childConfig,
        layout: { i: childId, x: position.x, y: position.y, ...defaultSize },
      };
      onUpdateConfig(widget.id, { ...config, childWidgets: [...config.childWidgets, newChild] });
    } else {
      const updatedChildren = config.childWidgets.map(w =>
        w.id === childConfigDialog.childId ? { ...w, type, config: childConfig } : w
      );
      onUpdateConfig(widget.id, { ...config, childWidgets: updatedChildren });
    }
    setChildConfigDialog({ open: false, mode: 'add' });
  }, [childConfigDialog, config, widget.id, onUpdateConfig]);

  const spacing = config.spacing ?? 4;
  const innerWidth = Math.max(0, containerWidth - config.padding * 2);
  const innerHeight = Math.max(0, containerHeight - config.padding * 2);

  // Scale rowHeight so the inner grid exactly fills the available height.
  const maxInnerRows = config.childWidgets.length > 0
    ? Math.max(...config.childWidgets.map(w => w.layout.y + w.layout.h))
    : 1;
  const innerRowHeight = innerHeight > 0 && maxInnerRows > 0
    ? Math.max(1, Math.floor((innerHeight - spacing * (maxInnerRows + 1)) / maxInnerRows))
    : cellSize;

  return (
    <Box
      ref={containerRef}
      sx={{
        height: '100%',
        position: 'relative',
        backgroundColor: config.backgroundColor ?? 'transparent',
        border: isEditMode ? '1.5px dashed' : '1px solid',
        borderColor: isEditMode ? 'primary.main' : 'divider',
        borderRadius: roundedCorners ? 1 : 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Container label — top-left, view and edit mode */}
      {config.label && (
        <Box
          sx={{
            position: 'absolute',
            top: 4,
            left: 6,
            zIndex: 900,
            pointerEvents: 'none',
          }}
        >
          <Typography
            sx={{
              fontSize: '0.6rem',
              fontWeight: 600,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: 'text.disabled',
              lineHeight: 1,
            }}
          >
            {config.label}
          </Typography>
        </Box>
      )}

      {/* Container edit/delete controls — top-right */}
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
            borderColor: (theme) => alpha(theme.palette.primary.main, 0.35),
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <IconButton
            size="small"
            aria-label="Edit container"
            onClick={(e) => { e.stopPropagation(); onEditSelf(widget.id); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            sx={{ padding: '3px', '&:hover': { color: 'primary.main' } }}
          >
            <EditIcon sx={{ fontSize: '0.875rem' }} />
          </IconButton>
          <IconButton
            size="small"
            aria-label="Delete container"
            onClick={(e) => { e.stopPropagation(); setDeleteContainerConfirm(true); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            sx={{ padding: '3px', '&:hover': { color: 'error.main' } }}
          >
            <DeleteIcon sx={{ fontSize: '0.875rem' }} />
          </IconButton>
        </Box>
      )}

      {/* Add child widget button — bottom-right */}
      {isEditMode && (
        <Box
          className="widget-controls"
          sx={{
            position: 'absolute',
            bottom: 6,
            right: 6,
            zIndex: 1000,
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <IconButton
            size="small"
            aria-label="Add widget to container"
            onClick={(e) => { e.stopPropagation(); setChildConfigDialog({ open: true, mode: 'add' }); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            sx={{
              padding: '4px',
              borderRadius: '4px',
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
            }}
          >
            <AddIcon sx={{ fontSize: '0.875rem' }} />
          </IconButton>
        </Box>
      )}

      {/* Inner grid area */}
      <Box sx={{ flex: 1, p: `${config.padding}px`, overflow: 'visible', position: 'relative' }}>
        {/* Empty state */}
        {isEditMode && config.childWidgets.length === 0 && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
              color: 'text.disabled',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            <AddIcon sx={{ fontSize: '1.25rem', opacity: 0.4 }} />
            <Typography sx={{ fontSize: '0.675rem', opacity: 0.5 }}>
              Use + to add widgets
            </Typography>
          </Box>
        )}

        {innerWidth > 0 && innerHeight > 0 && config.childWidgets.length > 0 && (
          <GridLayout
            className="layout"
            layout={config.childWidgets.map(w => w.layout)}
            cols={12}
            rowHeight={innerRowHeight}
            width={innerWidth}
            margin={[spacing, spacing]}
            isDraggable={isEditMode}
            isResizable={isEditMode}
            onLayoutChange={handleChildLayoutChange}
            compactType={null}
            preventCollision={false}
            draggableCancel=".widget-controls"
          >
            {config.childWidgets.map(child => (
              <div key={child.id}>
                <DashboardWidget
                  widget={child}
                  isEditMode={isEditMode}
                  roundedCorners={roundedCorners}
                  cellSize={cellSize}
                  onEdit={handleEditChild}
                  onDelete={handleDeleteChild}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </Box>

      {/* Child widget config dialog — excludes container to prevent nesting */}
      <WidgetConfigDialog
        open={childConfigDialog.open}
        onClose={() => setChildConfigDialog({ open: false, mode: 'add' })}
        onSave={handleSaveChild}
        mode={childConfigDialog.mode}
        initialType={childConfigDialog.childType}
        initialConfig={childConfigDialog.childConfig}
        excludeTypes={['container']}
      />

      {/* Delete container confirmation */}
      <Dialog
        open={deleteContainerConfirm}
        onClose={() => setDeleteContainerConfirm(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>Delete Container</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {config.childWidgets.length > 0
              ? `This will also remove ${config.childWidgets.length} child widget${config.childWidgets.length !== 1 ? 's' : ''}. This cannot be undone.`
              : 'Delete this container?'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setDeleteContainerConfirm(false)}>
            Cancel
          </Button>
          <Button
            size="small"
            color="error"
            onClick={() => { setDeleteContainerConfirm(false); onDeleteSelf(widget.id); }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Undo snackbar for child widget deletion */}
      <Snackbar
        open={undoState.open}
        message="Widget removed"
        action={
          <Button color="primary" size="small" onClick={handleUndoDelete}>
            UNDO
          </Button>
        }
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          setUndoState({ open: false, deletedWidget: null });
        }}
        autoHideDuration={4000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

const ContainerWidget = memo(ContainerWidgetInner);
export default ContainerWidget;
