import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import {
  Box,
  Button,
  IconButton,
  Tabs,
  Tab,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem,
  Slider,
  Divider,
  Snackbar,
  Switch,
  FormControlLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Edit as EditIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  Dashboard as DashboardEmptyIcon
} from '@mui/icons-material';
import EmptyState from './EmptyState';
import PanelHeader from './PanelHeader';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastNotification';
import {
  DashboardWidget as DashboardWidgetType,
  DashboardTab,
  WidgetType,
  WidgetConfig,
  ContainerWidgetConfig,
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

/** Tab IDs that are template-generated and should not be editable */
const LOCKED_TAB_IDS = new Set(['cnc-demo-tab', 'cnc-monitoring-tab']);
const isLockedTab = (tabId: string | null): boolean => LOCKED_TAB_IDS.has(tabId ?? '');

export default function DashboardPanel(): React.JSX.Element {
  const { settings, updateSettings, getActiveProfile } = useSettings();

  // Edit mode is transient; grid appearance is a persisted view preference.
  const [isEditMode, setIsEditMode] = useState(false);
  const { cellSize, spacing, roundedCorners } = settings.dashboardView;
  const dashboardView = settings.dashboardView;
  const setDashboardView = useCallback(
    (patch: Partial<typeof dashboardView>) =>
      updateSettings({ dashboardView: { ...dashboardView, ...patch } }),
    [dashboardView, updateSettings]
  );

  // Measure the grid container so react-grid-layout gets a real width.
  //
  // The grid must not mount before this is known. `cols` is derived from the
  // width, and react-grid-layout runs `correctBounds` on mount: any widget whose
  // `x + w` exceeds the column count is permanently clamped inside its internal
  // layout state. Mounting at width 0 collapses `cols` to the fallback and
  // squashes every dashboard authored at a wider grid — and because the `layout`
  // prop's contents are unchanged afterwards, RGL's equality check skips
  // resyncing, so the damage survives the width update.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth || null);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isMeasured = containerWidth !== null && containerWidth > 0;
  const cols = isMeasured
    ? Math.max(1, Math.floor(containerWidth / cellSize) || DEFAULT_GRID_CONFIG.cols)
    : DEFAULT_GRID_CONFIG.cols;

  // Read by the layout-change handler, which must not close over a stale value.
  const isMeasuredRef = useRef(isMeasured);
  isMeasuredRef.current = isMeasured;
  const { showError, showSuccess } = useToast();
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
  const undoDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [deleteWidgetConfirm, setDeleteWidgetConfirm] = useState<{
    open: boolean;
    widgetId: string | null;
    childCount: number;
  }>({ open: false, widgetId: null, childCount: 0 });
  const [undoDeleteState, setUndoDeleteState] = useState<{
    open: boolean;
    deletedWidget: DashboardWidgetType | null;
    tabId: string | null;
  }>({ open: false, deletedWidget: null, tabId: null });

  useEffect(() => {
    return () => {
      if (undoDeleteTimerRef.current) clearTimeout(undoDeleteTimerRef.current);
    };
  }, []);

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
    if (isLockedTab(tabMenu.tabId)) return;
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
          showError('Invalid dashboard file — expected a tab export with a name and widget list.');
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
        showSuccess(`Imported tab "${newTab.name}"`);
      } catch {
        showError('Could not read that dashboard file — it is not valid JSON.');
      }
    };
    input.click();
  };

  const handleSaveRename = (newName: string) => {
    if (isLockedTab(renameDialog.tabId)) return;
    setTabs(tabs.map(tab =>
      tab.id === renameDialog.tabId ? { ...tab, name: newName } : tab
    ));
    setRenameDialog({ open: false, tabId: '', currentName: '' });
  };

  const handleAddWidget = () => {
    setConfigDialog({ open: true, mode: 'add' });
  };

  const handleEditWidget = (widgetId: string) => {
    if (isLockedTab(activeTabId)) return;
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
    if (isLockedTab(activeTabId)) return;
    const widget = activeTab.widgets.find(w => w.id === widgetId);
    if (!widget) return;

    // Container with children needs a confirmation — too destructive to undo silently
    if (widget.type === 'container') {
      const childCount = (widget.config as ContainerWidgetConfig).childWidgets.length;
      if (childCount > 0) {
        setDeleteWidgetConfirm({ open: true, widgetId, childCount });
        return;
      }
    }

    // All other widgets (and empty containers): optimistic delete + undo snackbar
    setTabs(tabs.map(tab =>
      tab.id === activeTabId
        ? { ...tab, widgets: tab.widgets.filter(w => w.id !== widgetId) }
        : tab
    ));
    if (undoDeleteTimerRef.current) clearTimeout(undoDeleteTimerRef.current);
    setUndoDeleteState({ open: true, deletedWidget: widget, tabId: activeTabId });
    undoDeleteTimerRef.current = setTimeout(() => {
      setUndoDeleteState({ open: false, deletedWidget: null, tabId: null });
    }, 4000);
  };

  const handleConfirmWidgetDelete = () => {
    if (!deleteWidgetConfirm.widgetId) return;
    const { widgetId } = deleteWidgetConfirm;
    setDeleteWidgetConfirm({ open: false, widgetId: null, childCount: 0 });
    setTabs(tabs.map(tab =>
      tab.id === activeTabId
        ? { ...tab, widgets: tab.widgets.filter(w => w.id !== widgetId) }
        : tab
    ));
  };

  const handleUndoWidgetDelete = () => {
    if (!undoDeleteState.deletedWidget || !undoDeleteState.tabId) return;
    if (undoDeleteTimerRef.current) clearTimeout(undoDeleteTimerRef.current);
    const { deletedWidget, tabId } = undoDeleteState;
    setTabs(prev => prev.map(tab =>
      tab.id === tabId
        ? { ...tab, widgets: [...tab.widgets, deletedWidget] }
        : tab
    ));
    setUndoDeleteState({ open: false, deletedWidget: null, tabId: null });
  };

  const handleUpdateWidgetConfig = useCallback((widgetId: string, newConfig: WidgetConfig) => {
    if (isLockedTab(activeTabId)) return;
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, widgets: tab.widgets.map(w => w.id === widgetId ? { ...w, config: newConfig } : w) }
        : tab
    ));
  }, [activeTabId]);

  const handleSaveWidget = (type: WidgetType, config: WidgetConfig) => {
    if (isLockedTab(activeTabId)) return;
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
    if (isLockedTab(activeTabId)) return;
    // Never write back a layout produced before the grid was measured: it would
    // be react-grid-layout's bounds-corrected version, not the user's.
    if (!isMeasuredRef.current) return;

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
      <PanelHeader
        title="Dashboard"
        subtitle={`${activeTab?.widgets.length ?? 0} widget${(activeTab?.widgets.length ?? 0) === 1 ? '' : 's'} · ${cols} columns`}
        primaryAction={
          <Button
            variant={isEditMode ? 'contained' : 'outlined'}
            startIcon={<EditIcon />}
            onClick={() => setIsEditMode(v => !v)}
            color={isEditMode ? 'primary' : 'inherit'}
            size="small"
          >
            {isEditMode ? 'Done Editing' : 'Edit'}
          </Button>
        }
        actions={isEditMode ? (
          <>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddWidget} color="primary" size="small">
              Add Widget
            </Button>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 180 }}>
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>Grid</Typography>
              <Slider
                value={cellSize}
                onChange={(_, v) => setDashboardView({ cellSize: v as number })}
                min={20}
                max={150}
                step={5}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}px`}
                aria-label="Grid cell size"
                sx={{ width: 110 }}
              />
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap', minWidth: 42, fontVariantNumeric: 'tabular-nums' }}>
                {cellSize}px
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 160 }}>
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>Gap</Typography>
              <Slider
                value={spacing}
                onChange={(_, v) => setDashboardView({ spacing: v as number })}
                min={0}
                max={30}
                step={2}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}px`}
                aria-label="Widget spacing"
                sx={{ width: 90 }}
              />
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap', minWidth: 36, fontVariantNumeric: 'tabular-nums' }}>
                {spacing}px
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={roundedCorners}
                  onChange={(e) => setDashboardView({ roundedCorners: e.target.checked })}
                  size="small"
                />
              }
              label={<Typography variant="body2">Rounded</Typography>}
              sx={{ ml: 0, whiteSpace: 'nowrap' }}
            />
          </>
        ) : undefined}
      />

      {/* Tabs */}
      <Box sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
          <Tabs value={activeTabId} onChange={handleTabChange} sx={{ flex: 1 }} variant="scrollable" scrollButtons="auto">
            {tabs.map(tab => (
              <Tab
                key={tab.id}
                label={tab.name}
                value={tab.id}
                // A button cannot contain a button. In edit mode the options menu
                // is opened from the adjacent control or a context-menu gesture on
                // the tab itself, both of which stay keyboard-reachable.
                onContextMenu={isEditMode ? (e) => { e.preventDefault(); handleTabMenu(e, tab.id); } : undefined}
              />
            ))}
          </Tabs>
          {isEditMode && (
            <>
              <Tooltip title={`Options for "${activeTab?.name ?? 'tab'}"`}>
                <IconButton
                  size="small"
                  aria-label="Active tab options"
                  onClick={(e) => handleTabMenu(e, activeTabId)}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Add tab">
                <IconButton onClick={handleAddTab} aria-label="Add tab" sx={{ mr: 1 }}>
                  <AddIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
      </Box>

      {/* Dashboard Grid */}
      <Box ref={containerRef} sx={{ minHeight: '500px', width: '100%' }}>
        {activeTab.widgets.length === 0 ? (
          <EmptyState
            icon={<DashboardEmptyIcon />}
            title="No Widgets"
            subtitle={isEditMode
              ? 'Click "Add Widget" to start building your dashboard'
              : 'Enable Edit Mode to add widgets'}
            action={!isEditMode ? {
              label: 'Enable Edit Mode',
              onClick: () => setIsEditMode(true),
              icon: <EditIcon />,
            } : undefined}
          />
        ) : !isMeasured ? (
          // Nothing to show for one pre-paint frame while the container is
          // measured. Mounting the grid here would clamp the saved layout.
          null
        ) : (
          <GridLayout
            className="layout"
            layout={activeTab.widgets.map(w => w.layout)}
            cols={cols}
            rowHeight={cellSize}
            width={containerWidth}
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
                  cellSize={cellSize}
                  onEdit={handleEditWidget}
                  onDelete={handleDeleteWidget}
                  onUpdateConfig={handleUpdateWidgetConfig}
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
        <MenuItem onClick={handleRenameTab} disabled={isLockedTab(tabMenu.tabId)}>Rename</MenuItem>
        <MenuItem onClick={handleDuplicateTab}>Duplicate</MenuItem>
        <Divider />
        <MenuItem onClick={handleExportTab}>Export Tab</MenuItem>
        <MenuItem onClick={handleImportTab}>Import Tab</MenuItem>
        {tabs.length > 1 && (
          <>
            <Divider />
            <MenuItem onClick={handleDeleteTab} disabled={isLockedTab(tabMenu.tabId)}>Delete</MenuItem>
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

      {/* Delete container confirmation */}
      <Dialog
        open={deleteWidgetConfirm.open}
        onClose={() => setDeleteWidgetConfirm({ open: false, widgetId: null, childCount: 0 })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>Delete Container</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will also remove {deleteWidgetConfirm.childCount} child widget{deleteWidgetConfirm.childCount !== 1 ? 's' : ''}. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setDeleteWidgetConfirm({ open: false, widgetId: null, childCount: 0 })}>
            Cancel
          </Button>
          <Button size="small" color="error" onClick={handleConfirmWidgetDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Undo snackbar for widget deletion */}
      <Snackbar
        open={undoDeleteState.open}
        message="Widget removed"
        action={
          <Button color="primary" size="small" onClick={handleUndoWidgetDelete}>
            UNDO
          </Button>
        }
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          setUndoDeleteState({ open: false, deletedWidget: null, tabId: null });
        }}
        autoHideDuration={4000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
