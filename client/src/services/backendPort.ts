/**
 * The single boundary between the interface and the Rust backend.
 *
 * Every call that leaves the frontend passes through here, which makes this the
 * one seam the rebuild tests against: the real implementation talks to Tauri,
 * and a fake implementation serves both the test suites and browser development
 * so the two cannot drift apart.
 *
 * Two concerns cross this boundary and they are kept visibly separate, because
 * they change for different reasons. `device` speaks the board protocol;
 * `files` writes to the host filesystem through native save dialogs. A single
 * flat interface would have hidden the second behind a name describing only the
 * first.
 */

import type { InterfaceType } from '../types/shared';
import type { LogSettings } from '../types/settings';

/** A host save dialog request. These four always travel together. */
export interface SaveTextRequest {
  readonly content: string;
  readonly suggestedName: string;
  readonly filterName: string;
  readonly filterExt: string;
}

/**
 * Commands addressed to the Device.
 *
 * Reads resolve as soon as the request is *sent*, not when the value arrives —
 * responses are delivered as events, and the backend correlates each one to its
 * request by address. Callers must not treat a resolved read as a value.
 */
export interface DevicePort {
  startScan(): Promise<void>;
  connect(ip: string, interfaceType: InterfaceType, deviceName?: string): Promise<void>;
  disconnect(): Promise<void>;
  takeControl(): Promise<void>;

  readRegister(address: number, name: string): Promise<void>;
  writeRegister(address: number, value: number): Promise<void>;
  readParameter(address: number, name: string): Promise<void>;
  writeParameter(address: number, value: number): Promise<void>;
  readSystemRegister(address: number, name: string): Promise<void>;
  writeSystemRegister(address: number, value: number): Promise<void>;

  sendCommand(command: number, address: number, value: number): Promise<void>;

  startPlotting(registerName: string, pollInterval: number, address: number): Promise<void>;
  startPlottingSysRegister(registerName: string, pollInterval: number, address: number): Promise<void>;
  stopPlotting(registerName: string): Promise<void>;

  updateLogSettings(settings: LogSettings): Promise<void>;
}

/**
 * Writes to the host filesystem. Each resolves `true` when a file was written
 * and `false` when the user dismissed the save dialog — a dismissal is not an
 * error and must not be reported as one.
 */
export interface FilePort {
  saveText(request: SaveTextRequest): Promise<boolean>;
  saveCsv(content: string, suggestedName: string): Promise<boolean>;
  savePdf(dataBase64: string, suggestedName: string): Promise<boolean>;
}

export interface BackendPort {
  readonly device: DevicePort;
  readonly files: FilePort;
}
