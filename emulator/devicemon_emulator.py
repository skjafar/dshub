#!/usr/bin/env python3
"""
DeviceMon Board Emulator
========================
Emulates a DeviceMon board with full protocol support including:
- UDP discovery protocol
- TCP/UDP data communication
- Register and parameter read/write
- Auto-incrementing counters and realistic register behavior
- Control interface state management

Uses only Python standard library - no external dependencies required.
"""

import socket
import threading
import struct
import time
import sys
from datetime import datetime
from typing import Dict, Optional, Tuple

# Protocol Constants
DS_DISCOVERY_MAGIC = 0xDEADBEEF
DS_DISCOVERY_REQUEST = 0x01
DS_DISCOVERY_RESPONSE = 0x02
DISCOVERY_PORT = 2011
DEFAULT_TCP_PORT = 2009
DEFAULT_UDP_PORT = 2011

# Command Types
CMD_READ_REGISTER = 1
CMD_WRITE_REGISTER = 2
CMD_READ_PARAMETER = 3
CMD_WRITE_PARAMETER = 4
CMD_TAKE_CONTROL = 5

# Control Interface States
CONTROL_UNDECIDED = 0
CONTROL_TCP_DATASTREAM = 1
CONTROL_UDP_DATASTREAM = 2
CONTROL_TCP_CLI = 101
CONTROL_USB = 102


class RegisterMap:
    """Manages register values and behavior"""

    def __init__(self):
        # Read-only registers (addresses 0-3)
        self.DS_PACKET_COUNT = 0  # Address 0
        self.DS_ERROR_COUNT = 1   # Address 1
        self.CONTROL_INTERFACE = 2  # Address 2
        self.COUNTER_1HZ = 3      # Address 3

        # Register storage: address -> value
        self.registers: Dict[int, int] = {
            0: 0,  # DS_PACKET_COUNT
            1: 0,  # DS_ERROR_COUNT
            2: CONTROL_UNDECIDED,  # CONTROL_INTERFACE
            3: 0,  # COUNTER_1HZ
        }

        # Track start time for counters
        self.start_time = time.time()

    def read(self, address: int) -> int:
        """Read a register value"""
        # Update dynamic registers before reading
        self._update_dynamic_registers()
        return self.registers.get(address, 0)

    def write(self, address: int, value: int) -> bool:
        """Write a register value (only for writable registers)"""
        # Addresses 0-3 are read-only, except CONTROL_INTERFACE (2) via Take Control
        if address < 4 and address != 2:
            return False

        # CONTROL_INTERFACE can only be set via Take Control command
        if address == 2:
            return False

        self.registers[address] = self._clamp_to_int32(value)
        return True

    def set_control_interface(self, value: int):
        """Set control interface (only via Take Control command)"""
        self.registers[2] = value

    def _update_dynamic_registers(self):
        """Update registers that change automatically"""
        # COUNTER_1HZ increments every second
        elapsed = int(time.time() - self.start_time)
        self.registers[3] = elapsed

    def increment_packet_count(self):
        """Increment packet counter"""
        self.registers[0] = self._clamp_to_int32(self.registers[0] + 1)

    def increment_error_count(self):
        """Increment error counter"""
        self.registers[1] = self._clamp_to_int32(self.registers[1] + 1)

    def _clamp_to_int32(self, value: int) -> int:
        """Clamp value to signed 32-bit integer range"""
        if value > 2147483647:
            return 2147483647
        elif value < -2147483648:
            return -2147483648
        return value


