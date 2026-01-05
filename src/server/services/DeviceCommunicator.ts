import dgram from 'dgram';
import net from 'net';
import { Logger } from '../utils/Logger';
import {
  InterfaceType,
  DeviceConnection,
  RegisterData,
  ParameterData,
  ControlInterfaceState,
  PlotDataPoint,
  LogEntry,
  LogCategory,
  PacketInfo,
  LogSettings,
  DEFAULT_TCP_PORT,
  DEFAULT_UDP_PORT
} from '../../shared/types';

interface DataRequest {
  id: string;
  address: number;
  value?: number;
  command: number;
  expectedResponseLength: number;
  timestamp: number;
  timeout?: NodeJS.Timeout;
  packet: Buffer;
  name?: string; // Register or parameter name
  callback?: (data?: RegisterData | ParameterData) => void;
}

interface ResponseBuffer {
  data: Buffer;
  expectedLength: number;
  receivedLength: number;
}

export class DeviceCommunicator {
  private logger = Logger.getInstance();
  private connection: DeviceConnection | null = null;
  private tcpSocket: net.Socket | null = null;
  private udpSocket: dgram.Socket | null = null;
  private currentRequest: DataRequest | null = null;
  private requestQueue: DataRequest[] = [];
  private responseBuffer: ResponseBuffer | null = null;
  private plotTimers = new Map<string, NodeJS.Timeout>();
  private plotCallbacks = new Map<string, (seriesName: string, point: PlotDataPoint) => void>();
  private plotStartTimes = new Map<string, number>();
  private registerNameToAddress = new Map<string, number>();
  private latestRegisterValues = new Map<number, number>();
  private packetTimings = new Map<string, number>();
  private totalPacketsSent = 0;
  private totalPacketsReceived = 0;
  private totalBytesSent = 0;
  private totalBytesReceived = 0;
  private readonly REQUEST_TIMEOUT = 5000; // 5 seconds

  // Callback handlers
  private statusCallback?: (status: DeviceConnection) => void;
  private registerCallback?: (register: RegisterData) => void;
  private parameterCallback?: (parameter: ParameterData) => void;
  private logCallback?: (entry: LogEntry) => void;

  // Log settings for filtering
  private logSettings: LogSettings = {
    enableConnectionLogs: true,
    enableRegisterLogs: false,
    enableParameterLogs: false,
    enablePacketLogs: false,
    enableAutoRefreshLogs: false,
    enablePlottingLogs: false,
    maxLogCount: 1000
  };

  public connect(
    ip: string, 
    interfaceType: InterfaceType,
    onStatusChange: (status: DeviceConnection) => void,
    onRegisterUpdate: (register: RegisterData) => void,
    onParameterUpdate: (parameter: ParameterData) => void,
    onLogEntry?: (entry: LogEntry) => void
  ): void {
    this.statusCallback = onStatusChange;
    this.registerCallback = onRegisterUpdate;
    this.parameterCallback = onParameterUpdate;
    this.logCallback = onLogEntry;

    const port = interfaceType === InterfaceType.TCP ? DEFAULT_TCP_PORT : DEFAULT_UDP_PORT;
    
    this.connection = {
      ip,
      port,
      interface: interfaceType,
      connected: false,
      controlState: ControlInterfaceState.UNDECIDED
    };

    this.logger.info(`Connecting to ${ip}:${port} via ${interfaceType}`, 'connection');

    if (interfaceType === InterfaceType.TCP) {
      this.connectTCP(ip, port);
    } else {
      this.connectUDP(ip, port);
    }
  }

  private connectTCP(ip: string, port: number): void {
    this.tcpSocket = new net.Socket();

    this.tcpSocket.connect(port, ip, () => {
      this.logger.success(`TCP connection established to ${ip}:${port}`, 'connection');
      if (this.connection) {
        this.connection.connected = true;
        this.statusCallback?.(this.connection);
      }
    });

    this.tcpSocket.on('data', (data) => {
      this.handleIncomingData(data);
    });

    this.tcpSocket.on('error', (error) => {
      this.logger.error(`TCP connection error: ${error.message}`, 'connection');
      this.handleDisconnection();
    });

    this.tcpSocket.on('close', () => {
      this.logger.info('TCP connection closed', 'connection');
      this.handleDisconnection();
    });
  }

