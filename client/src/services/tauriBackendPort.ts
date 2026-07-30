/**
 * The real {@link BackendPort} — the only module in the frontend permitted to
 * import the Tauri transport. Everything else receives the port by injection.
 *
 * This is a translation layer and nothing more: each method forwards one call
 * with the argument names the Rust side expects. No sequencing, retrying,
 * error handling or state lives here, because moving any of that across the
 * boundary would change behaviour the frozen data path depends on.
 */

import { invoke } from '@tauri-apps/api/core';
import type { InterfaceType } from '../types/shared';
import type { LogSettings } from '../types/settings';
import type { BackendPort, SaveTextRequest } from './backendPort';

export function createTauriBackendPort(): BackendPort {
  return {
    device: {
      startScan: () => invoke('start_scan'),
      connect: (ip: string, interfaceType: InterfaceType, deviceName?: string) =>
        invoke('connect_device', { ip, interfaceType, deviceName }),
      disconnect: () => invoke('disconnect_device'),
      takeControl: () => invoke('take_control'),

      readRegister: (address: number, name: string) =>
        invoke('read_register', { address, name }),
      writeRegister: (address: number, value: number) =>
        invoke('write_register', { address, value }),
      readParameter: (address: number, name: string) =>
        invoke('read_parameter', { address, name }),
      writeParameter: (address: number, value: number) =>
        invoke('write_parameter', { address, value }),
      readSystemRegister: (address: number, name: string) =>
        invoke('read_system_register', { address, name }),
      writeSystemRegister: (address: number, value: number) =>
        invoke('write_system_register', { address, value }),

      sendCommand: (command: number, address: number, value: number) =>
        invoke('send_command', { command, address, value }),

      startPlotting: (registerName: string, pollInterval: number, address: number) =>
        invoke('start_plotting', { registerName, pollInterval, address }),
      startPlottingSysRegister: (registerName: string, pollInterval: number, address: number) =>
        invoke('start_plotting_sys_register', { registerName, pollInterval, address }),
      stopPlotting: (registerName: string) =>
        invoke('stop_plotting', { registerName }),

      updateLogSettings: (settings: LogSettings) =>
        invoke('update_log_settings', { settings }),
    },

    files: {
      saveText: (request: SaveTextRequest) => invoke<boolean>('save_text_file', { ...request }),
      saveCsv: (content: string, suggestedName: string) =>
        invoke<boolean>('save_csv', { content, suggestedName }),
      savePdf: (dataBase64: string, suggestedName: string) =>
        invoke<boolean>('save_pdf_file', { dataBase64, suggestedName }),
    },
  };
}