class ParameterMap:
    """Manages parameter values"""

    def __init__(self):
        # Parameter storage: address -> value
        self.parameters: Dict[int, int] = {
            0: 12345,  # DEVICE_ID
            1: 1,      # USES_DHCP
            # IP_ADDR[4] - addresses 2-5
            2: 127,    # IP byte 0
            3: 0,      # IP byte 1
            4: 0,      # IP byte 2
            5: 1,      # IP byte 3
            # GATEWAY_ADDR[4] - addresses 6-9
            6: 127,
            7: 0,
            8: 0,
            9: 1,
            # DNS_SERVER_ADDR[4] - addresses 10-13
            10: 8,
            11: 8,
            12: 8,
            13: 8,
            # NET_MASK[4] - addresses 14-17
            14: 255,
            15: 255,
            16: 255,
            17: 0,
            # MAC_ADDR[6] - addresses 18-23
            18: 0x02,
            19: 0x00,
            20: 0xDE,
            21: 0xAD,
            22: 0xBE,
            23: 0xEF,
            # Read-only parameters
            24: 1,       # PARAMETERS_SETS_IN_FLASH
            25: 0xABCD,  # PARAMETERS_INITIALIZATION_MARKER
        }

    def read(self, address: int) -> int:
        """Read a parameter value"""
        return self.parameters.get(address, 0)

    def write(self, address: int, value: int) -> bool:
        """Write a parameter value (network settings have no effect in emulator)"""
        # Addresses 24-25 are read-only
        if address >= 24:
            return False

        self.parameters[address] = self._clamp_to_int32(value)
        return True

    def _clamp_to_int32(self, value: int) -> int:
        """Clamp value to signed 32-bit integer range"""
        if value > 2147483647:
            return 2147483647
        elif value < -2147483648:
            return -2147483648
        return value

    def get_mac_address(self) -> bytes:
        """Get MAC address as bytes"""
        return bytes([self.parameters[i] & 0xFF for i in range(18, 24)])