  private connectUDP(ip: string, port: number): void {
    this.udpSocket = dgram.createSocket('udp4');

    this.udpSocket.bind(0, () => {
      this.logger.success(`UDP socket bound for communication with ${ip}:${port}`, 'connection');
      if (this.connection) {
        this.connection.connected = true;
        this.statusCallback?.(this.connection);
      }
    });

    this.udpSocket.on('message', (msg, rinfo) => {
      if (rinfo.address === ip) {
        this.handleIncomingData(msg);
      }
    });

    this.udpSocket.on('error', (error) => {
      this.logger.error(`UDP socket error: ${error.message}`, 'connection');
      this.handleDisconnection();
    });
  }

  private handleIncomingData(data: Buffer): void {
    try {
      // Log received packet with detailed analysis
      this.logPacketDetails('RECEIVED', data);
      
      // Handle buffering of partial responses
      if (this.responseBuffer) {
        // Append to existing buffer
        this.responseBuffer.data = Buffer.concat([this.responseBuffer.data, data]);
        this.responseBuffer.receivedLength = this.responseBuffer.data.length;
        
        const bufferCategory = this.currentRequest?.command === 1 ? 'register' : 'parameter';
        this.logger.info(`Buffered response: ${this.responseBuffer.receivedLength}/${this.responseBuffer.expectedLength} bytes`, bufferCategory);
      } else if (this.currentRequest) {
        // Start new response buffer for current request
        this.responseBuffer = {
          data: Buffer.from(data),
          expectedLength: this.currentRequest.expectedResponseLength,
          receivedLength: data.length
        };
        
        const startBufferCategory = this.currentRequest.command === 1 ? 'register' : 'parameter';
        this.logger.info(`Started response buffer for ${this.currentRequest.id}: ${data.length}/${this.currentRequest.expectedResponseLength} bytes`, startBufferCategory);
      } else {
        // No pending requests - log as unexpected data
        this.logger.warning(`Received unexpected data: ${data.length} bytes`, 'connection');
        return;
      }
      
      // Check if we have a complete response
      if (this.responseBuffer && this.responseBuffer.receivedLength >= this.responseBuffer.expectedLength) {
        this.processCompleteResponse(this.responseBuffer.data);
        this.responseBuffer = null;
      }
      
    } catch (error) {
      this.logger.error('Error parsing incoming data:', 'connection', error as Error);
      this.responseBuffer = null;
    }
  }

