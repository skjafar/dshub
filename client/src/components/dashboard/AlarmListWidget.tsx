import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { AlarmListWidgetConfig, AlarmRule } from '../../types/dashboard';
import { WidgetSizeInfo, scaledRem, scaledPx, isCompactSize } from '../../utils/widgetScaling';
import { useDSHub } from '../../contexts/DSHubContext';
import { useAutoRefreshMulti } from '../../hooks/useAutoRefresh';
import { getWidgetError } from './WidgetErrorState';
import { FONT_MONO, FONT_HEADLINE } from '../../theme';

interface AlarmListWidgetProps {
  config: AlarmListWidgetConfig;
  isEditMode: boolean;
  widgetSize?: WidgetSizeInfo;
}

interface EvaluatedAlarm {
  rule: AlarmRule;
  active: boolean;
  value: number | undefined;
  timestamp: number | undefined;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#FF3D71',
  warning: '#FFAB00',
};

/**
 * Alarm List Widget
 *
 * Monitors multiple register/parameter addresses and displays active alarms
 * when values exceed thresholds or match specific alarm states.
 */
export default function AlarmListWidget({ config, isEditMode, widgetSize }: AlarmListWidgetProps): React.ReactElement {
  const { state } = useDSHub();
  const scale = widgetSize?.scale ?? 1;

  // Build items array for useAutoRefreshMulti from alarm rules
  const refreshItems = useMemo(() =>
    config.alarms.map(a => ({
      label: a.label,
      source: a.source,
      address: a.address,
    })),
    [config.alarms]
  );

  useAutoRefreshMulti({
    items: refreshItems,
    refreshInterval: config.refreshInterval,
    isEditMode,
  });

  // Check first alarm for map availability
  if (config.alarms.length > 0) {
    const first = config.alarms[0];
    const errorState = getWidgetError(first.source, first.address);
    if (errorState) return errorState;
  }

  // Evaluate all alarm rules
  const evaluatedAlarms: EvaluatedAlarm[] = config.alarms.map(rule => {
    const data = rule.source === 'register'
      ? state.registers.get(rule.address)
      : rule.source === 'sysRegister'
      ? state.systemRegisters.get(rule.address)
      : state.parameters.get(rule.address);
    const value = data?.value !== undefined ? (data.value as number) : undefined;

    let active = false;
    if (value !== undefined) {
      if (rule.type === 'threshold') {
        if (rule.min !== undefined && value < rule.min) active = true;
        if (rule.max !== undefined && value > rule.max) active = true;
      } else {
        // state mode
        active = rule.triggerValues?.includes(value) ?? false;
      }
    }

    return { rule, active, value, timestamp: data?.timestamp };
  });

  // Sort: active first (critical → warning), then inactive
  const sortedAlarms = [...evaluatedAlarms].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const severityOrder = { critical: 0, warning: 1 };
    return (severityOrder[a.rule.severity] ?? 2) - (severityOrder[b.rule.severity] ?? 2);
  });

  const visibleAlarms = config.showInactive
    ? sortedAlarms
    : sortedAlarms.filter(a => a.active);

  const activeCount = evaluatedAlarms.filter(a => a.active).length;
  const autoCompact = widgetSize ? isCompactSize(widgetSize, 120) : false;
  const compact = config.compact || autoCompact;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <Typography
          variant="overline"
          sx={{ color: 'text.secondary', fontSize: scaledRem(0.6, scale), letterSpacing: '0.1em' }}
        >
          {config.label}
        </Typography>
        <Typography
          sx={{
            fontFamily: FONT_HEADLINE,
            fontSize: scaledRem(0.7, scale),
            color: activeCount > 0 ? '#FF3D71' : '#00E676',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          {activeCount > 0 ? `${activeCount} ACTIVE` : 'OK'}
        </Typography>
      </Box>

      {/* Alarm List */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: compact ? 0.25 : 0.5 }}>
        {visibleAlarms.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 1 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#00E676', boxShadow: '0 0 6px #00E67680' }} />
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.75rem', color: '#00E676' }}>
              No active alarms
            </Typography>
          </Box>
        )}

        {visibleAlarms.map((alarm, index) => {
          const color = alarm.active ? SEVERITY_COLORS[alarm.rule.severity] : '#6B7280';
          return (
            <Box
              key={`${alarm.rule.source}-${alarm.rule.address}-${index}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: compact ? 0.5 : 1,
                py: compact ? 0.25 : 0.5,
                borderRadius: 0.5,
                backgroundColor: alarm.active ? `${color}12` : 'transparent',
                borderLeft: `2px solid ${color}`,
                opacity: alarm.active ? 1 : 0.5,
                flexShrink: 0,
              }}
            >
              {/* Severity LED */}
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: color,
                  boxShadow: alarm.active ? `0 0 6px ${color}80` : 'none',
                  flexShrink: 0,
                  animation: alarm.active && alarm.rule.severity === 'critical' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.4 },
                  },
                }}
              />

              {/* Alarm Info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: compact ? '0.65rem' : '0.75rem',
                    fontWeight: 600,
                    color: alarm.active ? color : 'text.secondary',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {alarm.rule.label}
                </Typography>
              </Box>

              {/* Current Value */}
              <Typography
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: compact ? '0.6rem' : '0.7rem',
                  color: alarm.active ? 'text.primary' : 'text.secondary',
                  flexShrink: 0,
                }}
              >
                {alarm.value !== undefined ? alarm.value : '---'}
              </Typography>
            </Box>
          );
        })}
      </Box>

    </Box>
  );
}
