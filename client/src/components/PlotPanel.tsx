import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Grid,
  Switch,
  FormControlLabel,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Download as SaveIcon,
  Delete as DeleteIcon,
  ShowChart as ShowChartIcon
} from '@mui/icons-material';
import EmptyState from './EmptyState';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { useDSHub } from '../contexts/DSHubContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastNotification';
import { mapManager } from '../maps/mapManager';
import { MapEntry } from '../maps/mapParser';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  TimeScale
);

const COLORS = [
  '#00D4FF',  // Cyan (primary)
  '#FF3D71',  // Signal Red
  '#00E676',  // Signal Green
  '#FFAB00',  // Amber
  '#A78BFA',  // Purple
  '#FF7043',  // Deep Orange
  '#26C6DA',  // Teal
  '#EC407A',  // Magenta
  '#5CE1FF',  // Light Cyan
  '#FFC233',  // Gold
  '#33EB91',  // Light Green
  '#C4B5FD',  // Lavender
  '#FF6B8A',  // Pink
  '#7C3AED',  // Deep Purple
  '#CC8900',  // Dark Amber
];

const DEFAULT_PLOT_HEIGHT = 300;
const MAX_PLOTS = 10;

interface PlotSeries {
  name: string;
  color: string;
  visible: boolean;
  pollInterval: number;
  address: number;
  source: 'register' | 'sysRegister';
}

interface ZoomPanState {
  yMin: number | null;
  yMax: number | null;
  isZoomed: boolean;
}

interface MouseState {
  isDrawing: boolean;
  isPanning: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startPixelX: number;
  startPixelY: number;
  currentPixelX: number;
  currentPixelY: number;
}

interface PlotPanel {
  id: string;
  title: string;
  series: Map<string, PlotSeries>;
  zoomPan: ZoomPanState;
  mouseState: MouseState;
  height: number;
}

const createEmptyPlot = (id: string, plotNumber: number): PlotPanel => ({
  id,
  title: `Plot ${plotNumber}`,
  series: new Map(),
  zoomPan: {
    yMin: null,
    yMax: null,
    isZoomed: false
  },
  mouseState: {
    isDrawing: false,
    isPanning: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    startPixelX: 0,
    startPixelY: 0,
    currentPixelX: 0,
    currentPixelY: 0
  },
  height: DEFAULT_PLOT_HEIGHT
});