  private processCompleteResponse(responseData: Buffer): void {
    // Check if we have a current request
    if (!this.currentRequest) {
      this.logger.warning('Received response but no current request', 'connection');
      return;
    }

    // Determine log category based on command
    const getCategoryForCommand = (cmd: number): LogCategory => {
      if (cmd === 1 || cmd === 2) return 'register';
      if (cmd === 3 || cmd === 4) return 'parameter';
      return 'connection';
    };

    const responseCategory = getCategoryForCommand(this.currentRequest.command);
    this.logger.success(`Processing complete response for ${this.currentRequest.id}`, responseCategory);

    // Clear the timeout
    if (this.currentRequest.timeout) {
      clearTimeout(this.currentRequest.timeout);
    }

    // Calculate response time
    const responseTime = Date.now() - this.currentRequest.timestamp;
    this.packetTimings.set(this.currentRequest.id, responseTime);

    try {
      // Parse response based on expected format (6 bytes: 1 cmd/status + 1 addr + 4 value)
      if (responseData.length >= 6) {
        const status = responseData.readUInt8(0); // Command/status byte
        const address = responseData.readUInt8(1); // Address byte
        const value = responseData.readInt32LE(2); // Value (4 bytes)

        // Verify address matches request (skip for Take Control which uses address 0)
        if (address !== this.currentRequest.address && this.currentRequest.command !== 5) {
          this.logger.warning(`Address mismatch: expected ${this.currentRequest.address}, got ${address}`, responseCategory);
        }

        if (this.currentRequest.command === 1) {
          // Register read response
          const registerData: RegisterData = {
            address,
            name: this.currentRequest.name || `REG_${address}`,
            value,
            valid: true,
            timestamp: Date.now()
          };

          // Store the latest register value for plotting
          this.latestRegisterValues.set(address, value);

          // If this register is being plotted, send the data point
          const plotCallback = this.plotCallbacks.get(registerData.name);
          const startTime = this.plotStartTimes.get(registerData.name);
          if (plotCallback && startTime) {
            // Use absolute timestamp in seconds (Unix epoch)
            const timeSeconds = Date.now() / 1000;
            plotCallback(registerData.name, {
              x: timeSeconds,
              y: value
            });
          }

          this.currentRequest.callback?.(registerData);
          this.logger.success(`Register ${registerData.name} (${address}) = ${value} (${responseTime}ms)`, 'register');
        } else if (this.currentRequest.command === 2) {
          // Register write confirmation
          const registerData: RegisterData = {
            address,
            name: this.currentRequest.name || `REG_${address}`,
            value,
            valid: true,
            timestamp: Date.now()
          };
          this.currentRequest.callback?.(registerData);
          this.logger.success(`Register write confirmed: ${registerData.name} (${address}) = ${value} (${responseTime}ms)`, 'register');
        } else if (this.currentRequest.command === 3) {
          // Parameter read response
          const parameterData: ParameterData = {
            address,
            name: this.currentRequest.name || `PARAM_${address}`,
            value,
            valid: true,
            timestamp: Date.now()
          };
          this.currentRequest.callback?.(parameterData);
          this.logger.success(`Parameter ${parameterData.name} (${address}) = ${value} (${responseTime}ms)`, 'parameter');
        } else if (this.currentRequest.command === 4) {
          // Parameter write confirmation
          const parameterData: ParameterData = {
            address,
            name: this.currentRequest.name || `PARAM_${address}`,
            value,
            valid: true,
            timestamp: Date.now()
          };
          this.currentRequest.callback?.(parameterData);
          this.logger.success(`Parameter write confirmed: ${parameterData.name} (${address}) = ${value} (${responseTime}ms)`, 'parameter');
        } else if (this.currentRequest.command === 5) {
          // Take Control response
          this.currentRequest.callback?.();
          this.logger.success(`Take Control acknowledged (${responseTime}ms)`, 'connection');
        } else {
          // Other commands
          this.currentRequest.callback?.();
          this.logger.success(`Command ${this.currentRequest.command} acknowledged (${responseTime}ms)`, responseCategory);
        }
      } else {
        this.logger.error(`Invalid response length: ${responseData.length} bytes, expected at least 6`, responseCategory);
      }
    } catch (error) {
      this.logger.error(`Error parsing response: ${error}`, responseCategory);
    }

    // Clear current request and process next in queue
    this.currentRequest = null;
    this.processNextRequest();
  }

  private handleRequestTimeout(requestId: string): void {
    if (this.currentRequest && this.currentRequest.id === requestId) {
      const timeoutCategory = this.currentRequest.command === 1 ? 'register' : 'parameter';
      this.logger.error(`Request timeout: ${requestId} (${this.currentRequest.command === 1 ? 'register' : 'parameter'} ${this.currentRequest.address})`, timeoutCategory);
      
      // Log timeout entry
      this.logCallback?.({
        level: 'error',
        category: timeoutCategory,
        message: `Request timeout: ${this.currentRequest.command === 1 ? 'Register' : 'Parameter'} ${this.currentRequest.address} after ${this.REQUEST_TIMEOUT}ms`,
        timestamp: Date.now()
      });

      // Clear current request and process next
      this.currentRequest = null;
      this.responseBuffer = null;
      this.processNextRequest();
    }
  }

  private queueRequest(request: DataRequest): void {
    if (this.currentRequest) {
      // Add to queue if busy
      this.requestQueue.push(request);
      const queueCategory = request.command === 1 ? 'register' : 'parameter';
      this.logger.info(`Queued ${request.command === 1 ? 'register' : 'parameter'} request ${request.address} (queue size: ${this.requestQueue.length})`, queueCategory);
    } else {
      // Send immediately if not busy
      this.sendRequest(request);
    }
  }

