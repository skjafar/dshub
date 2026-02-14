import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert
} from '@mui/material';
import {
  WidgetType,
  WidgetConfig,
  ButtonWidgetConfig,
  ValueReadWidgetConfig,
  ValueWriteWidgetConfig,
  MiniPlotWidgetConfig,
  DropdownWidgetConfig
} from '../../types/dashboard';
import { useSettings } from '../../contexts/SettingsContext';
import { parseMapFile } from '../../maps/mapParser';
import type { AddressItem } from './configs/types';

// Config sub-components
import ButtonConfig from './configs/ButtonConfig';
import ValueReadConfig from './configs/ValueReadConfig';
import ValueWriteConfig from './configs/ValueWriteConfig';
import MiniPlotConfig from './configs/MiniPlotConfig';
import DropdownConfig from './configs/DropdownConfig';
import StateLEDConfig from './configs/StateLEDConfig';
import GaugeConfig from './configs/GaugeConfig';
import ProgressBarConfig from './configs/ProgressBarConfig';
import EncoderDisplayConfig from './configs/EncoderDisplayConfig';
import LEDIndicatorConfig from './configs/LEDIndicatorConfig';
import DirectionalControlConfig from './configs/DirectionalControlConfig';
import SystemInfoConfig from './configs/SystemInfoConfig';

interface WidgetConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (type: WidgetType, config: WidgetConfig) => void;
  initialType?: WidgetType;
  initialConfig?: WidgetConfig;
  mode: 'add' | 'edit';
}

const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  button: 'Button',
  valueRead: 'Value Read',
  valueWrite: 'Value Write',
  miniPlot: 'Mini Plot',
  dropdown: 'Dropdown',
  stateLED: 'State LED',
  gauge: 'Gauge',
  progressBar: 'Progress Bar',
  encoderDisplay: 'Encoder Display',
  ledIndicator: 'LED Indicator',
  directionalControl: 'Directional Control',
  systemInfo: 'System Info',
};

