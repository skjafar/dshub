/**
 * The primitive layer.
 *
 * Behaviour that is genuinely hard to get right — focus trapping, roving focus,
 * type-ahead, collision-aware positioning — comes from Radix. Everything else is
 * ours, styled with component-scoped CSS reading the design tokens published as
 * custom properties. No component in here holds a colour value; see
 * `design/themeVariables.ts` for where colour actually lives.
 */

export { cx } from './cx';

export { Button } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';

export { Dialog } from './Dialog';
export type { DialogProps } from './Dialog';

export { Menu, MenuCheckboxItem, MenuItem, MenuLabel, MenuSeparator } from './Menu';
export type { MenuCheckboxItemProps, MenuItemProps, MenuLabelProps, MenuProps } from './Menu';

export { NumericInput } from './NumericInput';
export type { NumericInputProps } from './NumericInput';

export { Popover } from './Popover';
export type { PopoverProps } from './Popover';

export { Select } from './Select';
export type { SelectOption, SelectProps } from './Select';

export { Slider } from './Slider';
export type { SliderProps } from './Slider';

export { Switch } from './Switch';
export type { SwitchProps } from './Switch';

export { TabPanel, Tabs } from './Tabs';
export type { TabDefinition, TabPanelProps, TabsProps } from './Tabs';

export { Table } from './Table';
export type { Column, TableProps } from './Table';

export { ThemeScope, usePortalContainer } from './ThemeScope';
export type { ThemeScopeProps } from './ThemeScope';

export { TextField } from './TextField';
export type { TextFieldProps } from './TextField';

export { Tooltip, TooltipProvider } from './Tooltip';
export type { TooltipProps, TooltipProviderProps } from './Tooltip';
