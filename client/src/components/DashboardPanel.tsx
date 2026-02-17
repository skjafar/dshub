import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
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
  Slider,
  Divider
} from '@mui/material';
import {
  Edit as EditIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon
} from '@mui/icons-material';
import GridLayout from 'react-grid-layout';
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
  spacing: number;
  roundedCorners: boolean;
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
    spacing,
    roundedCorners,
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
  const [renameValue, setRenameValue] = useState('');

  // Version counters to prevent infinite loop between load and save effects
  const loadVersionRef = useRef(0);
  const savedVersionRef = useRef(0);

  // Load dashboard from settings when profile changes
  useEffect(() => {
    loadVersionRef.current++;
    const layout = settings.dashboardLayouts[activeProfileId] || createEmptyDashboard();
    setTabs(layout.tabs);
    setActiveTabId(layout.activeTabId);
  }, [activeProfileId, settings.dashboardLayouts]);

  // Save dashboard to settings whenever it changes
  useEffect(() => {
    // Skip save if this render was triggered by a load
    if (loadVersionRef.current !== savedVersionRef.current) {
      savedVersionRef.current = loadVersionRef.current;
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
      setRenameValue(tab.name);
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
    if (tabMenu.tabId === 'cnc-demo-tab') return;
    const newTabs = tabs.filter(t => t.id !== tabMenu.tabId);
    setTabs(newTabs);
    if (activeTabId === tabMenu.tabId) {
      setActiveTabId(newTabs[0].id);
    }
    handleCloseTabMenu();
  };

  const handleExportTab = () => {
    if (!tabMenu.tabId) return;
    const tab = tabs.find(t => t.id === tabMenu.tabId);
    if (!tab) return;

    const exportData = {
      version: 1,
      tab: {
        name: tab.name,
        widgets: tab.widgets
      }
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-${tab.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    handleCloseTabMenu();
  };

  const handleImportTab = () => {
    handleCloseTabMenu();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validate shape
        if (!data.version || !data.tab || !data.tab.name || !Array.isArray(data.tab.widgets)) {
          alert('Invalid dashboard file format.');
          return;
        }

        // Create new tab with unique IDs
        const newTab: DashboardTab = {
          ...createNewTab(tabs.length + 1),
          name: data.tab.name,
          widgets: data.tab.widgets.map((widget: any) => {
            const newId = generateWidgetId();
            return {
              ...widget,
              id: newId,
              layout: { ...widget.layout, i: newId }
            };
          })
        };

        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
      } catch {
        alert('Failed to parse dashboard file. Ensure it is a valid JSON export.');
      }
    };
    input.click();
  };

  const handleSaveRename = (newName: string) => {
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
    if (activeTabId === 'cnc-demo-tab') return;
    setTabs(tabs.map(tab =>
      tab.id === activeTabId
        ? { ...tab, widgets: tab.widgets.filter(w => w.id !== widgetId) }
        : tab
    ));
  };

  const handleSaveWidget = (type: WidgetType, config: WidgetConfig) => {
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

  // Debounce layout changes to prevent excessive state/localStorage writes during drag
  const layoutChangeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleLayoutChange = useCallback((layout: Layout[]) => {
    if (!isEditMode) return;
    if (activeTabId === 'cnc-demo-tab') return;

    if (layoutChangeTimerRef.current) clearTimeout(layoutChangeTimerRef.current);
    layoutChangeTimerRef.current = setTimeout(() => {
      setTabs(prev => prev.map(tab =>
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
    }, 300);
  }, [isEditMode, activeTabId]);

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
            width={cellSize * cols + (spacing) * (cols - 1)}
            margin={[spacing, spacing]}
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
                  roundedCorners={roundedCorners}
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
        <MenuItem onClick={handleRenameTab} disabled={tabMenu.tabId === 'cnc-demo-tab'}>Rename</MenuItem>
        <MenuItem onClick={handleDuplicateTab}>Duplicate</MenuItem>
        <Divider />
        <MenuItem onClick={handleExportTab}>Export Tab</MenuItem>
        <MenuItem onClick={handleImportTab}>Import Tab</MenuItem>
        {tabs.length > 1 && (
          <>
            <Divider />
            <MenuItem onClick={handleDeleteTab} disabled={tabMenu.tabId === 'cnc-demo-tab'}>Delete</MenuItem>
          </>
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
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveRename(renameValue);
              }
            }}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog({ open: false, tabId: '', currentName: '' })}>Cancel</Button>
          <Button
            onClick={() => handleSaveRename(renameValue)}
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