export default function WidgetConfigDialog({
  open,
  onClose,
  onSave,
  initialType,
  initialConfig,
  mode
}: WidgetConfigDialogProps) {
  const { getActiveProfile } = useSettings();
  const [widgetType, setWidgetType] = useState<WidgetType>(initialType || 'button');
  const [config, setConfig] = useState<Partial<WidgetConfig>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Get available registers and parameters from the map
  const activeProfile = getActiveProfile();
  const registerMapEntries = activeProfile ? parseMapFile(activeProfile.registersMap, true).entries : [];
  const parameterMapEntries = activeProfile ? parseMapFile(activeProfile.parametersMap, false).entries : [];

  const registers: AddressItem[] = registerMapEntries.map(entry => ({
    address: entry.address,
    name: entry.name,
    type: entry.type,
    isReadOnly: entry.accessPermit === 'READ_ONLY'
  }));

  const parameters: AddressItem[] = parameterMapEntries.map(entry => ({
    address: entry.address,
    name: entry.name,
    type: entry.type
  }));

  // Update widget type and config when dialog opens or props change
  useEffect(() => {
    if (!open) return;

    setValidationErrors([]);
    const typeToUse = initialType || 'button';
    setWidgetType(typeToUse);

    if (initialConfig) {
      setConfig(initialConfig);
    } else {
      resetConfig(typeToUse);
    }
  }, [initialConfig, initialType, open]);

  const resetConfig = (type: WidgetType) => {
    switch (type) {
      case 'button':
        setConfig({
          label: 'Button',
          target: 'register',
          address: 0,
          valueToWrite: 0,
          confirmationRequired: false
        } as ButtonWidgetConfig);
        break;
      case 'valueRead':
        setConfig({
          label: 'Value',
          source: 'register',
          address: 0,
          displayFormat: 'decimal',
          refreshInterval: 1000,
          showTimestamp: false
        } as ValueReadWidgetConfig);
        break;
      case 'valueWrite':
        setConfig({
          label: 'Write Value',
          target: 'register',
          address: 0,
          inputType: 'number',
          confirmationRequired: false
        } as ValueWriteWidgetConfig);
        break;
      case 'miniPlot':
        setConfig({
          label: 'Mini Plot',
          source: 'register',
          address: 0,
          timeWindow: 60,
          pollInterval: 50,
          showLegend: false
        } as MiniPlotWidgetConfig);
        break;
      case 'dropdown':
        setConfig({
          label: 'Dropdown',
          target: 'register',
          address: 0,
          options: [{ label: 'Option 1', value: 0 }],
          confirmationRequired: false
        } as DropdownWidgetConfig);
        break;
      case 'stateLED':
        setConfig({
          label: 'State LED',
          source: 'register',
          address: 0,
          refreshInterval: 100,
          states: [
            { value: 0, label: 'State 0', color: '#6B7280' },
            { value: 1, label: 'State 1', color: '#4ADE80' }
          ],
          showLabel: true,
          pulseAnimation: false
        });
        break;
      case 'gauge':
        setConfig({
          label: 'Gauge',
          source: 'register',
          address: 0,
          refreshInterval: 100,
          min: 0,
          max: 100,
          showValue: true
        });
        break;
      case 'progressBar':
        setConfig({
          label: 'Progress Bar',
          source: 'register',
          address: 0,
          refreshInterval: 100,
          min: 0,
          max: 100,
          orientation: 'horizontal',
          showPercentage: true,
          showValue: true
        });
        break;
      case 'encoderDisplay':
        setConfig({
          label: 'Encoder Display',
          source: 'register',
          address: 0,
          refreshInterval: 50,
          conversionSource: 'constant',
          conversionFactor: 1,
          showRawValue: true,
          decimals: 3
        });
        break;
      case 'ledIndicator':
        setConfig({
          label: 'LED Indicator',
          source: 'register',
          address: 0,
          refreshInterval: 100,
          onValue: 1,
          offValue: 0,
          onColor: '#4ADE80',
          offColor: '#6B7280',
          onLabel: 'ON',
          offLabel: 'OFF',
          pulseWhenOn: false
        });
        break;
      case 'directionalControl':
        setConfig({
          label: 'Directional Control',
          layout: '4way',
          directions: [
            { direction: 'up', command: 0 },
            { direction: 'down', command: 1 },
            { direction: 'left', command: 2 },
            { direction: 'right', command: 3 }
          ],
          buttonSize: 48
        });
        break;
      case 'systemInfo':
        setConfig({
          label: 'System Info',
          items: [
            { label: 'Item 1', source: 'register', address: 0, format: 'decimal' }
          ],
          refreshInterval: 1000,
          layout: 'vertical'
        });
        break;
    }
  };

  const validateConfig = (): string[] => {
    const errors: string[] = [];
    const c = config as any;

    // Label required for all types
    if (!c.label?.trim()) {
      errors.push('Label is required');
    }

    // Address required for address-based widgets
    const addressTypes: WidgetType[] = ['button', 'valueRead', 'valueWrite', 'miniPlot', 'dropdown', 'stateLED', 'gauge', 'progressBar', 'encoderDisplay', 'ledIndicator'];
    if (addressTypes.includes(widgetType) && (c.address === undefined || c.address < 0)) {
      errors.push('A valid address must be selected');
    }

    // Refresh interval for polling widgets
    const pollingTypes: WidgetType[] = ['valueRead', 'stateLED', 'gauge', 'progressBar', 'encoderDisplay', 'ledIndicator', 'systemInfo'];
    if (pollingTypes.includes(widgetType) && (c.refreshInterval === undefined || c.refreshInterval <= 0)) {
      errors.push('Refresh interval must be greater than 0');
    }

    // Min < max for gauge and progress bar
    if ((widgetType === 'gauge' || widgetType === 'progressBar') && c.min !== undefined && c.max !== undefined && c.min >= c.max) {
      errors.push('Min must be less than Max');
    }

    // At least 1 state for StateLED
    if (widgetType === 'stateLED' && (!c.states || c.states.length === 0)) {
      errors.push('At least one state is required');
    }

    // At least 1 item for SystemInfo
    if (widgetType === 'systemInfo' && (!c.items || c.items.length === 0)) {
      errors.push('At least one info item is required');
    }

    // At least 1 direction for DirectionalControl
    if (widgetType === 'directionalControl' && (!c.directions || c.directions.length === 0)) {
      errors.push('At least one direction must be configured');
    }

    // Poll interval for mini plot
    if (widgetType === 'miniPlot' && (c.pollInterval === undefined || c.pollInterval <= 0)) {
      errors.push('Poll interval must be greater than 0');
    }

    return errors;
  };

  const handleSave = () => {
    const errors = validateConfig();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    onSave(widgetType, config as WidgetConfig);
    onClose();
  };

  const handleConfigChange = (updates: Partial<WidgetConfig>) => {
    setConfig(updates);
  };

  const renderConfigFields = () => {
    const commonProps = { registers, parameters };

    switch (widgetType) {
      case 'button':
        return <ButtonConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
      case 'valueRead':
        return <ValueReadConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
      case 'valueWrite':
        return <ValueWriteConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
      case 'miniPlot':
        return <MiniPlotConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
      case 'dropdown':
        return <DropdownConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
      case 'stateLED':
        return <StateLEDConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
      case 'gauge':
        return <GaugeConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
      case 'progressBar':
        return <ProgressBarConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
      case 'encoderDisplay':
        return <EncoderDisplayConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
      case 'ledIndicator':
        return <LEDIndicatorConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
      case 'directionalControl':
        return <DirectionalControlConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
      case 'systemInfo':
        return <SystemInfoConfig config={config as any} onConfigChange={handleConfigChange as any} {...commonProps} />;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{mode === 'add' ? 'Add Widget' : `Edit ${WIDGET_TYPE_LABELS[widgetType]}`}</DialogTitle>
      <DialogContent>
        {mode === 'add' && (
          <FormControl fullWidth margin="normal">
            <InputLabel>Widget Type</InputLabel>
            <Select
              value={widgetType}
              onChange={(e) => {
                const newType = e.target.value as WidgetType;
                setWidgetType(newType);
                resetConfig(newType);
              }}
              label="Widget Type"
            >
              <MenuItem value="button">Button</MenuItem>
              <MenuItem value="valueRead">Value Read</MenuItem>
              <MenuItem value="valueWrite">Value Write</MenuItem>
              <MenuItem value="miniPlot">Mini Plot</MenuItem>
              <MenuItem value="dropdown">Dropdown</MenuItem>
              <MenuItem value="stateLED">State LED</MenuItem>
              <MenuItem value="gauge">Gauge</MenuItem>
              <MenuItem value="progressBar">Progress Bar</MenuItem>
              <MenuItem value="encoderDisplay">Encoder Display</MenuItem>
              <MenuItem value="ledIndicator">LED Indicator</MenuItem>
              <MenuItem value="directionalControl">Directional Control</MenuItem>
              <MenuItem value="systemInfo">System Info</MenuItem>
            </Select>
          </FormControl>
        )}

        {renderConfigFields()}
      </DialogContent>
      {validationErrors.length > 0 && (
        <Alert severity="error" sx={{ mx: 3, mb: 1 }}>
          {validationErrors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </Alert>
      )}
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {mode === 'add' ? 'Add' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
