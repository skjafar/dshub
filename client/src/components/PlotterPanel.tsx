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
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Download as SaveIcon,
  RestartAlt as ResetIcon,
  Info as InfoIcon
} from '@mui/icons-material';
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
import { useDeviceMon } from '../contexts/DeviceMonContext';
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
  '#4A9EFF',
  '#FF6B9D', 
  '#FFA726',
  '#FF5722',
  '#AB47BC',
  '#4CAF50',
  '#FF9800',
  '#9C27B0'
];

interface PlotSeries {
  name: string;
  color: string;
  visible: boolean;
  pollInterval: number;
}

interface ZoomPanState {
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  isZoomed: boolean;
}

interface MouseState {
  isDrawing: boolean;
  isPanning: boolean;
  startX: number;  // Data coordinates
  startY: number;  // Data coordinates
  currentX: number;  // Data coordinates
  currentY: number;  // Data coordinates
  startPixelX: number;  // Pixel coordinates for visual feedback
  startPixelY: number;  // Pixel coordinates for visual feedback
  currentPixelX: number;  // Pixel coordinates for visual feedback
  currentPixelY: number;  // Pixel coordinates for visual feedback
}


export default function PlotterPanel() {
  const { state, actions } = useDeviceMon();
  const { settings, getActiveProfile } = useSettings();
  const { showSuccess, showError } = useToast();
  const [selectedRegister, setSelectedRegister] = useState('');
  const [pollIntervalInput, setPollIntervalInput] = useState(settings.plotDefaults.pollInterval.toString());
  const [isAutoscaleEnabled, setIsAutoscaleEnabled] = useState(true);
  const [activeSeries, setActiveSeries] = useState<Map<string, PlotSeries>>(new Map());
  const [timeSpan, setTimeSpan] = useState(settings.plotDefaults.timeSpan);
  const [timeSpanInput, setTimeSpanInput] = useState(settings.plotDefaults.timeSpan.toString());
  const [availableRegisters, setAvailableRegisters] = useState<MapEntry[]>([]);

  const chartRef = useRef<ChartJS<"line", any, any>>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Zoom/Pan state
  const [zoomPan, setZoomPan] = useState<ZoomPanState>({
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
    isZoomed: false
  });

  // Mouse interaction state
  const [mouseState, setMouseState] = useState<MouseState>({
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
  });

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

  // Zoom/Pan helper functions
  const getChartCoordinates = useCallback((clientX: number, clientY: number) => {
    if (!chartRef.current || !chartContainerRef.current) {
      return null;
    }

    const chart = chartRef.current;
    const chartArea = chart.chartArea;

    // ChartArea might not be initialized yet
    if (!chartArea) {
      return null;
    }

    const rect = chartContainerRef.current.getBoundingClientRect();

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Check if within chart area
    if (x < chartArea.left || x > chartArea.right || y < chartArea.top || y > chartArea.bottom) {
      return null;
    }

    // Convert pixel coordinates to data coordinates
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


  const resetZoom = useCallback(() => {
    setZoomPan({
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null,
      isZoomed: false
    });
    showSuccess('Zoom/Pan reset');
  }, [showSuccess]);

  // Mouse wheel zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // If autoscale is disabled, prevent page scroll immediately
    if (!isAutoscaleEnabled) {
      e.preventDefault();
      e.stopPropagation();
    } else {
      return; // Let page scroll normally when autoscale is enabled
    }

    const coords = getChartCoordinates(e.clientX, e.clientY);

    // Only handle zoom if mouse is over chart
    if (!coords || !chartRef.current) {
      return;
    }

    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9; // Zoom out or in

    // Zoom both X and Y axes
    const xScale = chartRef.current.scales.x;
    const yScale = chartRef.current.scales.y;

    const currentXMin = zoomPan.xMin ?? xScale.min;
    const currentXMax = zoomPan.xMax ?? xScale.max;
    const currentYMin = zoomPan.yMin ?? yScale.min;
    const currentYMax = zoomPan.yMax ?? yScale.max;

    const xRange = currentXMax - currentXMin;
    const yRange = currentYMax - currentYMin;

    const newXRange = xRange * zoomFactor;
    const newYRange = yRange * zoomFactor;

    const xRatio = (coords.x - currentXMin) / xRange;
    const yRatio = (coords.y - currentYMin) / yRange;

    const newXMin = coords.x - newXRange * xRatio;
    const newXMax = coords.x + newXRange * (1 - xRatio);
    const newYMin = coords.y - newYRange * yRatio;
    const newYMax = coords.y + newYRange * (1 - yRatio);

    setZoomPan({
      xMin: newXMin,
      xMax: newXMax,
      yMin: newYMin,
      yMax: newYMax,
      isZoomed: true
    });
  }, [isAutoscaleEnabled, zoomPan, getChartCoordinates]);

  // Mouse down handler - for both panning and rectangle zoom
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only handle mouse interactions if autoscale is disabled
    if (isAutoscaleEnabled) return;

    const coords = getChartCoordinates(e.clientX, e.clientY);
    if (!coords) {
      return;
    }

    if (e.button === 1) {
      // Middle button - panning Y-axis only
      e.preventDefault();
      setMouseState({
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
      });
    } else if (e.button === 0) {
      // Left button - rectangle zoom Y-axis only
      setMouseState({
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
      });
    }
  }, [getChartCoordinates, isAutoscaleEnabled]);

  // Mouse move handler
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getChartCoordinates(e.clientX, e.clientY);
    if (!coords || !chartRef.current) return;

    if (mouseState.isPanning) {
      // Pan both X and Y axes
      const dx = coords.x - mouseState.startX;
      const dy = coords.y - mouseState.startY;

      const xScale = chartRef.current.scales.x;
      const yScale = chartRef.current.scales.y;

      const currentXMin = zoomPan.xMin ?? xScale.min;
      const currentXMax = zoomPan.xMax ?? xScale.max;
      const currentYMin = zoomPan.yMin ?? yScale.min;
      const currentYMax = zoomPan.yMax ?? yScale.max;

      setZoomPan({
        xMin: currentXMin - dx,
        xMax: currentXMax - dx,
        yMin: currentYMin - dy,
        yMax: currentYMax - dy,
        isZoomed: true
      });

      setMouseState(prev => ({
        ...prev,
        startX: coords.x,
        startY: coords.y,
        startPixelX: coords.pixelX,
        startPixelY: coords.pixelY
      }));
    } else if (mouseState.isDrawing) {
      // Update rectangle coordinates while drawing
      setMouseState(prev => ({
        ...prev,
        currentX: coords.x,
        currentY: coords.y,
        currentPixelX: coords.pixelX,
        currentPixelY: coords.pixelY
      }));
    }
  }, [mouseState, zoomPan, getChartCoordinates]);

  // Mouse up handler
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (mouseState.isDrawing && chartRef.current) {
      // Apply rectangle zoom on both X and Y axes
      const minX = Math.min(mouseState.startX, mouseState.currentX);
      const maxX = Math.max(mouseState.startX, mouseState.currentX);
      const minY = Math.min(mouseState.startY, mouseState.currentY);
      const maxY = Math.max(mouseState.startY, mouseState.currentY);

      // Get current plot ranges
      const xScale = chartRef.current.scales.x;
      const yScale = chartRef.current.scales.y;
      const currentXMin = zoomPan.xMin ?? xScale.min;
      const currentXMax = zoomPan.xMax ?? xScale.max;
      const currentYMin = zoomPan.yMin ?? yScale.min;
      const currentYMax = zoomPan.yMax ?? yScale.max;

      const currentXRange = currentXMax - currentXMin;
      const currentYRange = currentYMax - currentYMin;

      // Calculate selected range as percentage of current plot
      const selectedXRange = maxX - minX;
      const selectedYRange = maxY - minY;
      const xPercentage = (selectedXRange / currentXRange) * 100;
      const yPercentage = (selectedYRange / currentYRange) * 100;

      // Only apply zoom if rectangle is at least 3% in both dimensions
      if (xPercentage >= 3 && yPercentage >= 3) {
        setZoomPan({
          xMin: minX,
          xMax: maxX,
          yMin: minY,
          yMax: maxY,
          isZoomed: true
        });
      }
      // If too small, silently ignore
    }

    setMouseState({
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
    });
  }, [mouseState, zoomPan]);

  // Double-click to reset zoom
  const handleDoubleClick = useCallback(() => {
    resetZoom();
  }, [resetZoom]);

  // Add native wheel event listener to prevent page scroll
  useEffect(() => {
    const chartContainer = chartContainerRef.current;
    if (!chartContainer) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (!isAutoscaleEnabled) {
        e.preventDefault();
      }
    };

    // Use passive: false to allow preventDefault
    chartContainer.addEventListener('wheel', handleNativeWheel, { passive: false });

    return () => {
      chartContainer.removeEventListener('wheel', handleNativeWheel);
    };
  }, [isAutoscaleEnabled]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keyboard shortcuts when chart is focused or no input is focused
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return; // Don't interfere with text input
      }

      // Only allow keyboard shortcuts when autoscale is disabled
      if (isAutoscaleEnabled) return;

      switch (e.key) {
        case '+':
        case '=':
          // Zoom in both axes (center of viewport)
          if (chartRef.current) {
            const chart = chartRef.current;
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;
            const centerX = (xScale.min + xScale.max) / 2;
            const centerY = (yScale.min + yScale.max) / 2;

            const zoomFactor = 0.8;
            const xRange = (xScale.max - xScale.min) * zoomFactor;
            const yRange = (yScale.max - yScale.min) * zoomFactor;

            setZoomPan({
              xMin: centerX - xRange / 2,
              xMax: centerX + xRange / 2,
              yMin: centerY - yRange / 2,
              yMax: centerY + yRange / 2,
              isZoomed: true
            });
          }
          e.preventDefault();
          break;

        case '-':
        case '_':
          // Zoom out both axes (center of viewport)
          if (chartRef.current) {
            const chart = chartRef.current;
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;
            const centerX = (xScale.min + xScale.max) / 2;
            const centerY = (yScale.min + yScale.max) / 2;

            const zoomFactor = 1.2;
            const xRange = (xScale.max - xScale.min) * zoomFactor;
            const yRange = (yScale.max - yScale.min) * zoomFactor;

            setZoomPan({
              xMin: centerX - xRange / 2,
              xMax: centerX + xRange / 2,
              yMin: centerY - yRange / 2,
              yMax: centerY + yRange / 2,
              isZoomed: true
            });
          }
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
  }, [isAutoscaleEnabled, resetZoom]);

  // Handler for time span changes
  const handleTimeSpanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTimeSpanInput(value);

    const validation = validateTimeSpan(value);
    if (validation.valid) {
      const newTimeSpan = parseInt(value);
      setTimeSpan(newTimeSpan);

      // Update time span for all active series
      activeSeries.forEach((_, seriesName) => {
        actions.setPlotTimeSpan(seriesName, newTimeSpan);
      });
    }
  };

  // Load available registers from map
  React.useEffect(() => {
    const loadRegisters = async () => {
      const activeProfile = getActiveProfile();
      await mapManager.initialize(activeProfile);
      const registers = mapManager.getAllRegisters();
      setAvailableRegisters(registers);
    };
    loadRegisters();
  }, [settings.activeMapProfileId, getActiveProfile]);

  // Restore active plots from global state when component mounts
  React.useEffect(() => {
    const restoredSeries = new Map<string, PlotSeries>();
    state.activePlots.forEach((plotInfo, registerName) => {
      restoredSeries.set(registerName, {
        name: registerName,
        color: COLORS[restoredSeries.size % COLORS.length],
        visible: true,
        pollInterval: plotInfo.pollInterval
      });
    });
    if (restoredSeries.size > 0) {
      setActiveSeries(restoredSeries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount to restore saved plots

  // Calculate fixed time window for stable x-axis (eliminates jitter)
  const now = Date.now();
  const timeWindowStart = now - (timeSpan * 1000);

  // Determine appropriate time unit and display format based on time span
  const getTimeConfig = (spanSeconds: number) => {
    if (spanSeconds <= 120) {
      // Up to 2 minutes: show seconds
      return { unit: 'second' as const, minUnit: 'second', format: 'HH:mm:ss' };
    } else if (spanSeconds <= 3600) {
      // Up to 1 hour: show minutes
      return { unit: 'minute' as const, minUnit: 'minute', format: 'HH:mm' };
    } else if (spanSeconds <= 86400) {
      // Up to 1 day: show hours
      return { unit: 'hour' as const, minUnit: 'hour', format: 'HH:mm' };
    } else {
      // More than 1 day: show days
      return { unit: 'day' as const, minUnit: 'hour', format: 'MMM dd HH:mm' };
    }
  };

  const timeConfig = getTimeConfig(timeSpan);

  // Clean old data points based on time window (in milliseconds)
  const getFilteredData = (data: any[], windowStartMs: number) => {
    if (data.length === 0) return [];

    // Filter points to only show those within the visible time window
    // point.x is in seconds, convert to ms for comparison
    return data.filter(point => (point.x * 1000) >= windowStartMs);
  };

  const chartData = {
    datasets: Array.from(activeSeries.entries())
      .filter(([name, series]) => series.visible)
      .map(([name, series]) => {
        const seriesData = state.plotData.get(name) || [];
        const filteredData = getFilteredData(seriesData, timeWindowStart);

        return {
          label: name,
          data: filteredData.map(point => ({
            x: point.x * 1000, // Convert to milliseconds for Chart.js
            y: point.y
          })),
          borderColor: series.color,
          backgroundColor: series.color + '20', // Add transparency
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.1,
        };
      })
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    // Remove events: [] to allow events to work properly
    // events: [],
    layout: {
      padding: {
        left: 50,   // Reserve space for y-axis labels
        right: 20,
        top: 20,
        bottom: 40  // Reserve space for x-axis labels (prevents shift)
      }
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Real-time Device Data',
      },
      tooltip: {
        callbacks: {
          title: (context: any) => {
            return new Date(context[0].parsed.x).toLocaleTimeString();
          }
        }
      },
      decimation: {
        enabled: true,
        algorithm: 'lttb' as const,
        samples: 500
      }
    },
    scales: {
      x: {
        type: 'time' as const,
        min: zoomPan.xMin ?? timeWindowStart,  // Use zoom state if available
        max: zoomPan.xMax ?? now,              // Use zoom state if available
        time: {
          unit: timeConfig.unit,
          minUnit: timeConfig.minUnit,
          displayFormats: {
            second: 'HH:mm:ss',
            minute: 'HH:mm',
            hour: 'HH:mm',
            day: 'MMM dd HH:mm'
          }
        },
        title: {
          display: true,
          text: 'Time'
        },
        ticks: {
          maxRotation: 0,
          autoSkip: true,       // Enable auto-skip for large time spans
          maxTicksLimit: 10,    // Fixed number of ticks for consistent spacing
          source: 'auto',       // Let Chart.js generate optimal ticks
          major: {
            enabled: true
          }
        },
        bounds: 'ticks',        // Scale boundaries based on ticks, not data
        grid: {
          display: true,
          drawTicks: true,
          tickLength: 8
        }
      },
      y: {
        type: 'linear' as const,
        title: {
          display: true,
          text: 'Value'
        },
        min: zoomPan.yMin ?? undefined,
        max: zoomPan.yMax ?? undefined,
        beginAtZero: false,  // Don't force y-axis to start at zero
        grace: zoomPan.yMin !== null ? undefined : '5%',  // No grace when zoomed
      },
    },
    animation: false,
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

  const handleAddSeries = () => {
    if (!selectedRegister) return;

    // Validate poll interval before adding
    const validation = validatePollInterval(pollIntervalInput);
    if (!validation.valid) {
      return;
    }

    const pollInterval = parseInt(pollIntervalInput);

    // Get the register address from the map
    const register = availableRegisters.find(r => r.name === selectedRegister);
    if (!register) {
      showError(`Register ${selectedRegister} not found in map`);
      return;
    }

    const newSeries: PlotSeries = {
      name: selectedRegister,
      color: COLORS[activeSeries.size % COLORS.length],
      visible: true,
      pollInterval
    };

    setActiveSeries(prev => {
      const newMap = new Map(prev);
      newMap.set(selectedRegister, newSeries);
      return newMap;
    });

    actions.startPlotting(selectedRegister, pollInterval, register.address);
    actions.setPlotTimeSpan(selectedRegister, timeSpan);
    setSelectedRegister('');
    showSuccess('Series added');
  };

  const handleRemoveSeries = (seriesName: string) => {
    setActiveSeries(prev => {
      const newMap = new Map(prev);
      newMap.delete(seriesName);
      return newMap;
    });
    actions.stopPlotting(seriesName);
    actions.clearPlotData(seriesName);
  };

  const handleSeriesVisibilityToggle = (seriesName: string) => {
    setActiveSeries(prev => {
      const newMap = new Map(prev);
      const series = newMap.get(seriesName);
      if (series) {
        newMap.set(seriesName, { ...series, visible: !series.visible });
      }
      return newMap;
    });
  };

  const handleAutoscaleToggle = () => {
    const newAutoscaleState = !isAutoscaleEnabled;
    setIsAutoscaleEnabled(newAutoscaleState);
    if (newAutoscaleState) {
      // Reset zoom when enabling autoscale
      resetZoom();
    }
  };

  const handleSaveData = () => {
    // Export current plot data as CSV
    const csv = Array.from(activeSeries.keys())
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
    a.download = `devicemon-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Typography variant="h5" component="h1" gutterBottom>
        Real-time Data Plotter
      </Typography>

      {/* Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, sm: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Register</InputLabel>
                <Select
                  value={selectedRegister}
                  onChange={(e) => setSelectedRegister(e.target.value)}
                  label="Register"
                >
                  {availableRegisters.map(register => (
                    <MenuItem key={register.name} value={register.name}>
                      {register.name}
                    </MenuItem>
                  ))}
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
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddSeries}
                disabled={!selectedRegister || activeSeries.has(selectedRegister)}
                fullWidth
              >
                Add Series
              </Button>
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
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
            <Grid size={{ xs: 12, sm: 3 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={isAutoscaleEnabled}
                      onChange={handleAutoscaleToggle}
                      color="primary"
                    />
                  }
                  label="Autoscale"
                />
                <IconButton
                  color="secondary"
                  onClick={handleSaveData}
                  title="Save Data"
                  disabled={activeSeries.size === 0}
                >
                  <SaveIcon />
                </IconButton>
              </Box>
            </Grid>
          </Grid>

          {/* Active Series */}
          {activeSeries.size > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Active Series:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {Array.from(activeSeries.entries()).map(([name, series]) => (
                  <Chip
                    key={name}
                    label={name}
                    size="small"
                    style={{
                      backgroundColor: series.visible ? series.color : 'transparent',
                      color: series.visible ? 'white' : 'inherit',
                      border: `1px solid ${series.color}`
                    }}
                    onClick={() => handleSeriesVisibilityToggle(name)}
                    onDelete={() => handleRemoveSeries(name)}
                    deleteIcon={<RemoveIcon />}
                  />
                ))}
              </Box>
            </Box>
          )}

        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {!isAutoscaleEnabled && (
                <Chip label="Pan/Zoom Enabled" color="info" size="small" />
              )}
              {zoomPan.isZoomed && (
                <Chip label="Zoomed" color="success" size="small" />
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip
                title={
                  <Box>
                    <Typography variant="caption" component="div" sx={{ fontWeight: 'bold', mb: 1 }}>
                      Zoom/Pan Controls (when Autoscale is OFF)
                    </Typography>
                    <Typography variant="caption" component="div" sx={{ mb: 0.5 }}>
                      <strong>Mouse:</strong>
                    </Typography>
                    <Typography variant="caption" component="div">
                      • Scroll wheel: Zoom both axes
                    </Typography>
                    <Typography variant="caption" component="div">
                      • Middle-button drag: Pan both axes
                    </Typography>
                    <Typography variant="caption" component="div" sx={{ mb: 0.5 }}>
                      • Left-button drag: Rectangle zoom both axes
                    </Typography>
                    <Typography variant="caption" component="div" sx={{ mb: 0.5 }}>
                      <strong>Keyboard:</strong>
                    </Typography>
                    <Typography variant="caption" component="div">
                      • +/- : Zoom in/out both axes
                    </Typography>
                    <Typography variant="caption" component="div">
                      • Home/H : Reset zoom
                    </Typography>
                    <Typography variant="caption" component="div">
                      • Double-click : Reset zoom
                    </Typography>
                  </Box>
                }
              >
                <IconButton size="small">
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {zoomPan.isZoomed && (
                <IconButton
                  size="small"
                  onClick={resetZoom}
                  title="Reset Zoom/Pan"
                  color="primary"
                >
                  <ResetIcon />
                </IconButton>
              )}
            </Box>
          </Box>

          <Paper
            ref={chartContainerRef}
            sx={{
              p: 2,
              height: 500,
              position: 'relative',
              cursor: mouseState.isPanning ? 'grabbing' : (mouseState.isDrawing ? 'crosshair' : 'default')
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onContextMenu={(e) => e.preventDefault()}
          >
            {activeSeries.size > 0 ? (
              <>
                <Line ref={chartRef} data={chartData} options={chartOptions} />
                {/* Zoom rectangle visual feedback */}
                {mouseState.isDrawing && chartRef.current && (
                  <Box
                    sx={{
                      position: 'absolute',
                      border: '2px dashed #4A9EFF',
                      backgroundColor: 'rgba(74, 158, 255, 0.1)',
                      pointerEvents: 'none',
                      left: Math.min(mouseState.startPixelX, mouseState.currentPixelX),
                      top: Math.min(mouseState.startPixelY, mouseState.currentPixelY),
                      width: Math.abs(mouseState.currentPixelX - mouseState.startPixelX),
                      height: Math.abs(mouseState.currentPixelY - mouseState.startPixelY),
                    }}
                  />
                )}
              </>
            ) : (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'text.secondary'
                }}
              >
                <Typography>
                  Add a register series to start plotting real-time data
                </Typography>
              </Box>
            )}
          </Paper>
        </CardContent>
      </Card>
    </Box>
  );
}