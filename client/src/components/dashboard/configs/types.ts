import type { DataSource } from '../../../types/dashboard';

export interface AddressItem {
  address: number;
  name: string;
  type?: string;
  isReadOnly?: boolean;
}

export interface WidgetConfigComponentProps<T> {
  config: Partial<T>;
  onConfigChange: (updates: Partial<T>) => void;
  registers: AddressItem[];
  parameters: AddressItem[];
}