export default function PlotPanel() {
  const { state, actions } = useDSHub();
  const { settings, getActiveProfile } = useSettings();
  const { showSuccess, showError } = useToast();
  const theme = useTheme();

  const [selectedRegister, setSelectedRegister] = useState('');
  const [selectedSource, setSelectedSource] = useState<'register' | 'sysRegister'>('register');
  const [pollIntervalInput, setPollIntervalInput] = useState(settings.plotDefaults.pollInterval.toString());
  const [selectedPlotId, setSelectedPlotId] = useState('plot-1');
  const [isAutoscaleEnabled, setIsAutoscaleEnabled] = useState(true);
  const [showStatistics, setShowStatistics] = useState(false);
  const [plots, setPlots] = useState<PlotPanel[]>([createEmptyPlot('plot-1', 1)]);
  const [timeSpan, setTimeSpan] = useState(settings.plotDefaults.timeSpan);
  const [timeSpanInput, setTimeSpanInput] = useState(settings.plotDefaults.timeSpan.toString());
  const [availableRegisters, setAvailableRegisters] = useState<MapEntry[]>([]);
  const [availableSystemRegisters, setAvailableSystemRegisters] = useState<MapEntry[]>([]);

  // Counter for plot numbering - always increments, never reuses numbers
  const nextPlotNumberRef = useRef(2);

  // Force re-render for real-time updates
  const [, forceUpdate] = useState(0);

  // Shared X-axis zoom across all plots
  const [sharedXZoom, setSharedXZoom] = useState<{ xMin: number | null; xMax: number | null }>({
    xMin: null,
    xMax: null
  });


  // Chart refs for each plot
  const chartRefs = useRef<Map<string, React.RefObject<ChartJS<"line", any, any>>>>(new Map());
  const chartContainerRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());

  // Resize handler cleanup refs
  const resizeHandlersRef = useRef<{
    handleMouseMove: ((e: MouseEvent) => void) | null;
    handleMouseUp: (() => void) | null;
  }>({ handleMouseMove: null, handleMouseUp: null });

  // Refs for keyboard handler to avoid stale closures
  const plotsRef = useRef<PlotPanel[]>(plots);
  const isAutoscaleEnabledRef = useRef<boolean>(isAutoscaleEnabled);

  // Keep refs updated
  useEffect(() => {
    plotsRef.current = plots;
  }, [plots]);

  useEffect(() => {
    isAutoscaleEnabledRef.current = isAutoscaleEnabled;
  }, [isAutoscaleEnabled]);


  // Force re-render when plot data changes to update charts in real-time
  useEffect(() => {
    // Check if there are any active plots
    const hasActivePlots = plots.some(plot => plot.series.size > 0);
    if (!hasActivePlots) return;

    // Set up interval to force updates - use shortest poll interval from active series
    let minPollInterval = 1000; // Default to 1 second
    plots.forEach(plot => {
      plot.series.forEach(series => {
        if (series.pollInterval < minPollInterval) {
          minPollInterval = series.pollInterval;
        }
      });
    });

    // Update at the fastest poll rate to catch all data points
    const interval = setInterval(() => {
      forceUpdate(prev => prev + 1);
    }, minPollInterval);

    return () => clearInterval(interval);
  }, [plots, forceUpdate]);

  // Validation helpers
  const validatePollInterval = (value: string): { valid: boolean; error?: string } => {
    const num = parseInt(value);
    if (isNaN(num)) return { valid: false, error: 'Must be a number' };
    if (num < 50) return { valid: false, error: 'Must be at least 50 ms' };
    if (num > 10000) return { valid: false, error: 'Must be at most 10000 ms' };
    return { valid: true };
  };

  const validateTimeSpan = (value: string): { valid: boolean; error?: string } => {
    const num = parseInt(value);
    if (isNaN(num)) return { valid: false, error: 'Must be a number' };
    if (num < 5) return { valid: false, error: 'Must be at least 5 seconds' };
    if (num > settings.plotDefaults.maxTimeSpan) {
      return { valid: false, error: `Must be at most ${settings.plotDefaults.maxTimeSpan} seconds` };
    }
    return { valid: true };
  };

  // Get next available color within a specific plot
  const getNextAvailableColor = useCallback((plotId: string) => {
    const plot = plots.find(p => p.id === plotId);
    const plotColors = new Set<string>();
    if (plot) {
      for (const series of plot.series.values()) {
        plotColors.add(series.color);
      }
    }
    for (const color of COLORS) {
      if (!plotColors.has(color)) {
        return color;
      }
    }
    return COLORS[plotColors.size % COLORS.length];
  }, [plots]);

  // Get chart coordinates helper for a specific plot
  const getChartCoordinates = useCallback((plotId: string, clientX: number, clientY: number) => {
    const chartRef = chartRefs.current.get(plotId);
    const chartContainerRef = chartContainerRefs.current.get(plotId);

    if (!chartRef?.current || !chartContainerRef?.current) {
      return null;
    }

    const chart = chartRef.current;
    const chartArea = chart.chartArea;

    if (!chartArea) {
      return null;
    }

    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (x < chartArea.left || x > chartArea.right || y < chartArea.top || y > chartArea.bottom) {
      return null;
    }

    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    if (!xScale || !yScale) {
      return null;
    }

    return {
      x: xScale.getValueForPixel(x),
      y: yScale.getValueForPixel(y),
      pixelX: x,
      pixelY: y
    };
  }, []);

  // Reset zoom for all plots
  const resetZoom = useCallback(() => {
    setSharedXZoom({ xMin: null, xMax: null });
    setPlots(prev => prev.map(plot => ({
      ...plot,
      zoomPan: {
        yMin: null,
        yMax: null,
        isZoomed: false
      }
    })));
    showSuccess('Zoom/Pan reset');
  }, [showSuccess]);

  // Add new plot
  const handleAddPlot = () => {
    if (plots.length >= MAX_PLOTS) {
      showError(`Maximum ${MAX_PLOTS} plots allowed`);
      return;
    }

    const newPlotNumber = nextPlotNumberRef.current;
    const newPlotId = `plot-${newPlotNumber}`;
    const newPlot = createEmptyPlot(newPlotId, newPlotNumber);

    nextPlotNumberRef.current += 1;

    setPlots(prev => [...prev, newPlot]);
    setSelectedPlotId(newPlotId);
    showSuccess(`Plot ${newPlotNumber} added`);
  };

  // Remove plot
  const handleRemovePlot = (plotId: string) => {
    if (plots.length === 1) {
      showError('Cannot remove the last plot');
      return;
    }

    const plotToRemove = plots.find(p => p.id === plotId);
    if (!plotToRemove) return;

    // Stop all series in this plot and free colors
    plotToRemove.series.forEach((_series, seriesName) => {
      actions.stopPlotting(seriesName);
    });

    // Destroy Chart.js instance before removing refs to prevent memory leaks
    const chartRef = chartRefs.current.get(plotId);
    if (chartRef?.current) {
      chartRef.current.destroy();
    }

    // Clean up chart refs
    chartRefs.current.delete(plotId);
    chartContainerRefs.current.delete(plotId);

    setPlots(prev => prev.filter(p => p.id !== plotId));

    if (selectedPlotId === plotId && plots.length > 1) {
      setSelectedPlotId(plots[0].id === plotId ? plots[1].id : plots[0].id);
    }

    showSuccess('Plot removed');
  };

  // Add series to selected plot
  const handleAddSeries = () => {
    if (!selectedRegister) return;

    // Check if series already exists in ANY plot
    const existsInPlot = plots.find(plot => plot.series.has(selectedRegister));
    if (existsInPlot) {
      showError(`Series "${selectedRegister}" already exists in ${existsInPlot.title}`);
      return;
    }

    const validation = validatePollInterval(pollIntervalInput);
    if (!validation.valid) {
      return;
    }

    const pollInterval = parseInt(pollIntervalInput);
    const sourceList = selectedSource === 'sysRegister' ? availableSystemRegisters : availableRegisters;
    const register = sourceList.find(r => r.name === selectedRegister);
    if (!register) {
      showError(`Register ${selectedRegister} not found in map`);
      return;
    }

    const color = getNextAvailableColor(selectedPlotId);
    const newSeries: PlotSeries = {
      name: selectedRegister,
      color,
      visible: true,
      pollInterval,
      address: register.address,
      source: selectedSource,
    };

    setPlots(prev => prev.map(plot => {
      if (plot.id === selectedPlotId) {
        const newSeriesMap = new Map(plot.series);
        newSeriesMap.set(selectedRegister, newSeries);
        return { ...plot, series: newSeriesMap };
      }
      return plot;
    }));

    if (selectedSource === 'sysRegister') {
      actions.startPlottingSysRegister(selectedRegister, pollInterval, register.address);
    } else {
      actions.startPlotting(selectedRegister, pollInterval, register.address);
    }
    actions.setPlotTimeSpan(selectedRegister, timeSpan);
    setSelectedRegister('');

    const targetPlot = plots.find(p => p.id === selectedPlotId);
    showSuccess(`Series added to ${targetPlot?.title || 'plot'}`);
  };

  // Remove series from plot
  const handleRemoveSeries = (plotId: string, seriesName: string) => {
    setPlots(prev => prev.map(plot => {
      if (plot.id === plotId) {
        const newSeriesMap = new Map(plot.series);
        newSeriesMap.delete(seriesName);
        return { ...plot, series: newSeriesMap };
      }
      return plot;
    }));
    actions.stopPlotting(seriesName);
  };

  // Toggle series visibility
  const handleSeriesVisibilityToggle = (plotId: string, seriesName: string) => {
    setPlots(prev => prev.map(plot => {
      if (plot.id === plotId) {
        const newSeriesMap = new Map(plot.series);
        const series = newSeriesMap.get(seriesName);
        if (series) {
          newSeriesMap.set(seriesName, { ...series, visible: !series.visible });
        }
        return { ...plot, series: newSeriesMap };
      }
      return plot;
    }));
  };

  // Update plot height
  const handlePlotHeightChange = (plotId: string, height: number) => {
    setPlots(prev => prev.map(plot =>
      plot.id === plotId ? { ...plot, height: Math.max(200, Math.min(800, height)) } : plot
    ));
  };

  // Handle resize drag
  const handleResizeStart = (plotId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const plot = plots.find(p => p.id === plotId);
    if (!plot) return;

    const startY = e.clientY;
    const startHeight = plot.height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = startHeight + deltaY;
      handlePlotHeightChange(plotId, newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Clear refs after cleanup
      resizeHandlersRef.current.handleMouseMove = null;
      resizeHandlersRef.current.handleMouseUp = null;
    };

    // Store handlers in ref for cleanup on unmount
    resizeHandlersRef.current.handleMouseMove = handleMouseMove;
    resizeHandlersRef.current.handleMouseUp = handleMouseUp;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  // Handler for time span changes
  const handleTimeSpanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTimeSpanInput(value);

    const validation = validateTimeSpan(value);
    if (validation.valid) {
      const newTimeSpan = parseInt(value);
      setTimeSpan(newTimeSpan);

      plots.forEach(plot => {
        plot.series.forEach((_, seriesName) => {
          actions.setPlotTimeSpan(seriesName, newTimeSpan);
        });
      });
    }
  };

  // Autoscale toggle
  const handleAutoscaleToggle = () => {
    const newAutoscaleState = !isAutoscaleEnabled;
    setIsAutoscaleEnabled(newAutoscaleState);
    if (newAutoscaleState) {
      resetZoom();
    }
  };

  // Save data
  const handleSaveData = () => {
    const allSeriesNames: string[] = [];
    plots.forEach(plot => {
      plot.series.forEach((_, seriesName) => {
        allSeriesNames.push(seriesName);
      });
    });

    const csv = allSeriesNames
      .map(seriesName => {
        const data = state.plotData.get(seriesName) || [];
        return data.map(point => `${seriesName},${new Date(point.x * 1000).toISOString()},${point.y}`);
      })
      .flat()
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dshub-plot-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load available registers from map
  useEffect(() => {
    const loadRegisters = async () => {
      const activeProfile = getActiveProfile();
      await mapManager.initialize(activeProfile);
      setAvailableRegisters(mapManager.getAllRegisters());
      setAvailableSystemRegisters(mapManager.getAllSystemRegisters());
    };
    loadRegisters();
  }, [settings.activeMapProfileId, getActiveProfile]);

  // Restore active plots from global state when component mounts
  useEffect(() => {

    const restoredSeries = new Map<string, PlotSeries>();
    state.activePlots.forEach((plotInfo, registerName) => {
      // Skip dashboard plots (they have 'dashboard:' prefix)
      if (registerName.startsWith('dashboard:')) {
        return;
      }
      restoredSeries.set(registerName, {
        name: registerName,
        color: COLORS[restoredSeries.size % COLORS.length],
        source: plotInfo.source ?? 'register',
        visible: true,
        pollInterval: plotInfo.pollInterval,
        address: plotInfo.address
      });
    });
    if (restoredSeries.size > 0) {
      setPlots(prev => {
        const firstPlot = prev[0];
        return [{
          ...firstPlot,
          series: restoredSeries
        }];
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate time window
  const now = Date.now();
  const timeWindowStart = now - (timeSpan * 1000);

  // Time config for axis with fixed step sizes
  const getTimeConfig = (spanSeconds: number) => {
    if (spanSeconds <= 120) {
      // Up to 2 minutes: 10 second intervals
      return { unit: 'second' as const, minUnit: 'second' as const, stepSize: 10, stepMs: 10_000, format: 'HH:mm:ss' };
    } else if (spanSeconds <= 600) {
      // Up to 10 minutes: 1 minute intervals
      return { unit: 'minute' as const, minUnit: 'minute' as const, stepSize: 1, stepMs: 60_000, format: 'HH:mm' };
    } else if (spanSeconds <= 3600) {
      // Up to 1 hour: 5 minute intervals
      return { unit: 'minute' as const, minUnit: 'minute' as const, stepSize: 5, stepMs: 300_000, format: 'HH:mm' };
    } else if (spanSeconds <= 21600) {
      // Up to 6 hours: 30 minute intervals
      return { unit: 'minute' as const, minUnit: 'minute' as const, stepSize: 30, stepMs: 1_800_000, format: 'HH:mm' };
    } else if (spanSeconds <= 86400) {
      // Up to 1 day: 2 hour intervals
      return { unit: 'hour' as const, minUnit: 'hour' as const, stepSize: 2, stepMs: 7_200_000, format: 'HH:mm' };
    } else {
      // More than 1 day: 6 hour intervals
      return { unit: 'hour' as const, minUnit: 'hour' as const, stepSize: 6, stepMs: 21_600_000, format: 'MMM dd HH:mm' };
    }
  };

  const timeConfig = getTimeConfig(timeSpan);
  const isLiveView = sharedXZoom.xMax === null;
  const overscanRatio = isLiveView ? timeConfig.stepMs / (timeSpan * 1000) : 0;

  // Filter data for time window
  const getFilteredData = (data: any[], windowStartMs: number) => {
    if (data.length === 0) return [];
    return data.filter(point => (point.x * 1000) >= windowStartMs);
  };

  // Calculate statistics for a series
  const calculateStatistics = (seriesName: string) => {
    const seriesData = state.plotData.get(seriesName) || [];
    const filteredData = getFilteredData(seriesData, timeWindowStart);

    if (filteredData.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0 };
    }

    const values = filteredData.map(point => point.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const avg = sum / values.length;

    return { min, max, avg, count: values.length };
  };

  // Generate chart data for a specific plot
  const getChartDataForPlot = (plot: PlotPanel) => {
    return {
      datasets: Array.from(plot.series.entries())
        .filter(([_, series]) => series.visible)
        .map(([seriesName, series]) => {
          const seriesData = state.plotData.get(seriesName) || [];
          const filteredData = getFilteredData(seriesData, timeWindowStart);

          return {
            label: seriesName,
            data: filteredData.map(point => ({
              x: point.x * 1000,
              y: point.y
            })),
            borderColor: series.color,
            backgroundColor: series.color + '20',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1,
          };
        })
    };
  };

  // Generate chart options for a specific plot
  const getChartOptionsForPlot = (plot: PlotPanel) => {
    // High contrast colors for text based on theme
    const textColor = theme.palette.mode === 'dark' ? '#FFFFFF' : '#000000';
    const gridColor = theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          left: 10,
          right: 10,
          top: 10,
          bottom: 10
        }
      },
      interaction: {
        mode: 'x' as const,
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: false,
        },
        tooltip: {
          filter: (tooltipItem: any, index: number, tooltipItems: any[]) => {
            // Only show one tooltip item per dataset
            const datasetIndex = tooltipItem.datasetIndex;
            const firstOccurrence = tooltipItems.findIndex(item => item.datasetIndex === datasetIndex);
            return index === firstOccurrence;
          },
          callbacks: {
            title: (context: any) => {
              return new Date(context[0].parsed.x).toLocaleTimeString();
            }
          }
        },
        decimation: {
          enabled: false
        }
      },
      scales: {
        x: {
          type: 'time' as const,
          min: sharedXZoom.xMin ?? timeWindowStart,
          max: sharedXZoom.xMax ?? (now + timeConfig.stepMs),
          time: {
            unit: timeConfig.unit,
            stepSize: timeConfig.stepSize,
            displayFormats: {
              second: 'HH:mm:ss',
              minute: 'HH:mm',
              hour: 'HH:mm',
              day: 'MMM dd HH:mm'
            }
          },
          title: {
            display: true,
            text: 'Time',
            color: textColor,
            font: {
              size: 14,
              weight: 'bold' as const
            }
          },
          ticks: {
            maxRotation: 0,
            color: textColor,
            font: {
              size: 12
            }
          },
          afterBuildTicks: (scale: any) => {
            // Force ticks at fixed absolute time positions (multiples of stepMs from epoch).
            // This ensures ticks slide smoothly as the time window moves, never jumping.
            const stepMs = timeConfig.stepMs;
            const min = scale.min;
            const max = scale.max;
            const firstTick = Math.ceil(min / stepMs) * stepMs;
            const ticks = [];
            for (let t = firstTick; t <= max; t += stepMs) {
              ticks.push({ value: t });
            }
            scale.ticks = ticks;
          },
          grid: {
            display: true,
            drawTicks: true,
            tickLength: 8,
            color: gridColor
          }
        },
        y: {
          type: 'linear' as const,
          title: {
            display: true,
            text: 'Value',
            color: textColor,
            font: {
              size: 14,
              weight: 'bold' as const
            }
          },
          ticks: {
            color: textColor,
            font: {
              size: 12
            }
          },
          grid: {
            color: gridColor
          },
          min: plot.zoomPan.yMin ?? undefined,
          max: plot.zoomPan.yMax ?? undefined,
          beginAtZero: false,
          grace: plot.zoomPan.yMin !== null ? undefined : '5%',
        },
      },
      animation: {
        duration: 0
      },
      transitions: {
        active: {
          animation: {
            duration: 0
          }
        }
      },
      elements: {
        line: {
          tension: 0
        },
        point: {
          radius: 0
        }
      }
    };
  };

  // Initialize refs for each plot
  useEffect(() => {
    plots.forEach(plot => {
      if (!chartRefs.current.has(plot.id)) {
        chartRefs.current.set(plot.id, React.createRef<ChartJS<"line", any, any>>());
      }
      if (!chartContainerRefs.current.has(plot.id)) {
        chartContainerRefs.current.set(plot.id, React.createRef<HTMLDivElement>());
      }
    });
  }, [plots]);

  // Cleanup all Chart.js instances on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      chartRefs.current.forEach((ref) => {
        if (ref.current) {
          ref.current.destroy();
        }
      });
      chartRefs.current.clear();
      chartContainerRefs.current.clear();
    };
  }, []);

  // Mouse wheel zoom handler for a specific plot
  const handleWheel = useCallback((plotId: string, e: React.WheelEvent) => {
    if (!isAutoscaleEnabled) {
      e.preventDefault();
      e.stopPropagation();
    } else {
      return;
    }

    const coords = getChartCoordinates(plotId, e.clientX, e.clientY);
    const chartRef = chartRefs.current.get(plotId);

    if (!coords || !chartRef?.current) {
      return;
    }

    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const chart = chartRef.current;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    // Zoom X-axis (shared across all plots)
    const currentXMin = sharedXZoom.xMin ?? xScale.min;
    const currentXMax = sharedXZoom.xMax ?? xScale.max;
    const xRange = currentXMax - currentXMin;
    const newXRange = xRange * zoomFactor;
    const xRatio = (coords.x - currentXMin) / xRange;
    const newXMin = coords.x - newXRange * xRatio;
    const newXMax = coords.x + newXRange * (1 - xRatio);

    setSharedXZoom({
      xMin: newXMin,
      xMax: newXMax
    });

    // Zoom Y-axis (per-plot)
    setPlots(prev => prev.map(plot => {
      if (plot.id === plotId) {
        const currentYMin = plot.zoomPan.yMin ?? yScale.min;
        const currentYMax = plot.zoomPan.yMax ?? yScale.max;
        const yRange = currentYMax - currentYMin;
        const newYRange = yRange * zoomFactor;
        const yRatio = (coords.y - currentYMin) / yRange;
        const newYMin = coords.y - newYRange * yRatio;
        const newYMax = coords.y + newYRange * (1 - yRatio);

        return {
          ...plot,
          zoomPan: {
            yMin: newYMin,
            yMax: newYMax,
            isZoomed: true
          }
        };
      }
      return plot;
    }));
  }, [isAutoscaleEnabled, sharedXZoom, getChartCoordinates]);

  // Mouse down handler for panning and rectangle zoom
  const handleMouseDown = useCallback((plotId: string, e: React.MouseEvent) => {
    if (isAutoscaleEnabled) return;

    const coords = getChartCoordinates(plotId, e.clientX, e.clientY);
    if (!coords) return;

    if (e.button === 1) {
      // Middle button - panning
      e.preventDefault();
      setPlots(prev => prev.map(plot => {
        if (plot.id === plotId) {
          return {
            ...plot,
            mouseState: {
              isPanning: true,
              isDrawing: false,
              startX: coords.x,
              startY: coords.y,
              currentX: coords.x,
              currentY: coords.y,
              startPixelX: coords.pixelX,
              startPixelY: coords.pixelY,
              currentPixelX: coords.pixelX,
              currentPixelY: coords.pixelY
            }
          };
        }
        return plot;
      }));
    } else if (e.button === 0) {
      // Left button - rectangle zoom
      setPlots(prev => prev.map(plot => {
        if (plot.id === plotId) {
          return {
            ...plot,
            mouseState: {
              isPanning: false,
              isDrawing: true,
              startX: coords.x,
              startY: coords.y,
              currentX: coords.x,
              currentY: coords.y,
              startPixelX: coords.pixelX,
              startPixelY: coords.pixelY,
              currentPixelX: coords.pixelX,
              currentPixelY: coords.pixelY
            }
          };
        }
        return plot;
      }));
    }
  }, [getChartCoordinates, isAutoscaleEnabled]);

  // Mouse move handler
  const handleMouseMove = useCallback((plotId: string, e: React.MouseEvent) => {
    const coords = getChartCoordinates(plotId, e.clientX, e.clientY);
    const chartRef = chartRefs.current.get(plotId);
    if (!coords || !chartRef?.current) return;

    const plot = plots.find(p => p.id === plotId);
    if (!plot) return;

    if (plot.mouseState.isPanning) {
      // Pan both X and Y axes
      const dx = coords.x - plot.mouseState.startX;
      const dy = coords.y - plot.mouseState.startY;

      const chart = chartRef.current;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;

      // Update shared X-axis
      const currentXMin = sharedXZoom.xMin ?? xScale.min;
      const currentXMax = sharedXZoom.xMax ?? xScale.max;
      setSharedXZoom({
        xMin: currentXMin - dx,
        xMax: currentXMax - dx
      });

      // Update Y-axis for this plot
      setPlots(prev => prev.map(p => {
        if (p.id === plotId) {
          const currentYMin = p.zoomPan.yMin ?? yScale.min;
          const currentYMax = p.zoomPan.yMax ?? yScale.max;
          return {
            ...p,
            zoomPan: {
              yMin: currentYMin - dy,
              yMax: currentYMax - dy,
              isZoomed: true
            },
            mouseState: {
              ...p.mouseState,
              startX: coords.x,
              startY: coords.y,
              startPixelX: coords.pixelX,
              startPixelY: coords.pixelY
            }
          };
        }
        return p;
      }));
    } else if (plot.mouseState.isDrawing) {
      // Update rectangle coordinates
      setPlots(prev => prev.map(p => {
        if (p.id === plotId) {
          return {
            ...p,
            mouseState: {
              ...p.mouseState,
              currentX: coords.x,
              currentY: coords.y,
              currentPixelX: coords.pixelX,
              currentPixelY: coords.pixelY
            }
          };
        }
        return p;
      }));
    }
  }, [plots, sharedXZoom, getChartCoordinates]);

  // Mouse up handler
  const handleMouseUp = useCallback((plotId: string, e: React.MouseEvent) => {
    const plot = plots.find(p => p.id === plotId);
    const chartRef = chartRefs.current.get(plotId);
    if (!plot || !chartRef?.current) return;

    if (plot.mouseState.isDrawing) {
      const minX = Math.min(plot.mouseState.startX, plot.mouseState.currentX);
      const maxX = Math.max(plot.mouseState.startX, plot.mouseState.currentX);
      const minY = Math.min(plot.mouseState.startY, plot.mouseState.currentY);
      const maxY = Math.max(plot.mouseState.startY, plot.mouseState.currentY);

      const chart = chartRef.current;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;

      // Check percentage for X-axis (shared)
      const currentXMin = sharedXZoom.xMin ?? xScale.min;
      const currentXMax = sharedXZoom.xMax ?? xScale.max;
      const currentXRange = currentXMax - currentXMin;
      const selectedXRange = maxX - minX;
      const xPercentage = (selectedXRange / currentXRange) * 100;

      // Check percentage for Y-axis (per-plot)
      const currentYMin = plot.zoomPan.yMin ?? yScale.min;
      const currentYMax = plot.zoomPan.yMax ?? yScale.max;
      const currentYRange = currentYMax - currentYMin;
      const selectedYRange = maxY - minY;
      const yPercentage = (selectedYRange / currentYRange) * 100;

      // Apply zoom if rectangle is at least 3% in both dimensions
      if (xPercentage >= 3 && yPercentage >= 3) {
        setSharedXZoom({ xMin: minX, xMax: maxX });
        setPlots(prev => prev.map(p => {
          if (p.id === plotId) {
            return {
              ...p,
              zoomPan: {
                yMin: minY,
                yMax: maxY,
                isZoomed: true
              }
            };
          }
          return p;
        }));
      }
    }

    // Reset mouse state
    setPlots(prev => prev.map(p => {
      if (p.id === plotId) {
        return {
          ...p,
          mouseState: {
            isPanning: false,
            isDrawing: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            startPixelX: 0,
            startPixelY: 0,
            currentPixelX: 0,
            currentPixelY: 0
          }
        };
      }
      return p;
    }));
  }, [plots, sharedXZoom]);

  // Double-click to reset zoom for specific plot
  const handleDoubleClick = useCallback((plotId: string) => {
    setSharedXZoom({ xMin: null, xMax: null });
    setPlots(prev => prev.map(plot => {
      if (plot.id === plotId) {
        return {
          ...plot,
          zoomPan: {
            yMin: null,
            yMax: null,
            isZoomed: false
          }
        };
      }
      return plot;
    }));
  }, []);

  // Add native wheel event listener to prevent page scroll for each plot
  useEffect(() => {
    const wheelHandlers = new Map<string, (e: WheelEvent) => void>();

    plots.forEach(plot => {
      const chartContainer = chartContainerRefs.current.get(plot.id)?.current;
      if (!chartContainer) return;

      const handleNativeWheel = (e: WheelEvent) => {
        // Use ref to get current value without re-attaching listener
        if (!isAutoscaleEnabledRef.current) {
          e.preventDefault();
        }
      };

      wheelHandlers.set(plot.id, handleNativeWheel);
      chartContainer.addEventListener('wheel', handleNativeWheel, { passive: false });
    });

    return () => {
      // Clean up all wheel event listeners
      wheelHandlers.forEach((handler, plotId) => {
        const chartContainer = chartContainerRefs.current.get(plotId)?.current;
        if (chartContainer) {
          chartContainer.removeEventListener('wheel', handler);
        }
      });
    };
  }, [plots]); // Only re-attach when plots array changes, use ref for isAutoscaleEnabled

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }

      // Use ref to get current value without dependency
      if (isAutoscaleEnabledRef.current) return;

      switch (e.key) {
        case '+':
        case '=':
          // Zoom in all plots - use ref to get current plots
          plotsRef.current.forEach(plot => {
            const chartRef = chartRefs.current.get(plot.id);
            if (chartRef?.current) {
              const chart = chartRef.current;
              const xScale = chart.scales.x;
              const yScale = chart.scales.y;
              const centerX = (xScale.min + xScale.max) / 2;
              const centerY = (yScale.min + yScale.max) / 2;

              const zoomFactor = 0.8;
              const xRange = (xScale.max - xScale.min) * zoomFactor;
              const yRange = (yScale.max - yScale.min) * zoomFactor;

              setSharedXZoom({
                xMin: centerX - xRange / 2,
                xMax: centerX + xRange / 2
              });

              setPlots(prev => prev.map(p => {
                if (p.id === plot.id) {
                  return {
                    ...p,
                    zoomPan: {
                      yMin: centerY - yRange / 2,
                      yMax: centerY + yRange / 2,
                      isZoomed: true
                    }
                  };
                }
                return p;
              }));
            }
          });
          e.preventDefault();
          break;

        case '-':
        case '_':
          // Zoom out all plots - use ref to get current plots
          plotsRef.current.forEach(plot => {
            const chartRef = chartRefs.current.get(plot.id);
            if (chartRef?.current) {
              const chart = chartRef.current;
              const xScale = chart.scales.x;
              const yScale = chart.scales.y;
              const centerX = (xScale.min + xScale.max) / 2;
              const centerY = (yScale.min + yScale.max) / 2;

              const zoomFactor = 1.2;
              const xRange = (xScale.max - xScale.min) * zoomFactor;
              const yRange = (yScale.max - yScale.min) * zoomFactor;

              setSharedXZoom({
                xMin: centerX - xRange / 2,
                xMax: centerX + xRange / 2
              });

              setPlots(prev => prev.map(p => {
                if (p.id === plot.id) {
                  return {
                    ...p,
                    zoomPan: {
                      yMin: centerY - yRange / 2,
                      yMax: centerY + yRange / 2,
                      isZoomed: true
                    }
                  };
                }
                return p;
              }));
            }
          });
          e.preventDefault();
          break;

        case 'Home':
        case 'h':
          resetZoom();
          e.preventDefault();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetZoom]); // Removed isAutoscaleEnabled and plots - using refs instead to avoid re-attaching listener

  // Cleanup resize handlers on unmount
  useEffect(() => {
    return () => {
      // Clean up any active resize handlers when component unmounts
      if (resizeHandlersRef.current.handleMouseMove) {
        document.removeEventListener('mousemove', resizeHandlersRef.current.handleMouseMove);
      }
      if (resizeHandlersRef.current.handleMouseUp) {
        document.removeEventListener('mouseup', resizeHandlersRef.current.handleMouseUp);
      }
      // Reset cursor and user select
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  return (
    <Box>
      {/* Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, sm: 1.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Source</InputLabel>
                <Select
                  value={selectedSource}
                  onChange={(e) => {
                    setSelectedSource(e.target.value as 'register' | 'sysRegister');
                    setSelectedRegister('');
                  }}
                  label="Source"
                >
                  <MenuItem value="register">Register</MenuItem>
                  <MenuItem value="sysRegister">System Register</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 2.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel>{selectedSource === 'sysRegister' ? 'System Register' : 'Register'}</InputLabel>
                <Select
                  value={selectedRegister}
                  onChange={(e) => setSelectedRegister(e.target.value)}
                  label={selectedSource === 'sysRegister' ? 'System Register' : 'Register'}
                >
                  {(selectedSource === 'sysRegister' ? availableSystemRegisters : availableRegisters).map(register => {
                    const existsInAnyPlot = plots.some(plot => plot.series.has(register.name));
                    return (
                      <MenuItem key={register.name} value={register.name} disabled={existsInAnyPlot}>
                        {register.name}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
              <TextField
                fullWidth
                size="small"
                label="Poll Interval (ms)"
                type="number"
                value={pollIntervalInput}
                onChange={(e) => setPollIntervalInput(e.target.value)}
                error={!validatePollInterval(pollIntervalInput).valid}
                helperText={validatePollInterval(pollIntervalInput).error}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Target Plot</InputLabel>
                <Select
                  value={selectedPlotId}
                  label="Target Plot"
                  onChange={(e) => setSelectedPlotId(e.target.value)}
                >
                  {plots.map((plot) => (
                    <MenuItem key={plot.id} value={plot.id}>
                      {plot.title}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddSeries}
                disabled={!selectedRegister || plots.some(plot => plot.series.has(selectedRegister))}
                fullWidth
              >
                Add Series
              </Button>
            </Grid>
            <Grid size={{ xs: 12, sm: 1.5 }}>
              <TextField
                fullWidth
                size="small"
                label="Time Span (s)"
                type="number"
                value={timeSpanInput}
                onChange={handleTimeSpanChange}
                error={!validateTimeSpan(timeSpanInput).valid}
                helperText={validateTimeSpan(timeSpanInput).error}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 2.5 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-start' }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={isAutoscaleEnabled}
                      onChange={handleAutoscaleToggle}
                      color="primary"
                    />
                  }
                  label="Autoscale"
                  sx={{ mr: 0 }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={showStatistics}
                      onChange={(e) => setShowStatistics(e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Statistics"
                  sx={{ mr: 0 }}
                />
                <IconButton
                  color="secondary"
                  onClick={handleSaveData}
                  title="Save Data"
                  disabled={plots.every(plot => plot.series.size === 0)}
                  size="small"
                >
                  <SaveIcon />
                </IconButton>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Plots */}
      {plots.map((plot, plotIndex) => (
        <Card key={`${plot.id}-${showStatistics}`} sx={{ mb: 2 }}>
          <CardContent>
            {/* Plot Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">
                {plot.title}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Active series chips for THIS plot */}
                {Array.from(plot.series.entries()).map(([name, series]) => (
                  <Chip
                    key={name}
                    label={name}
                    size="small"
                    style={{
                      backgroundColor: series.visible ? series.color : 'transparent',
                      color: series.visible ? 'white' : 'inherit',
                      border: `1px solid ${series.color}`
                    }}
                    onClick={() => handleSeriesVisibilityToggle(plot.id, name)}
                    onDelete={() => handleRemoveSeries(plot.id, name)}
                    deleteIcon={<RemoveIcon />}
                  />
                ))}

                {/* Remove plot button (only if more than 1 plot) */}
                {plots.length > 1 && (
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRemovePlot(plot.id)}
                    title="Remove Plot"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            </Box>

            {/* Chart and Statistics */}
            <Box sx={{ display: 'flex', gap: 2, position: 'relative' }}>
              <Paper
                ref={chartContainerRefs.current.get(plot.id)}
                sx={{
                  p: 2,
                  height: plot.height,
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: plot.mouseState.isPanning ? 'grabbing' : (plot.mouseState.isDrawing ? 'crosshair' : 'default'),
                  flex: showStatistics ? '1 1 70%' : '1 1 100%'
                }}
                onWheel={(e) => handleWheel(plot.id, e)}
                onMouseDown={(e) => handleMouseDown(plot.id, e)}
                onMouseMove={(e) => handleMouseMove(plot.id, e)}
                onMouseUp={(e) => handleMouseUp(plot.id, e)}
                onDoubleClick={() => handleDoubleClick(plot.id)}
                onContextMenu={(e) => e.preventDefault()}
              >
                {plot.series.size > 0 ? (
                  <>
                    <Box sx={{ width: `${(1 + overscanRatio) * 100}%`, height: '100%' }}>
                      <Line
                        ref={chartRefs.current.get(plot.id)}
                        data={getChartDataForPlot(plot)}
                        options={getChartOptionsForPlot(plot)}
                      />
                    </Box>
                    {/* Zoom rectangle visual feedback */}
                    {plot.mouseState.isDrawing && chartRefs.current.get(plot.id)?.current && (
                      <Box
                        sx={{
                          position: 'absolute',
                          border: '2px dashed #00D4FF',
                          backgroundColor: 'rgba(0, 212, 255, 0.1)',
                          pointerEvents: 'none',
                          left: Math.min(plot.mouseState.startPixelX, plot.mouseState.currentPixelX),
                          top: Math.min(plot.mouseState.startPixelY, plot.mouseState.currentPixelY),
                          width: Math.abs(plot.mouseState.currentPixelX - plot.mouseState.startPixelX),
                          height: Math.abs(plot.mouseState.currentPixelY - plot.mouseState.startPixelY),
                        }}
                      />
                    )}
                  </>
                ) : (
                  <EmptyState
                    icon={<ShowChartIcon />}
                    title="No Series"
                    subtitle="Add a register series to begin visualization."
                  />
                )}
              </Paper>

              {/* Statistics Table */}
              {showStatistics && plot.series.size > 0 && (
                <TableContainer component={Paper} sx={{ flex: '0 0 30%', minWidth: '250px', maxHeight: plot.height }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold' }}>Curve</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Min</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Max</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Avg</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Array.from(plot.series.entries()).map(([name, series]) => {
                        const stats = calculateStatistics(name);
                        return (
                          <TableRow
                            key={name}
                            sx={{
                              opacity: series.visible ? 1 : 0.5,
                              '&:hover': { backgroundColor: 'action.hover' }
                            }}
                          >
                            <TableCell
                              sx={{
                                cursor: 'pointer',
                                fontWeight: 'bold'
                              }}
                              onClick={() => handleSeriesVisibilityToggle(plot.id, name)}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box
                                  sx={{
                                    width: '3px',
                                    height: '16px',
                                    backgroundColor: series.color,
                                    borderRadius: '2px'
                                  }}
                                />
                                {name}
                              </Box>
                            </TableCell>
                            <TableCell align="right">{stats.min.toFixed(2)}</TableCell>
                            <TableCell align="right">{stats.max.toFixed(2)}</TableCell>
                            <TableCell align="right">{stats.avg.toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* Resize Handle */}
              <Box
                onMouseDown={(e) => handleResizeStart(plot.id, e)}
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '8px',
                  cursor: 'ns-resize',
                  backgroundColor: 'transparent',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                  '&:active': {
                    backgroundColor: 'action.selected',
                  },
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1
                }}
              >
                <Box
                  sx={{
                    width: '40px',
                    height: '4px',
                    borderRadius: '2px',
                    backgroundColor: 'action.active',
                    opacity: 0.5
                  }}
                />
              </Box>
            </Box>
          </CardContent>
        </Card>
      ))}

      {/* Add Plot Button */}
      {plots.length < MAX_PLOTS && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddPlot}
            sx={{
              borderStyle: 'dashed',
              borderWidth: 2,
              py: 2,
              px: 4,
              '&:hover': {
                borderStyle: 'dashed',
                borderWidth: 2,
              }
            }}
          >
            Add Plot ({plots.length}/{MAX_PLOTS})
          </Button>
        </Box>
      )}
    </Box>
  );
}