  private sendRequest(request: DataRequest): void {
    this.currentRequest = request;
    const sendCategory = request.command === 1 ? 'register' : 'parameter';
    this.logger.info(`Sending ${request.command === 1 ? 'register' : 'parameter'} request ${request.address} (ID: ${request.id})`, sendCategory);
    
    // Update timestamp for accurate response time calculation
    request.timestamp = Date.now();
    
    // Set up timeout
    request.timeout = setTimeout(() => {
      this.handleRequestTimeout(request.id);
    }, this.REQUEST_TIMEOUT);

    // Send the packet
    this.sendData(request.packet);
  }

  private processNextRequest(): void {
    if (this.requestQueue.length > 0 && !this.currentRequest) {
      const nextRequest = this.requestQueue.shift()!;
      this.sendRequest(nextRequest);
    }
  }

  // Debug method to check queue status
  public getQueueStatus(): { current: string | null; queued: number; queueDetails: string[] } {
    return {
      current: this.currentRequest ? `${this.currentRequest.command === 1 ? 'REG' : 'PARAM'}_${this.currentRequest.address}` : null,
      queued: this.requestQueue.length,
      queueDetails: this.requestQueue.map(req => `${req.command === 1 ? 'REG' : 'PARAM'}_${req.address}`)
    };
  }

  private handleDisconnection(): void {
    if (this.connection) {
      this.connection.connected = false;
      this.statusCallback?.(this.connection);
    }
    this.cleanup();
  }

  public disconnect(): void {
    this.logger.info('Disconnecting from device', 'connection');

    // Update connection status before cleanup
    if (this.connection) {
      this.connection.connected = false;
      this.statusCallback?.(this.connection);
    }

    this.cleanup();
  }

  public updateLogSettings(settings: LogSettings): void {
    this.logger.info('Updating log settings', 'connection');
    this.logSettings = settings;
  }

  private shouldEmitLog(logEntry: LogEntry): boolean {
    // Only emit packet logs if enabled
    if (logEntry.level === 'packet') {
      return this.logSettings.enablePacketLogs;
    }
    // For all other logs, always emit (client will handle filtering)
    // This is a simple approach - packet logs are the most verbose
    return true;
  }

  private cleanup(): void {
    if (this.tcpSocket) {
      this.tcpSocket.destroy();
      this.tcpSocket = null;
    }

    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = null;
    }

    // Clear current request and queue
    if (this.currentRequest?.timeout) {
      clearTimeout(this.currentRequest.timeout);
    }
    this.currentRequest = null;
    
    // Clear queued requests and their timeouts
    this.requestQueue.forEach(request => {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
    });
    this.requestQueue.length = 0;
    
    // Clear response buffer
    this.responseBuffer = null;

    // Clear all plot timers
    this.plotTimers.forEach(timer => clearInterval(timer));
    this.plotTimers.clear();

