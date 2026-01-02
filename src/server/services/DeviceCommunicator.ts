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
  PacketInfo,
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
  callback?: (data: RegisterData | ParameterData) => void;
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

    this.logger.info(`Connecting to ${ip}:${port} via ${interfaceType}`);

    if (interfaceType === InterfaceType.TCP) {
      this.connectTCP(ip, port);
    } else {
      this.connectUDP(ip, port);
    }
  }

  private connectTCP(ip: string, port: number): void {
    this.tcpSocket = new net.Socket();

    this.tcpSocket.connect(port, ip, () => {
      this.logger.success(`TCP connection established to ${ip}:${port}`);
      if (this.connection) {
        this.connection.connected = true;
        this.statusCallback?.(this.connection);
      }
    });

    this.tcpSocket.on('data', (data) => {
      this.handleIncomingData(data);
    });

    this.tcpSocket.on('error', (error) => {
      this.logger.error(`TCP connection error: ${error.message}`);
      this.handleDisconnection();
    });

    this.tcpSocket.on('close', () => {
      this.logger.info('TCP connection closed');
      this.handleDisconnection();
    });
  }

  private connectUDP(ip: string, port: number): void {
    this.udpSocket = dgram.createSocket('udp4');

    this.udpSocket.bind(0, () => {
      this.logger.success(`UDP socket bound for communication with ${ip}:${port}`);
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
      this.logger.error(`UDP socket error: ${error.message}`);
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
        
        this.logger.info(`Buffered response: ${this.responseBuffer.receivedLength}/${this.responseBuffer.expectedLength} bytes`);
      } else if (this.currentRequest) {
        // Start new response buffer for current request
        this.responseBuffer = {
          data: Buffer.from(data),
          expectedLength: this.currentRequest.expectedResponseLength,
          receivedLength: data.length
        };
        
        this.logger.info(`Started response buffer for ${this.currentRequest.id}: ${data.length}/${this.currentRequest.expectedResponseLength} bytes`);
      } else {
        // No pending requests - log as unexpected data
        this.logger.warning(`Received unexpected data: ${data.length} bytes`);
        return;
      }
      
      // Check if we have a complete response
      if (this.responseBuffer && this.responseBuffer.receivedLength >= this.responseBuffer.expectedLength) {
        this.processCompleteResponse(this.responseBuffer.data);
        this.responseBuffer = null;
      }
      
    } catch (error) {
      this.logger.error('Error parsing incoming data:', error as Error);
      this.responseBuffer = null;
    }
  }

  private processCompleteResponse(responseData: Buffer): void {
    // Check if we have a current request
    if (!this.currentRequest) {
      this.logger.warning('Received response but no current request');
      return;
    }

    this.logger.success(`Processing complete response for ${this.currentRequest.id}`);
    
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

        // Verify address matches request
        if (address !== this.currentRequest.address) {
          this.logger.warning(`Address mismatch: expected ${this.currentRequest.address}, got ${address}`);
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
          this.logger.success(`Register ${registerData.name} (${address}) = ${value} (${responseTime}ms)`);
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
          this.logger.success(`Parameter ${parameterData.name} (${address}) = ${value} (${responseTime}ms)`);
        }
      } else {
        this.logger.error(`Invalid response length: ${responseData.length} bytes, expected at least 6`);
      }
    } catch (error) {
      this.logger.error(`Error parsing response: ${error}`);
    }

    // Clear current request and process next in queue
    this.currentRequest = null;
    this.processNextRequest();
  }

  private handleRequestTimeout(requestId: string): void {
    if (this.currentRequest && this.currentRequest.id === requestId) {
      this.logger.error(`Request timeout: ${requestId} (${this.currentRequest.command === 1 ? 'register' : 'parameter'} ${this.currentRequest.address})`);
      
      // Log timeout entry
      this.logCallback?.({
        level: 'error',
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
      this.logger.info(`Queued ${request.command === 1 ? 'register' : 'parameter'} request ${request.address} (queue size: ${this.requestQueue.length})`);
    } else {
      // Send immediately if not busy
      this.sendRequest(request);
    }
  }

  private sendRequest(request: DataRequest): void {
    this.currentRequest = request;
    this.logger.info(`Sending ${request.command === 1 ? 'register' : 'parameter'} request ${request.address} (ID: ${request.id})`);
    
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
    this.logger.info('Disconnecting from device');

    // Update connection status before cleanup
    if (this.connection) {
      this.connection.connected = false;
      this.statusCallback?.(this.connection);
    }

    this.cleanup();
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
      this.logger.error('Cannot take control: not connected to device');
      return;
    }

    this.logger.info('Taking device control');
    
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

    this.logger.info(`Sending Take Control command (type ${TAKE_CONTROL_COMMAND}) with value ${value}`);

    // Create Take Control packet: [command(1)] [address(1)] [value(4)]
    // From Qt app takeControl(): DataRequestType_Control_Interface, address=0, data=value
    const packet = Buffer.alloc(6);
    packet.writeUInt8(TAKE_CONTROL_COMMAND, 0);  // Command type 5
    packet.writeUInt8(0, 1);                     // Address (always 0 for control command)
    packet.writeUInt32LE(value, 2);              // Value (the interface type to take control as)

    this.sendData(packet);

    // Read back CONTROL_INTERFACE register to verify and update control state
    setTimeout(() => {
      this.readRegister(CONTROL_INTERFACE_ADDRESS, 'CONTROL_INTERFACE');
    }, 100);
  }

  public readRegister(address: number, name?: string): void {
    if (!this.connection?.connected) {
      this.logger.error('Cannot read register: not connected');
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
      this.logger.error('Cannot write register: not connected');
      return;
    }

    this.logger.info(`Writing register at address ${address} with value ${value}`);

    // Create write register packet (6 bytes: cmd + addr + value)
    const packet = Buffer.alloc(6);
    packet.writeUInt8(2, 0); // Write register command
    packet.writeUInt8(address, 1); // Address (1 byte)
    packet.writeInt32LE(value, 2); // Value (4 bytes)

    this.sendData(packet);
  }

  public readParameter(address: number): void {
    if (!this.connection?.connected) {
      this.logger.error('Cannot read parameter: not connected');
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
      this.logger.error('Cannot write parameter: not connected');
      return;
    }

    this.logger.info(`Writing parameter at address ${address} with value ${value}`);

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
      this.logger.error('Cannot start plotting: not connected');
      return;
    }

    // Stop existing plotting for this register
    this.stopPlotting(registerName);

    this.logger.info(`Starting plotting for ${registerName} (address: ${address}) with ${pollInterval}ms interval`);

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
      this.logger.info(`Stopped plotting for ${registerName}`);
    }
  }

  public sendCommand(command: number, value: number): void {
    if (!this.connection?.connected) {
      this.logger.error('Cannot send command: not connected');
      return;
    }

    this.logger.info(`Sending command ${command} with value ${value}`);
    
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
      this.logger.error('Error sending data:', error as Error);
    }
  }

  private logPacketDetails(direction: 'SENT' | 'RECEIVED', packet: Buffer): void {
    const currentTime = Date.now();
    const timestamp = new Date(currentTime).toISOString();
    const hexDump = this.formatHexDump(packet);
    const analysis = this.analyzePacket(packet);
    
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
      message: `${direction} packet (${packet.length} bytes)${responseTime}`,
      timestamp: currentTime,
      packetData: packetInfo
    };
    
    this.logCallback?.(logEntry);
    
    this.logger.info(`\n════════════════════════════════════════════════════════════════════`);
    this.logger.info(`${direction} PACKET [${timestamp}] - Size: ${packet.length} bytes${responseTime}`);
    this.logger.info(`Interface: ${this.connection?.interface} | Destination: ${this.connection?.ip}:${this.connection?.port}`);
    this.logger.info(`Statistics: ${stats}`);
    this.logger.info(`════════════════════════════════════════════════════════════════════`);
    this.logger.info('HEX DUMP:');
    this.logger.info(hexDump);
    this.logger.info('─'.repeat(68));
    this.logger.info('PACKET ANALYSIS:');
    this.logger.info(analysis);
    this.logger.info(`════════════════════════════════════════════════════════════════════\n`);
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
    let result = '';
    for (let i = 0; i < buffer.length; i += 16) {
      const offset = i.toString(16).padStart(8, '0').toUpperCase();
      const chunk = buffer.slice(i, i + 16);
      
      // Hex representation
      const hex = Array.from(chunk)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ')
        .padEnd(47, ' ');
      
      // ASCII representation
      const ascii = Array.from(chunk)
        .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
        .join('');
      
      result += `${offset}: ${hex} | ${ascii}\n`;
    }
    return result;
  }

  private analyzePacket(packet: Buffer): string {
    let analysis = '';
    
    if (packet.length === 0) {
      return 'Empty packet';
    }

    const command = packet.readUInt8(0);
    analysis += `Command: 0x${command.toString(16).padStart(2, '0')} (${command})\n`;
    
    switch (command) {
      case 0: // System command
        if (packet.length >= 2) {
          const subCommand = packet.readUInt8(1);
          analysis += `Sub-Command: 0x${subCommand.toString(16).padStart(2, '0')} (${subCommand})\n`;
          if (packet.length >= 6) {
            const value = packet.readInt32LE(2);
            analysis += `Value: ${value} (0x${value.toString(16).padStart(8, '0')})\n`;
          }
        }
        analysis += 'Type: System Command';
        break;
        
      case 1: // Read register
        if (packet.length >= 2) {
          const address = packet.readUInt8(1);
          analysis += `Register Address: ${address} (0x${address.toString(16).padStart(2, '0')})\n`;
        }
        analysis += 'Type: Read Register Command';
        break;

      case 2: // Write register
        if (packet.length >= 6) {
          const address = packet.readUInt8(1);
          const value = packet.readInt32LE(2);
          analysis += `Register Address: ${address} (0x${address.toString(16).padStart(2, '0')})\n`;
          analysis += `Value: ${value} (0x${value.toString(16).padStart(8, '0')})\n`;
        }
        analysis += 'Type: Write Register Command';
        break;

      case 3: // Read parameter
        if (packet.length >= 2) {
          const address = packet.readUInt8(1);
          analysis += `Parameter Address: ${address} (0x${address.toString(16).padStart(2, '0')})\n`;
        }
        analysis += 'Type: Read Parameter Command';
        break;

      case 4: // Write parameter
        if (packet.length >= 6) {
          const address = packet.readUInt8(1);
          const value = packet.readInt32LE(2);
          analysis += `Parameter Address: ${address} (0x${address.toString(16).padStart(2, '0')})\n`;
          analysis += `Value: ${value} (0x${value.toString(16).padStart(8, '0')})\n`;
        }
        analysis += 'Type: Write Parameter Command';
        break;
        
      default:
        if (packet.length >= 6) {
          // Try to interpret as data response
          const address = packet.readUInt16LE(0);
          const value = packet.readInt32LE(2);
          analysis += `Possible Data Response:\n`;
          analysis += `Address: ${address} (0x${address.toString(16).padStart(4, '0')})\n`;
          analysis += `Value: ${value} (0x${value.toString(16).padStart(8, '0')})\n`;
          analysis += 'Type: Data Response (Inferred)';
        } else {
          analysis += 'Type: Unknown/Custom Packet';
        }
        break;
    }
    
    return analysis;
  }

}