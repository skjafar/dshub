import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Line } from 'react-chartjs-2';
import { MiniPlotWidgetConfig } from '../../types/dashboard';
import { useDeviceMon } from '../../contexts/DeviceMonContext';
import { mapManager } from '../../maps/mapManager';

interface DataPoint {
  x: number; // timestamp
  y: number; // value
}

interface MiniPlotWidgetProps {
  config: MiniPlotWidgetConfig;
  isEditMode: boolean;
}

export default function MiniPlotWidget({ config, isEditMode }: MiniPlotWidgetProps) {
  const { state, actions } = useDeviceMon();
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);

  // Get the actual register/parameter name from the map - NEVER use synthetic names
  const mapEntry = config.source === 'register'
    ? mapManager.getRegisterByAddress(config.address)
    : mapManager.getParameterByAddress(config.address);

  const actualName = mapEntry?.name;

  // Get current data from state
  const currentData = config.source === 'register'
    ? state.registers.get(config.address)
    : state.parameters.get(config.address);

  // Collect data points - triggers on every new read (timestamp change), even if value stays the same
  useEffect(() => {
    if (currentData?.value === undefined || isEditMode) return;

    const now = Date.now();
    const cutoffTime = now - config.timeWindow * 1000;

    setDataPoints(prev => {
      // Add new point
      const newPoints = [...prev, { x: now, y: currentData.value as number }];

      // Filter out old points
      return newPoints.filter(point => point.x >= cutoffTime);
    });
  }, [currentData?.timestamp, isEditMode, config.timeWindow]);

  // Start plotting when widget mounts
  useEffect(() => {
    if (isEditMode || !state.connection?.connected) return;

    // Only start plotting if we have a valid name from the map
    if (!mapManager.isInitialized() || !actualName) {
      console.warn(`Cannot start plotting for ${config.source} ${config.address}: Map not loaded or name not found`);
      return;
    }

    // Start plotting using the actual register/parameter name from the map
    if (config.source === 'register') {
      actions.startPlotting(actualName, config.pollInterval, config.address);
    }

    return () => {
      // Stop plotting when unmounted (use actual name)
      if (actualName) {
        actions.stopPlotting(actualName);
      }
    };
  }, [config.source, config.address, config.pollInterval, isEditMode, state.connection?.connected, actualName]);

  const chartData = {
    datasets: [
      {
        label: config.label,
        data: dataPoints,
        borderColor: config.color || '#4A9EFF',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    scales: {
      x: {
        type: 'linear' as const,
        min: Date.now() - config.timeWindow * 1000,
        max: Date.now(),
        ticks: {
          display: false
        },
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: false,
        ticks: {
          maxTicksLimit: 4,
          font: {
            size: 10
          }
        },
        grid: {
          color: 'rgba(128, 128, 128, 0.1)'
        }
      }
    },
    plugins: {
      legend: {
        display: config.showLegend || false,
        position: 'top' as const,
        labels: {
          font: {
            size: 10
          }
        }
      },
      tooltip: {
        enabled: !isEditMode,
        callbacks: {
          title: (context: any) => {
            return new Date(context[0].parsed.x).toLocaleTimeString();
          }
        }
      }
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 1
      }}
    >
      <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
        {config.label}
      </Typography>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        {dataPoints.length > 0 ? (
          <Line data={chartData} options={chartOptions} />
        ) : (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%'
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {state.connection?.connected ? 'Collecting data...' : 'Not connected'}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
