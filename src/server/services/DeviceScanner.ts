import dgram from 'dgram';
import { networkInterfaces } from 'os';
import { Logger } from '../utils/Logger';
import { 
  DiscoveredDevice, 
  DS_DISCOVERY_MAGIC, 
  DS_DISCOVERY_REQUEST, 
  DS_DISCOVERY_RESPONSE,
  DISCOVERY_PORT 
} from '../../shared/types';

interface DiscoveryRequest {
  magic: number;
  command: number;
}

interface DiscoveryResponse {
  magic: number;
  command: number;
  board_type: number;
  firmware_version: number;
  board_id: number;
  ip_address: number;
  tcp_port: number;
  udp_port: number;
  mac_address: Buffer;
  reserved: Buffer;
  board_name: string;
}

export class DeviceScanner {
  private logger = Logger.getInstance();
  private socket?: dgram.Socket;
  private isScanning = false;
  private scanTimeout?: NodeJS.Timeout;

  public startScan(
    onDeviceFound: (device: DiscoveredDevice) => void,
    onScanComplete: () => void
  ): void {
    if (this.isScanning) {
      this.logger.warning('Scan already in progress', 'connection');
      return;
    }

    // Ensure any previous socket is fully closed before creating a new one.
    // Prevents port conflicts and resource leaks from rapid scan button clicks.
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Socket may already be closed — safe to ignore
      }
      this.socket = undefined;
    }

    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = undefined;
    }

    this.isScanning = true;
    this.logger.info('Starting device discovery scan', 'connection');

    // Create UDP socket for discovery
    this.socket = dgram.createSocket('udp4');

    // Set up socket for broadcasting
    this.socket.bind(0, () => {
      if (this.socket) {
        this.socket.setBroadcast(true);
        this.broadcastDiscoveryRequest();
      }
    });

    // Listen for discovery responses
    this.socket.on('message', (msg, rinfo) => {
      try {
        const device = this.parseDiscoveryResponse(msg, rinfo.address);
        if (device) {
          this.logger.info(`Device discovered: ${device.board_name} at ${device.ip_address}`, 'connection');
          onDeviceFound(device);
        }
      } catch (error) {
        this.logger.error('Error parsing discovery response:', 'connection', error as Error);
      }
    });

    this.socket.on('error', (error) => {
      this.logger.error('Discovery socket error:', 'connection', error);
      this.stopScan();
    });

    // Stop scan after timeout
    this.scanTimeout = setTimeout(() => {
      this.logger.info('Discovery scan completed', 'connection');
      this.stopScan();
      onScanComplete();
    }, 5000); // 5 second timeout
  }

  private broadcastDiscoveryRequest(): void {
    if (!this.socket) return;

    // Create discovery request packet
    const request = Buffer.alloc(5);
    request.writeUInt32LE(DS_DISCOVERY_MAGIC, 0);
    request.writeUInt8(DS_DISCOVERY_REQUEST, 4);

    // Get all network interfaces and broadcast on each
    const interfaces = networkInterfaces();
    
    for (const interfaceName in interfaces) {
      const networkInterface = interfaces[interfaceName];
      if (!networkInterface) continue;

      for (const addr of networkInterface) {
        if (addr.family === 'IPv4' && !addr.internal) {
          // Calculate broadcast address
          const ip = addr.address.split('.').map(Number);
          const netmask = addr.netmask.split('.').map(Number);
          const broadcast = ip.map((octet, i) => octet | (255 - netmask[i])).join('.');

          this.logger.info(`Broadcasting discovery request on ${interfaceName} (${addr.address}) -> ${broadcast}`, 'connection');

          this.socket!.send(request, DISCOVERY_PORT, broadcast, (error) => {
            if (error) {
              this.logger.error(`Failed to broadcast on ${broadcast}:`, 'connection', error);
            }
          });
        }
      }
    }
  }

  private parseDiscoveryResponse(buffer: Buffer, sourceIp: string): DiscoveredDevice | null {
    if (buffer.length < 32) { // Minimum expected size
      return null;
    }

    try {
      const magic = buffer.readUInt32LE(0);
      const command = buffer.readUInt8(4);

      // Verify this is a valid discovery response
      if (magic !== DS_DISCOVERY_MAGIC || command !== DS_DISCOVERY_RESPONSE) {
        return null;
      }

      const board_type = buffer.readUInt8(5);
      const firmware_version = buffer.readUInt16LE(6);
      const board_id = buffer.readUInt32LE(8);
      const ip_address_raw = buffer.readUInt32LE(12);
      const tcp_port = buffer.readUInt16LE(16);
      const udp_port = buffer.readUInt16LE(18);
      
      // Parse MAC address (6 bytes)
      const mac_bytes = buffer.slice(20, 26);
      const mac_address = Array.from(mac_bytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join(':');

      // Parse board name (remaining bytes, null-terminated)
      const nameBytes = buffer.slice(28);
      const nullIndex = nameBytes.indexOf(0);
      const board_name = nameBytes.slice(0, nullIndex > 0 ? nullIndex : nameBytes.length).toString('ascii');

      // Convert IP address from little-endian uint32 to string
      const ip_address = [
        (ip_address_raw >> 0) & 0xFF,
        (ip_address_raw >> 8) & 0xFF,
        (ip_address_raw >> 16) & 0xFF,
        (ip_address_raw >> 24) & 0xFF
      ].join('.');

      return {
        ip_address,
        board_name: board_name || `Device_${board_id}`,
        mac_address,
        device_id: board_id,
        board_type,
        firmware_version,
        tcp_port,
        udp_port
      };
    } catch (error) {
      this.logger.error('Error parsing discovery response:', 'connection', error as Error);
      return null;
    }
  }

  private stopScan(): void {
    this.isScanning = false;
    
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = undefined;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }
  }
}