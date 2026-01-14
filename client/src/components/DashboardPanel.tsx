import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  Tabs,
  Tab,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem,
  Slider
} from '@mui/material';
import {
  Edit as EditIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon
} from '@mui/icons-material';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-grid-layout/css/styles.css';
import { useSettings } from '../contexts/SettingsContext';
import {
  DashboardWidget as DashboardWidgetType,
  DashboardTab,
  WidgetType,
  WidgetConfig,
  DEFAULT_GRID_CONFIG,
  DEFAULT_WIDGET_SIZES,
  createNewTab,
  generateWidgetId,
  findNextAvailablePosition,
  createEmptyDashboard
} from '../types/dashboard';
import DashboardWidget from './dashboard/DashboardWidget';
import WidgetConfigDialog from './dashboard/WidgetConfigDialog';
import { Layout } from 'react-grid-layout';

export interface DashboardPanelRef {
  openAddWidgetDialog: () => void;
}

interface DashboardPanelProps {
  isEditMode: boolean;
  cellSize: number;
  cols: number;
  onEditModeChange: (editMode: boolean) => void;
  onCellSizeChange: (size: number) => void;
  onAddWidget: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
  containerWidth: number;
}

const DashboardPanel = forwardRef<DashboardPanelRef, DashboardPanelProps>((props, ref) => {
  const {
    isEditMode,
    cellSize,
    cols,
    onEditModeChange,
    onCellSizeChange,
    onAddWidget: onAddWidgetExternal,
    containerRef,
    containerWidth
  } = props;
  const { settings, updateSettings, getActiveProfile } = useSettings();
  const activeProfileId = settings.activeMapProfileId;

  // Get dashboard layout for current profile
  const dashboardLayout = settings.dashboardLayouts[activeProfileId] || createEmptyDashboard();

  // Debug logging
  console.log('DashboardPanel - activeProfileId:', activeProfileId);
  console.log('DashboardPanel - dashboardLayout:', dashboardLayout);
  console.log('DashboardPanel - all dashboardLayouts keys:', Object.keys(settings.dashboardLayouts));

  const [activeTabId, setActiveTabId] = useState(dashboardLayout.activeTabId);
  const [tabs, setTabs] = useState<DashboardTab[]>(dashboardLayout.tabs);
  const [configDialog, setConfigDialog] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    widgetId?: string;
    widgetType?: WidgetType;
    widgetConfig?: WidgetConfig;
  }>({ open: false, mode: 'add' });
  const [tabMenu, setTabMenu] = useState<{ anchorEl: HTMLElement | null; tabId: string | null }>({
    anchorEl: null,
    tabId: null
  });
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; tabId: string; currentName: string }>({
    open: false,
    tabId: '',
    currentName: ''
  });

  // Ref to prevent infinite loop between load and save effects
  const isLoadingRef = useRef(false);

  // Load dashboard from settings when profile changes
  useEffect(() => {
    isLoadingRef.current = true;
    const layout = settings.dashboardLayouts[activeProfileId] || createEmptyDashboard();
    setTabs(layout.tabs);
    setActiveTabId(layout.activeTabId);
    // Use setTimeout to ensure state updates complete before we allow saving again
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 0);
  }, [activeProfileId, settings.dashboardLayouts]);

  // Save dashboard to settings whenever it changes
  useEffect(() => {
    // Don't save if we're currently loading from settings (prevents infinite loop)
    if (isLoadingRef.current) {
      return;
    }

    const layout = {
      tabs,
      activeTabId
    };
    updateSettings({
      dashboardLayouts: {
        ...settings.dashboardLayouts,
        [activeProfileId]: layout
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTabId, activeProfileId]);

  const activeTab = tabs.find(tab => tab.id === activeTabId) || tabs[0];

  const handleAddTab = () => {
    const newTab = createNewTab(tabs.length + 1);
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleTabChange = (event: React.SyntheticEvent, newTabId: string) => {
    setActiveTabId(newTabId);
  };

  const handleTabMenu = (event: React.MouseEvent<HTMLElement>, tabId: string) => {
    event.stopPropagation();
    setTabMenu({ anchorEl: event.currentTarget, tabId });
  };

  const handleCloseTabMenu = () => {
    setTabMenu({ anchorEl: null, tabId: null });
  };

  const handleRenameTab = () => {
    if (!tabMenu.tabId) return;
    const tab = tabs.find(t => t.id === tabMenu.tabId);
    if (tab) {
      setRenameDialog({ open: true, tabId: tab.id, currentName: tab.name });
    }
    handleCloseTabMenu();
  };

  const handleDuplicateTab = () => {
    if (!tabMenu.tabId) return;
    const tab = tabs.find(t => t.id === tabMenu.tabId);
    if (tab) {
      const newTab = {
        ...createNewTab(tabs.length + 1),
        name: `${tab.name} (Copy)`,
        widgets: tab.widgets.map(widget => {
          const newId = generateWidgetId();
          return {
            ...widget,
            id: newId,
            layout: {
              ...widget.layout,
              i: newId
            }
          };
        })
      };
      setTabs([...tabs, newTab]);
    }
    handleCloseTabMenu();
  };

  const handleDeleteTab = () => {
    if (!tabMenu.tabId || tabs.length === 1) return;
    // Prevent deletion of built-in CNC demo tab
    if (tabMenu.tabId === 'cnc-demo-tab') return;
    const newTabs = tabs.filter(t => t.id !== tabMenu.tabId);
    setTabs(newTabs);
    if (activeTabId === tabMenu.tabId) {
      setActiveTabId(newTabs[0].id);
    }
    handleCloseTabMenu();
  };

  const handleSaveRename = (newName: string) => {
    // Prevent renaming built-in CNC demo tab
    if (renameDialog.tabId === 'cnc-demo-tab') return;
    setTabs(tabs.map(tab =>
      tab.id === renameDialog.tabId ? { ...tab, name: newName } : tab
    ));
    setRenameDialog({ open: false, tabId: '', currentName: '' });
  };

  const handleAddWidget = () => {
    onAddWidgetExternal();
    setConfigDialog({ open: true, mode: 'add' });
  };

  // Expose method to parent component
  useImperativeHandle(ref, () => ({
    openAddWidgetDialog: () => {
      setConfigDialog({ open: true, mode: 'add' });
    }
  }));

  const handleEditWidget = (widgetId: string) => {
    // Prevent editing widgets on built-in CNC demo tab
    if (activeTabId === 'cnc-demo-tab') return;
    const widget = activeTab.widgets.find(w => w.id === widgetId);
    if (widget) {
      setConfigDialog({
        open: true,
        mode: 'edit',
        widgetId,
        widgetType: widget.type,
        widgetConfig: widget.config
      });
    }
  };

  const handleDeleteWidget = (widgetId: string) => {
    // Prevent deleting widgets from built-in CNC demo tab
    if (activeTabId === 'cnc-demo-tab') return;
    setTabs(tabs.map(tab =>
      tab.id === activeTabId
        ? { ...tab, widgets: tab.widgets.filter(w => w.id !== widgetId) }
        : tab
    ));
  };

  const handleSaveWidget = (type: WidgetType, config: WidgetConfig) => {
    // Prevent adding/editing widgets on built-in CNC demo tab
    if (activeTabId === 'cnc-demo-tab') return;

    if (configDialog.mode === 'add') {
      // Add new widget
      const widgetId = generateWidgetId();
      const existingLayouts = activeTab.widgets.map(w => w.layout);
      const defaultSize = DEFAULT_WIDGET_SIZES[type];
      const position = findNextAvailablePosition(existingLayouts, defaultSize, DEFAULT_GRID_CONFIG.cols);

      const newWidget: DashboardWidgetType = {
        id: widgetId,
        type,
        config,
        layout: {
          i: widgetId,
          x: position.x,
          y: position.y,
          w: defaultSize.w,
          h: defaultSize.h,
          minW: defaultSize.minW,
          minH: defaultSize.minH
        }
      };

      setTabs(tabs.map(tab =>
        tab.id === activeTabId
          ? { ...tab, widgets: [...tab.widgets, newWidget] }
          : tab
      ));
    } else {
      // Edit existing widget
      setTabs(tabs.map(tab =>
        tab.id === activeTabId
          ? {
              ...tab,
              widgets: tab.widgets.map(w =>
                w.id === configDialog.widgetId ? { ...w, config } : w
              )
            }
          : tab
      ));
    }
    setConfigDialog({ open: false, mode: 'add' });
  };

  const handleLayoutChange = (layout: Layout[]) => {
    if (!isEditMode) return; // Only update layout in edit mode
    // Prevent layout changes on built-in CNC demo tab
    if (activeTabId === 'cnc-demo-tab') return;

    setTabs(tabs.map(tab =>
      tab.id === activeTabId
        ? {
            ...tab,
            widgets: tab.widgets.map(widget => {
              const newLayout = layout.find(l => l.i === widget.id);
              return newLayout ? { ...widget, layout: newLayout } : widget;
            })
          }
        : tab
    ));
  };

  return (
    <Box>
      {/* Tabs */}
      <Card sx={{ mb: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
          <Tabs value={activeTabId} onChange={handleTabChange} sx={{ flex: 1 }}>
            {tabs.map(tab => (
              <Tab
                key={tab.id}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {tab.name}
                    {isEditMode && (
                      <IconButton
                        size="small"
                        onClick={(e) => handleTabMenu(e, tab.id)}
                        sx={{ ml: 0.5 }}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                }
                value={tab.id}
              />
            ))}
          </Tabs>
          {isEditMode && (
            <IconButton onClick={handleAddTab} sx={{ mr: 1 }}>
              <AddIcon />
            </IconButton>
          )}
        </Box>
      </Card>

      {/* Dashboard Grid */}
      <Box ref={containerRef} sx={{ minHeight: '500px', width: '100%' }}>
        {activeTab.widgets.length === 0 ? (
          <Card>
            <CardContent>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '300px',
                  gap: 2
                }}
              >
                <Typography variant="h6" color="text.secondary">
                  No widgets yet
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {isEditMode
                    ? 'Click "Add Widget" to start building your dashboard'
                    : 'Enable Edit Mode to add widgets'}
                </Typography>
                {!isEditMode && (
                  <Button variant="outlined" startIcon={<EditIcon />} onClick={() => onEditModeChange(true)}>
                    Enable Edit Mode
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        ) : (
          <GridLayout
            className="layout"
            layout={activeTab.widgets.map(w => w.layout)}
            cols={cols}
            rowHeight={cellSize}
            width={containerWidth}
            isDraggable={isEditMode}
            isResizable={isEditMode}
            onLayoutChange={handleLayoutChange}
            compactType={null}
            preventCollision={false}
            draggableCancel=".widget-controls"
          >
            {activeTab.widgets.map(widget => (
              <div key={widget.id}>
                <DashboardWidget
                  widget={widget}
                  isEditMode={isEditMode}
                  onEdit={handleEditWidget}
                  onDelete={handleDeleteWidget}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </Box>

      {/* Widget Config Dialog */}
      <WidgetConfigDialog
        open={configDialog.open}
        onClose={() => setConfigDialog({ open: false, mode: 'add' })}
        onSave={handleSaveWidget}
        mode={configDialog.mode}
        initialType={configDialog.widgetType}
        initialConfig={configDialog.widgetConfig}
      />

      {/* Tab Context Menu */}
      <Menu
        anchorEl={tabMenu.anchorEl}
        open={Boolean(tabMenu.anchorEl)}
        onClose={handleCloseTabMenu}
      >
        <MenuItem onClick={handleRenameTab} disabled={tabMenu.tabId === 'cnc-demo-tab'}>
          Rename
        </MenuItem>
        <MenuItem onClick={handleDuplicateTab}>Duplicate</MenuItem>
        {tabs.length > 1 && (
          <MenuItem onClick={handleDeleteTab} disabled={tabMenu.tabId === 'cnc-demo-tab'}>
            Delete
          </MenuItem>
        )}
      </Menu>

      {/* Rename Tab Dialog */}
      <Dialog open={renameDialog.open} onClose={() => setRenameDialog({ open: false, tabId: '', currentName: '' })}>
        <DialogTitle>Rename Tab</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Tab Name"
            defaultValue={renameDialog.currentName}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSaveRename((e.target as HTMLInputElement).value);
              }
            }}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog({ open: false, tabId: '', currentName: '' })}>Cancel</Button>
          <Button
            onClick={(e) => {
              const input = e.currentTarget.closest('div')?.querySelector('input');
              if (input) handleSaveRename(input.value);
            }}
            variant="contained"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

DashboardPanel.displayName = 'DashboardPanel';

export default DashboardPanel;