class DeviceMonEmulator:
    """Main emulator class"""

    def __init__(self, board_name: str = "DeviceMon Emulator", board_type: int = 1,
                 firmware_version: int = 0x0100):
        self.board_name = board_name
        self.board_type = board_type
        self.firmware_version = firmware_version

        # Data structures
        self.registers = RegisterMap()
        self.parameters = ParameterMap()

        # Network sockets
        self.discovery_socket: Optional[socket.socket] = None
        self.tcp_socket: Optional[socket.socket] = None
        self.udp_socket: Optional[socket.socket] = None

        # Running flag
        self.running = False

        # Statistics
        self.total_packets_received = 0
        self.total_packets_sent = 0

        # Lock for thread-safe access
        self.lock = threading.Lock()

        print(f"DeviceMon Emulator initialized: {board_name}")
        print(f"Board Type: {board_type}, Firmware: 0x{firmware_version:04X}")

    def start(self):
        """Start the emulator"""
        self.running = True

        # Start discovery service
        threading.Thread(target=self._discovery_service, daemon=True).start()

        # Start TCP service
        threading.Thread(target=self._tcp_service, daemon=True).start()

        # Start UDP service
        threading.Thread(target=self._udp_service, daemon=True).start()

        print(f"\nEmulator started successfully!")
        print(f"Discovery: UDP port {DISCOVERY_PORT}")
        print(f"TCP Data: port {DEFAULT_TCP_PORT}")
        print(f"UDP Data: port {DEFAULT_UDP_PORT}")
        print(f"\nPress Ctrl+C to stop the emulator\n")

    def stop(self):
        """Stop the emulator"""
        self.running = False

        if self.discovery_socket:
            self.discovery_socket.close()
        if self.tcp_socket:
            self.tcp_socket.close()
        if self.udp_socket:
            self.udp_socket.close()

    def _discovery_service(self):
        """Handle UDP discovery requests"""
        try:
            self.discovery_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.discovery_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.discovery_socket.bind(('', DISCOVERY_PORT))

            print(f"[Discovery] Listening on UDP port {DISCOVERY_PORT}")

            while self.running:
                try:
                    data, addr = self.discovery_socket.recvfrom(1024)

                    if len(data) >= 5:
                        magic, command = struct.unpack('<IB', data[:5])

                        if magic == DS_DISCOVERY_MAGIC and command == DS_DISCOVERY_REQUEST:
                            print(f"[Discovery] Request from {addr[0]}:{addr[1]}")
                            self._send_discovery_response(addr)
                except socket.timeout:
                    continue
                except Exception as e:
                    if self.running:
                        print(f"[Discovery] Error: {e}")
        except Exception as e:
            print(f"[Discovery] Failed to start: {e}")

    def _send_discovery_response(self, addr: Tuple[str, int]):
        """Send discovery response"""
        # Build response packet
        # Format: magic(4) + command(1) + board_type(1) + firmware(2) + board_id(4) +
        #         ip(4) + tcp_port(2) + udp_port(2) + mac(6) + reserved(2) + name(variable)

        board_id = self.parameters.read(0)  # DEVICE_ID
        mac = self.parameters.get_mac_address()

        # Use localhost IP (127.0.0.1)
        ip_bytes = bytes([127, 0, 0, 1])
        ip_uint32 = struct.unpack('<I', ip_bytes)[0]

        # Build packet
        response = struct.pack('<IBBHIIHHH',
            DS_DISCOVERY_MAGIC,           # magic
            DS_DISCOVERY_RESPONSE,        # command
            self.board_type,              # board_type
            self.firmware_version,        # firmware_version
            board_id,                     # board_id
            ip_uint32,                    # ip_address (little-endian)
            DEFAULT_TCP_PORT,             # tcp_port
            DEFAULT_UDP_PORT,             # udp_port
            0                             # reserved (2 bytes)
        )

        # Add MAC address
        response += mac

        # Add board name (null-terminated)
        name_bytes = self.board_name.encode('ascii')[:32]  # Max 32 chars
        response += name_bytes + b'\x00'

        # Send response
        self.discovery_socket.sendto(response, addr)
        print(f"[Discovery] Sent response to {addr[0]}:{addr[1]}")

    def _tcp_service(self):
        """Handle TCP data connections"""
        try:
            self.tcp_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.tcp_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.tcp_socket.bind(('127.0.0.1', DEFAULT_TCP_PORT))
            self.tcp_socket.listen(1)

            print(f"[TCP] Listening on port {DEFAULT_TCP_PORT}")

            while self.running:
                try:
                    self.tcp_socket.settimeout(1.0)
                    client, addr = self.tcp_socket.accept()
                    print(f"[TCP] Client connected from {addr[0]}:{addr[1]}")

                    # Handle client in new thread
                    threading.Thread(target=self._handle_tcp_client,
                                   args=(client, addr), daemon=True).start()
                except socket.timeout:
                    continue
                except Exception as e:
                    if self.running:
                        print(f"[TCP] Accept error: {e}")
        except Exception as e:
            print(f"[TCP] Failed to start: {e}")

    def _handle_tcp_client(self, client: socket.socket, addr: Tuple[str, int]):
        """Handle a TCP client connection"""
        try:
            client.settimeout(1.0)
            while self.running:
                try:
                    data = client.recv(1024)
                    if not data:
                        break

                    # Process packet
                    response = self._process_packet(data, 'TCP', addr)
                    if response:
                        client.sendall(response)
                except socket.timeout:
                    continue
                except Exception as e:
                    print(f"[TCP] Client error: {e}")
                    break
        finally:
            client.close()
            print(f"[TCP] Client disconnected from {addr[0]}:{addr[1]}")

    def _udp_service(self):
        """Handle UDP data packets"""
        try:
            self.udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.udp_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.udp_socket.bind(('127.0.0.1', DEFAULT_UDP_PORT))

            print(f"[UDP] Listening on port {DEFAULT_UDP_PORT}")

            while self.running:
                try:
                    self.udp_socket.settimeout(1.0)
                    data, addr = self.udp_socket.recvfrom(1024)

                    # Process packet
                    response = self._process_packet(data, 'UDP', addr)
                    if response:
                        self.udp_socket.sendto(response, addr)
                except socket.timeout:
                    continue
                except Exception as e:
                    if self.running:
                        print(f"[UDP] Error: {e}")
        except Exception as e:
            print(f"[UDP] Failed to start: {e}")

    def _process_packet(self, data: bytes, interface: str, addr: Tuple[str, int]) -> Optional[bytes]:
        """Process a data packet and return response"""
        if len(data) < 6:
            return None

        with self.lock:
            self.registers.increment_packet_count()
            self.total_packets_received += 1

        try:
            # Parse packet: command(1) + address(1) + value(4)
            command = data[0]
            address = data[1]
            value = struct.unpack('<i', data[2:6])[0]  # Signed 32-bit

            timestamp = datetime.now().strftime('%H:%M:%S.%f')[:-3]

            # Process based on command
            if command == CMD_READ_REGISTER:
                reg_value = self.registers.read(address)
                print(f"[{interface}] {timestamp} Read Register {address} = {reg_value}")
                response = struct.pack('<BBi', command, address, reg_value)

            elif command == CMD_WRITE_REGISTER:
                success = self.registers.write(address, value)
                if not success:
                    print(f"[{interface}] {timestamp} Write Register {address} FAILED (read-only)")
                    self.registers.increment_error_count()
                else:
                    print(f"[{interface}] {timestamp} Write Register {address} = {value}")
                # Return current value
                reg_value = self.registers.read(address)
                response = struct.pack('<BBi', command, address, reg_value)

            elif command == CMD_READ_PARAMETER:
                param_value = self.parameters.read(address)
                print(f"[{interface}] {timestamp} Read Parameter {address} = {param_value}")
                response = struct.pack('<BBi', command, address, param_value)

            elif command == CMD_WRITE_PARAMETER:
                success = self.parameters.write(address, value)
                if not success:
                    print(f"[{interface}] {timestamp} Write Parameter {address} FAILED (read-only)")
                    self.registers.increment_error_count()
                else:
                    print(f"[{interface}] {timestamp} Write Parameter {address} = {value}")
                # Return current value
                param_value = self.parameters.read(address)
                response = struct.pack('<BBi', command, address, param_value)

            elif command == CMD_TAKE_CONTROL:
                # Take Control command - set control interface
                self.registers.set_control_interface(value)
                control_name = {
                    CONTROL_UNDECIDED: "UNDECIDED",
                    CONTROL_TCP_DATASTREAM: "TCP_DATASTREAM",
                    CONTROL_UDP_DATASTREAM: "UDP_DATASTREAM",
                    CONTROL_TCP_CLI: "TCP_CLI",
                    CONTROL_USB: "USB"
                }.get(value, f"UNKNOWN({value})")
                print(f"[{interface}] {timestamp} Take Control -> {control_name}")
                # Response: same format
                response = struct.pack('<BBi', command, 0, value)

            else:
                print(f"[{interface}] {timestamp} Unknown command: {command}")
                self.registers.increment_error_count()
                return None

            with self.lock:
                self.total_packets_sent += 1

            return response

        except Exception as e:
            print(f"[{interface}] Packet processing error: {e}")
            self.registers.increment_error_count()
            return None

    def print_status(self):
        """Print emulator status"""
        print("\n" + "="*60)
        print(f"DeviceMon Emulator Status - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*60)
        print(f"Board: {self.board_name}")
        print(f"Type: {self.board_type}, Firmware: 0x{self.firmware_version:04X}")
        print(f"\nPackets Received: {self.total_packets_received}")
        print(f"Packets Sent: {self.total_packets_sent}")
        print(f"\nKey Registers:")
        print(f"  DS_PACKET_COUNT (0): {self.registers.read(0)}")
        print(f"  DS_ERROR_COUNT (1): {self.registers.read(1)}")
        print(f"  CONTROL_INTERFACE (2): {self.registers.read(2)}")
        print(f"  COUNTER_1HZ (3): {self.registers.read(3)}")
        print("="*60 + "\n")


def main():
    """Main entry point"""
    print("\n" + "="*60)
    print("DeviceMon Board Emulator")
    print("="*60)
    print("Pure Python emulator with no external dependencies")
    print("Emulates register/parameter read/write and auto-discovery")
    print("="*60 + "\n")

    # Create and start emulator
    emulator = DeviceMonEmulator(
        board_name="Python Emulator",
        board_type=1,
        firmware_version=0x0100
    )

    try:
        emulator.start()

        # Print status every 10 seconds
        last_status = time.time()

        while True:
            time.sleep(1)

            # Print status periodically
            if time.time() - last_status >= 10:
                emulator.print_status()
                last_status = time.time()

    except KeyboardInterrupt:
        print("\n\nShutting down emulator...")
        emulator.stop()
        print("Emulator stopped.\n")
        sys.exit(0)


if __name__ == '__main__':
    main()
