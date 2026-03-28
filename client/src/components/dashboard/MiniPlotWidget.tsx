import React, { useEffect, useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { MiniPlotWidgetConfig } from '../../types/dashboard';

ChartJS.register(LinearScale, PointElement, LineElement, ChartTooltip, Legend);
import { WidgetSizeInfo, scaledRem, scaledPx } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';

interface DataPoint {
  x: number; // timestamp
  y: number; // value
}

interface MiniPlotWidgetProps {
  config: MiniPlotWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

export default function MiniPlotWidget({ config, isEditMode, widgetSize }: MiniPlotWidgetProps) {
  const { palette: { custom: c } } = useTheme();
  const { state } = useDSHub();
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);

  // Set up auto-refresh for data collection
  useAutoRefresh({
    source: config.source,
    address: config.address,
    refreshInterval: config.pollInterval,
    isEditMode,
  });

  // Get current data from state
  const currentData = config.source === 'register'
    ? state.registers.get(config.address)
    : config.source === 'sysRegister'
    ? state.systemRegisters.get(config.address)
    : state.parameters.get(config.address);

  // Collect data points - triggers on every new read (timestamp change), even if value stays the same
  useEffect(() => {
    if (currentData?.value === undefined || isEditMode) return;

    const now = Date.now();
    const cutoffTime = now - config.timeWindow * 1000;

    // Calculate max data points based on time window and poll interval (+10% buffer)
    const maxDataPoints = Math.ceil((config.timeWindow * 1000 / config.pollInterval) * 1.1);

    setDataPoints(prev => {
      // Add new point
      const newPoints = [...prev, { x: now, y: currentData.value as number }];

      // Filter out old points based on time window
      let filtered = newPoints.filter(point => point.x >= cutoffTime);

      // Enforce maximum data points limit to prevent memory growth
      if (filtered.length > maxDataPoints) {
        filtered = filtered.slice(filtered.length - maxDataPoints);
      }

      return filtered;
    });
  }, [currentData?.timestamp, isEditMode, config.timeWindow, config.pollInterval]);

  const chartData = {
    datasets: [
      {
        label: config.label,
        data: dataPoints,
        borderColor: config.color || '#00D4FF',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
      }
    ]
  };

  const now = Date.now();
  // Use earliest collected point as min so the axis grows left-to-right as data
  // accumulates, then slides once it fills the full window. Without this,
  // the axis always spans the full timeWindow even when only a few points exist,
  // making data appear crammed into the right edge.
  const xMin = dataPoints.length > 0 ? dataPoints[0].x : now - config.timeWindow * 1000;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    scales: {
      x: {
        type: 'linear' as const,
        min: xMin,
        max: now,
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
            size: widgetSize ? scaledPx(10, widgetSize.scale) : 10
          }
        },
        grid: {
          color: c.ghost
        }
      }
    },
    plugins: {
      legend: {
        display: config.showLegend || false,
        position: 'top' as const,
        labels: {
          font: {
            size: widgetSize ? scaledPx(10, widgetSize.scale) : 10
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

  const errorState = getWidgetError(config.source, config.address);
  if (errorState) return errorState;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 1
      }}
    >
      <Typography variant="overline" sx={{ color: 'text.secondary', fontSize: widgetSize ? scaledRem(0.6, widgetSize.scale) : '0.6rem', letterSpacing: '0.08em' }}>
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
              {state.connection?.connected ? `Collecting… ${config.pollInterval}ms poll` : 'Not connected'}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