    this.connection = null;
  }

  public takeControl(): void {
    if (!this.connection?.connected) {
      this.logger.error('Cannot take control: not connected to device', 'connection');
      return;
    }

    this.logger.info('Taking device control', 'connection');
    
    // Send control command based on interface type
    const controlValue = this.connection.interface === InterfaceType.TCP 
      ? ControlInterfaceState.TCP_DATASTREAM 
      : ControlInterfaceState.UDP_DATASTREAM;
    
    this.sendControlCommand(controlValue);
  }

  private sendControlCommand(value: number): void {
    // Take Control uses special command type 5 (DataRequestType_Control_Interface)
    // Based on Qt app data_request.h: DataRequestType_Control_Interface = 5
    const TAKE_CONTROL_COMMAND = 5;
    const CONTROL_INTERFACE_ADDRESS = 2;

    this.logger.info(`Sending Take Control command (type ${TAKE_CONTROL_COMMAND}) with value ${value}`, 'connection');

    const requestId = `control_${Date.now()}`;

    // Create Take Control packet: [command(1)] [address(1)] [value(4)]
    // From Qt app takeControl(): DataRequestType_Control_Interface, address=0, data=value
    const packet = Buffer.alloc(6);
    packet.writeUInt8(TAKE_CONTROL_COMMAND, 0);  // Command type 5
    packet.writeUInt8(0, 1);                     // Address (always 0 for control command)
    packet.writeUInt32LE(value, 2);              // Value (the interface type to take control as)

    // Create request with packet data
    const request: DataRequest = {
      id: requestId,
      address: 0,
      command: TAKE_CONTROL_COMMAND,
      expectedResponseLength: 6,
      timestamp: Date.now(),
      packet,
      name: 'TAKE_CONTROL',
      callback: () => {
        // Response received and logged - no additional action needed
        this.logger.success('Take Control command acknowledged by device', 'connection');
      }
    };

    this.queueRequest(request);

    // Read back CONTROL_INTERFACE register to verify and update control state
    // Do this after a short delay to allow the device to process the control change
    setTimeout(() => {
      this.readRegister(CONTROL_INTERFACE_ADDRESS, 'CONTROL_INTERFACE');
    }, 100);
  }

  public readRegister(address: number, name?: string): void {
    if (!this.connection?.connected) {
      this.logger.error('Cannot read register: not connected', 'register');
      return;
    }

    const requestId = `reg_read_${address}_${Date.now()}`;

    // Create read register packet (6 bytes: cmd + addr + 4 reserved/padding)
    const packet = Buffer.alloc(6);
    packet.writeUInt8(1, 0); // Read register command
    packet.writeUInt8(address, 1); // Address (1 byte)
    packet.writeUInt32LE(0, 2); // Reserved/padding (4 bytes)

    // Store the register name to use in the response
    const registerName = name || `REG_${address}`;

    // Store the name-to-address mapping for plotting
    if (name) {
      this.registerNameToAddress.set(name, address);
    }

    // Create request with packet data
    const request: DataRequest = {
      id: requestId,
      address,
      command: 1,
      expectedResponseLength: 6,
      timestamp: Date.now(),
      packet,
      name: registerName, // Add name to request
      callback: (data) => {
        this.registerCallback?.(data as RegisterData);
      }
    };

    this.queueRequest(request);
  }

  public writeRegister(address: number, value: number): void {
    if (!this.connection?.connected) {
      this.logger.error('Cannot write register: not connected', 'register');
      return;
    }

    this.logger.info(`Writing register at address ${address} with value ${value}`, 'register');

    // Create write register packet (6 bytes: cmd + addr + value)
    const packet = Buffer.alloc(6);
    packet.writeUInt8(2, 0); // Write register command
    packet.writeUInt8(address, 1); // Address (1 byte)
    packet.writeInt32LE(value, 2); // Value (4 bytes)

    this.sendData(packet);
  }

  public readParameter(address: number, name?: string): void {
    if (!this.connection?.connected) {
      this.logger.error('Cannot read parameter: not connected', 'parameter');
      return;
    }

    const requestId = `param_read_${address}_${Date.now()}`;

    // Create read parameter packet (6 bytes: cmd + addr + 4 reserved/padding)
    const packet = Buffer.alloc(6);
    packet.writeUInt8(3, 0); // Read parameter command
    packet.writeUInt8(address, 1); // Address (1 byte)
    packet.writeUInt32LE(0, 2); // Reserved/padding (4 bytes)

    // Create request with packet data
    const request: DataRequest = {
      id: requestId,
      address,
      name, // Include the parameter name if provided
      command: 3,
      expectedResponseLength: 6,
      timestamp: Date.now(),
      packet,
      callback: (data) => {
        this.parameterCallback?.(data as ParameterData);
      }
    };

    this.queueRequest(request);
  }

  public writeParameter(address: number, value: number): void {
    if (!this.connection?.connected) {
      this.logger.error('Cannot write parameter: not connected', 'parameter');
      return;
    }

    this.logger.info(`Writing parameter at address ${address} with value ${value}`, 'parameter');

    // Create write parameter packet (6 bytes: cmd + addr + value)
    const packet = Buffer.alloc(6);
    packet.writeUInt8(4, 0); // Write parameter command
    packet.writeUInt8(address, 1); // Address (1 byte)
    packet.writeInt32LE(value, 2); // Value (4 bytes)

    this.sendData(packet);
  }

  public startPlotting(
    registerName: string,
    pollInterval: number,
    address: number,
    onDataPoint: (seriesName: string, point: PlotDataPoint) => void
  ): void {
    if (!this.connection?.connected) {
      this.logger.error('Cannot start plotting: not connected', 'register');
      return;
    }

    // Stop existing plotting for this register
    this.stopPlotting(registerName);

    this.logger.info(`Starting plotting for ${registerName} (address: ${address}) with ${pollInterval}ms interval`, 'register');

    // Store the callback and start time for this plot
    this.plotCallbacks.set(registerName, onDataPoint);
    this.plotStartTimes.set(registerName, Date.now());

    // Store the name-to-address mapping
    this.registerNameToAddress.set(registerName, address);

    // Start polling the register at the specified interval
    const timer = setInterval(() => {
      this.readRegister(address, registerName);
    }, pollInterval);

    this.plotTimers.set(registerName, timer);
  }

  public stopPlotting(registerName: string): void {
    const timer = this.plotTimers.get(registerName);
    if (timer) {
      clearInterval(timer);
      this.plotTimers.delete(registerName);
      this.plotCallbacks.delete(registerName);
      this.plotStartTimes.delete(registerName);
      this.logger.info(`Stopped plotting for ${registerName}`, 'register');
    }
  }

  public sendCommand(command: number, value: number): void {
    if (!this.connection?.connected) {
      this.logger.error('Cannot send command: not connected', 'connection');
      return;
    }

    this.logger.info(`Sending command ${command} with value ${value}`, 'connection');
    
    // Create command packet
    const packet = Buffer.alloc(10);
    packet.writeUInt8(0, 0); // System command
    packet.writeUInt8(command, 1);
    packet.writeInt32LE(value, 2);
    packet.writeUInt32LE(0, 6); // Reserved/checksum
    
    this.sendData(packet);
  }

  private sendData(packet: Buffer): void {
    if (!this.connection) return;

    // Log packet being sent with detailed analysis
    this.logPacketDetails('SENT', packet);

    try {
      if (this.connection.interface === InterfaceType.TCP && this.tcpSocket) {
        this.tcpSocket.write(packet);
      } else if (this.connection.interface === InterfaceType.UDP && this.udpSocket) {
        this.udpSocket.send(packet, this.connection.port, this.connection.ip);
      }
    } catch (error) {
      this.logger.error('Error sending data:', 'connection', error as Error);
    }
  }

  private logPacketDetails(direction: 'SENT' | 'RECEIVED', packet: Buffer): void {
    const currentTime = Date.now();
    const timestamp = new Date(currentTime).toISOString();
    const hexDump = this.formatHexDump(packet);
    // Pass the name from current request if available
    const name = this.currentRequest?.name;
    const analysis = this.analyzePacket(packet, direction, name);
    
    // Update statistics
    if (direction === 'SENT') {
      this.totalPacketsSent++;
      this.totalBytesSent += packet.length;
      // Store timing for response measurement
      const packetId = this.generatePacketId(packet);
      this.packetTimings.set(packetId, currentTime);
    } else {
      this.totalPacketsReceived++;
      this.totalBytesReceived += packet.length;
    }
    
    // Calculate response time if this is a received packet
    let responseTime = '';
    if (direction === 'RECEIVED') {
      const packetId = this.generatePacketId(packet);
      const sentTime = this.packetTimings.get(packetId);
      if (sentTime) {
        const timeDiff = currentTime - sentTime;
        responseTime = ` | Response Time: ${timeDiff}ms`;
        this.packetTimings.delete(packetId);
      }
    }
    
    const stats = `Sent: ${this.totalPacketsSent} pkts (${this.formatBytes(this.totalBytesSent)}) | Received: ${this.totalPacketsReceived} pkts (${this.formatBytes(this.totalBytesReceived)})`;
    
    // Send packet info to clients
    const responseTimeMs = direction === 'RECEIVED' && responseTime ? parseInt(responseTime.match(/\d+/)?.[0] || '0') : undefined;
    
    const packetInfo: PacketInfo = {
      direction,
      size: packet.length,
      hexData: hexDump,
      analysis,
      responseTime: responseTimeMs,
      interface: this.connection?.interface || 'Unknown',
      destination: `${this.connection?.ip}:${this.connection?.port}`
    };
    
    const logEntry: LogEntry = {
      level: 'packet',
      category: 'packet',
      message: `${direction} packet (${packet.length} bytes)${responseTime}`,
      timestamp: currentTime,
      packetData: packetInfo
    };

    // Only emit packet logs to client if enabled in settings
    // Packet logs are displayed in the client browser UI, not server console
    if (this.shouldEmitLog(logEntry)) {
      this.logCallback?.(logEntry);
    }
  }

  private generatePacketId(packet: Buffer): string {
    // Generate a simple ID based on packet content for timing correlation
    if (packet.length >= 3) {
      const command = packet.readUInt8(0);
      const address = packet.readUInt16LE(1);
      return `${command}-${address}`;
    }
    return `unknown-${packet.length}`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private formatHexDump(buffer: Buffer): string {
    if (buffer.length === 0) return '';

    const command = buffer.readUInt8(0);
    let hexLine = '';
    let labelLine = '';

    // Format based on command type
    if (buffer.length >= 6 && (command >= 1 && command <= 4)) {
      // Commands 1-4: [Command][Address][Value/Data]
      const commandHex = buffer[0].toString(16).padStart(2, '0').toUpperCase();
      const addressHex = buffer[1].toString(16).padStart(2, '0').toUpperCase();
      const valueBytes = [
        buffer[5].toString(16).padStart(2, '0').toUpperCase(),
        buffer[4].toString(16).padStart(2, '0').toUpperCase(),
        buffer[3].toString(16).padStart(2, '0').toUpperCase(),
        buffer[2].toString(16).padStart(2, '0').toUpperCase()
      ];

      hexLine = `   ${commandHex}       ${addressHex}    ${valueBytes.join(' ')}`;
      labelLine = '┌Command┐┌Address┐┌──Value──┐';

      return `${labelLine}\n${hexLine}`;
    } else {
      // Default format for other packets
      return Array.from(buffer)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
    }
  }

  // Helper method: Format address with optional name
  private formatAddress(address: number, name: string | undefined, type: 'Register' | 'Parameter'): string {
    const label = `${type} Address:`;
    const paddedLabel = label.padEnd(18);
    const nameStr = name ? ` - ${name}` : '';
    return `${paddedLabel} ${address.toString().padEnd(3)} (0x${address.toString(16).padStart(2, '0').toUpperCase()})${nameStr}`;
  }

  // Helper method: Format value box for responses
  private formatValueBox(value: number, unsignedValue: number): string {
    let box = '';
    box += `┌─ ACTUAL VALUE ─────────────────────────────────────────┐\n`;
    box += `│ Decimal (Signed):   ${value.toString().padEnd(34)} │\n`;
    if (value !== unsignedValue) {
      box += `│ Decimal (Unsigned): ${unsignedValue.toString().padEnd(34)} │\n`;
    }
    box += `│ Hexadecimal:        0x${value.toString(16).padStart(8, '0').toUpperCase().padEnd(32)} │\n`;
    box += `│ Binary:             0b${value.toString(2).padStart(32, '0')} │\n`;
    box += `└────────────────────────────────────────────────────────┘`;
    return box;
  }

  // Helper method: Format "Value to Write" section
  private formatWriteValue(value: number, unsignedValue: number): string {
    let result = 'Value to Write:\n';
    result += `  Decimal (Signed): ${value}\n`;
    if (value !== unsignedValue) {
      result += `  Decimal (Unsigned): ${unsignedValue}\n`;
    }
    result += `  Hexadecimal: 0x${value.toString(16).padStart(8, '0').toUpperCase()}`;
    return result;
  }

  // Helper method: Parse packet value (int32 LE)
  private parsePacketValue(packet: Buffer): { value: number; unsignedValue: number } {
    return {
      value: packet.readInt32LE(2),
      unsignedValue: packet.readUInt32LE(2)
    };
  }

  private analyzePacket(packet: Buffer, direction: 'SENT' | 'RECEIVED', name?: string): string {
    // All device packets are exactly 6 bytes: [command(1)] [address(1)] [value(4)]
    if (packet.length === 0) {
      return 'Empty packet';
    }

    if (packet.length !== 6) {
      return `Malformed packet: Expected exactly 6 bytes, got ${packet.length} bytes`;
    }

    const command = packet.readUInt8(0);
    let analysis = '';

    // Command metadata for data-driven approach
    const commandInfo: { [key: number]: { name: string; type: 'Register' | 'Parameter' | 'Control' | null } } = {
      0: { name: 'System Command', type: null },
      1: { name: 'Read Register', type: 'Register' },
      2: { name: 'Write Register', type: 'Register' },
      3: { name: 'Read Parameter', type: 'Parameter' },
      4: { name: 'Write Parameter', type: 'Parameter' },
      5: { name: 'Take Control', type: 'Control' }
    };

    const info = commandInfo[command];

    // Handle unknown commands
    if (!info) {
      analysis += `Unknown Command\n`;
      analysis += `Command Byte:      ${command.toString().padEnd(3)} (0x${command.toString(16).padStart(2, '0').toUpperCase()})\n`;
      analysis += `Direction:         ${direction}\n\n`;
      analysis += `Known Commands:\n`;
      analysis += `  0 (0x00) - System Command\n`;
      analysis += `  1 (0x01) - Read Register\n`;
      analysis += `  2 (0x02) - Write Register\n`;
      analysis += `  3 (0x03) - Read Parameter\n`;
      analysis += `  4 (0x04) - Write Parameter\n`;
      analysis += `  5 (0x05) - Take Control`;
      return analysis;
    }

    // Handle system command (special case)
    if (command === 0) {
      analysis += `Command Byte:      0   (0x00) - System Command\n`;
      const subCommand = packet.readUInt8(1);
      const value = packet.readInt32LE(2);
      analysis += `Sub-Command:       ${subCommand.toString().padEnd(3)} (0x${subCommand.toString(16).padStart(2, '0').toUpperCase()})\n`;
      analysis += `Value:             ${value} (0x${value.toString(16).padStart(8, '0').toUpperCase()})`;
      return analysis;
    }

    // Handle Take Control command (command 5)
    if (command === 5) {
      const operation = direction === 'SENT' ? 'Request' : 'Response';
      analysis += `Command Byte:      5   (0x05) - Take Control ${operation}\n`;

      const address = packet.readUInt8(1);
      const { value } = this.parsePacketValue(packet);

      analysis += `Address:           ${address.toString().padEnd(3)} (always 0 for Take Control)\n`;

      // Decode the control interface value
      const controlInterfaceNames: { [key: number]: string } = {
        0: 'UNDECIDED',
        1: 'TCP_DATASTREAM',
        2: 'UDP_DATASTREAM',
        101: 'TCP_CLI',
        102: 'USB'
      };

      const interfaceName = controlInterfaceNames[value] || 'UNKNOWN';
      analysis += `Control Interface: ${value.toString().padEnd(3)} (${interfaceName})\n\n`;

      if (direction === 'SENT') {
        analysis += `Requesting control as: ${interfaceName}`;
      } else {
        analysis += `Control acknowledged as: ${interfaceName}`;
      }

      return analysis;
    }

    // Handle register/parameter commands (1-4)
    // All packets are 6 bytes: read requests have padding in bytes [2-5]
    const isRead = (command === 1 || command === 3);
    const isWrite = (command === 2 || command === 4);
    const isSent = (direction === 'SENT');
    const addressType = info.type! as 'Register' | 'Parameter';

    // Build command description
    let operation = '';
    if (isRead && isSent) operation = 'Request';
    else if (isRead && !isSent) operation = 'Response';
    else if (isWrite && isSent) operation = 'Command';
    else if (isWrite && !isSent) operation = 'Confirmation';

    analysis += `Command Byte:      ${command.toString().padEnd(3)} (0x${command.toString(16).padStart(2, '0').toUpperCase()}) - ${info.name} ${operation}\n`;

    // Parse address
    const address = packet.readUInt8(1);
    analysis += this.formatAddress(address, name, addressType);

    // Handle read requests (bytes [2-5] are padding, not used)
    if (isRead && isSent) {
      return analysis;
    }

    // For write commands and all responses, parse the value
    const { value, unsignedValue } = this.parsePacketValue(packet);
    analysis += '\n\n';

    // Write command shows "Value to Write"
    if (isWrite && isSent) {
      analysis += this.formatWriteValue(value, unsignedValue);
      return analysis;
    }

    // Read response and write confirmation show the value box
    analysis += this.formatValueBox(value, unsignedValue);

    return analysis;
  }

}