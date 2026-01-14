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
CMD_SYS_COMMAND = 0
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

# System Commands (for CMD_SYS_COMMAND, address field contains command code)
CMD_SYS_READ_FLASH = 0
CMD_SYS_WRITE_FLASH = 1
CMD_SYS_RESET_FIRMWARE = 2

# CNC Motor Controller Commands (200+ range)
CMD_ENABLE_ALL_MOTORS = 200
CMD_DISABLE_ALL_MOTORS = 201
CMD_ENABLE_MOTOR_X = 202
CMD_ENABLE_MOTOR_Y = 203
CMD_ENABLE_MOTOR_Z = 204
CMD_DISABLE_MOTOR_X = 205
CMD_DISABLE_MOTOR_Y = 206
CMD_DISABLE_MOTOR_Z = 207
CMD_ENABLE_SPINDLE = 208
CMD_DISABLE_SPINDLE = 209
CMD_HOME_ALL = 210
CMD_HOME_X = 211
CMD_HOME_Y = 212
CMD_HOME_Z = 213
CMD_E_STOP = 214
CMD_RESET_E_STOP = 215
CMD_CLEAR_ERRORS = 216
CMD_JOG_X_POSITIVE = 220
CMD_JOG_X_NEGATIVE = 221
CMD_JOG_Y_POSITIVE = 222
CMD_JOG_Y_NEGATIVE = 223
CMD_JOG_Z_POSITIVE = 224
CMD_JOG_Z_NEGATIVE = 225

# Controller States
STATE_IDLE = 0
STATE_HOMING = 1
STATE_READY = 2
STATE_RUNNING = 3
STATE_PAUSED = 4
STATE_ERROR = 5
STATE_E_STOP = 6


class MotorAxis:
    """Simulates a servo motor with encoder feedback and critically damped PID control"""

    def __init__(self, name: str, kp: float, ki: float, kd: float, max_vel: float, max_accel: float):
        self.name = name
        self.position = 0.0  # Current encoder position (counts)
        self.velocity = 0.0  # Current velocity (counts/sec)
        self.setpoint = 0    # Target position (counts)
        self.enabled = False

        # PID parameters
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self.integral = 0.0
        self.prev_error = 0.0

        # Motion limits
        self.max_vel = max_vel
        self.max_accel = max_accel

    def update(self, dt: float):
        """Update position using critically damped PID control"""
        if not self.enabled:
            # Decelerate to stop when disabled
            if abs(self.velocity) > 0.1:
                decel = -self.max_accel if self.velocity > 0 else self.max_accel
                self.velocity += decel * dt
                self.position += self.velocity * dt
            else:
                self.velocity = 0.0
            return

        # Calculate error
        error = self.setpoint - self.position

        # PID calculation
        self.integral += error * dt
        derivative = (error - self.prev_error) / dt if dt > 0 else 0.0

        # Commanded acceleration from PID
        accel = self.kp * error + self.ki * self.integral + self.kd * derivative

        # Limit acceleration
        accel = max(-self.max_accel, min(self.max_accel, accel))

        # Update velocity
        self.velocity += accel * dt
        self.velocity = max(-self.max_vel, min(self.max_vel, self.velocity))

        # Update position
        self.position += self.velocity * dt

        self.prev_error = error

    def get_encoder(self) -> int:
        """Get current encoder reading"""
        return int(self.position)

    def reset_integrator(self):
        """Reset PID integral term"""
        self.integral = 0.0


class SpindleController:
    """Simulates a high-speed spindle motor"""

    def __init__(self, max_rpm: int, accel_rpm_per_sec: int):
        self.rpm = 0.0           # Current RPM
        self.setpoint = 0        # Target RPM
        self.enabled = False
        self.load = 50           # Load percentage (30-70% when running)
        self.max_rpm = max_rpm
        self.accel = accel_rpm_per_sec

    def update(self, dt: float):
        """Update spindle RPM with acceleration limiting"""
        if not self.enabled:
            # Decelerate to stop
            if self.rpm > 0:
                self.rpm -= self.accel * dt
                if self.rpm < 0:
                    self.rpm = 0
            self.load = 0
            return

        # Accelerate/decelerate towards setpoint
        error = self.setpoint - self.rpm
        if abs(error) < 1:
            self.rpm = self.setpoint
        else:
            delta = self.accel * dt
            if error > 0:
                self.rpm += min(delta, error)
            else:
                self.rpm -= min(delta, -error)

        # Simulate varying load (30-70% when running)
        import random
        if self.rpm > 100:
            self.load = int(random.uniform(30, 70))
        else:
            self.load = 0

    def get_rpm(self) -> int:
        """Get current RPM"""
        return int(self.rpm)

    def get_load(self) -> int:
        """Get current load percentage"""
        return self.load


class CNCController:
    """CNC Motor Controller state machine and command processor"""

    def __init__(self, registers, parameters):
        self.registers = registers
        self.parameters = parameters
        self.state = STATE_IDLE

        # Initialize motors with default PID gains
        self.motors = {
            'X': MotorAxis('X', kp=2.0, ki=0.1, kd=0.5, max_vel=10000, max_accel=5000),
            'Y': MotorAxis('Y', kp=2.0, ki=0.1, kd=0.5, max_vel=10000, max_accel=5000),
            'Z': MotorAxis('Z', kp=2.0, ki=0.1, kd=0.5, max_vel=8000, max_accel=4000),
        }

        # Initialize spindle
        self.spindle = SpindleController(max_rpm=24000, accel_rpm_per_sec=10000)

        # Homing state
        self.homing_axis = None

    def handle_sys_command(self, cmd: int, value: int) -> int:
        """Handle SYS_COMMAND requests and return result"""

        # Motor enable/disable commands
        if cmd == CMD_ENABLE_ALL_MOTORS:
            for motor in self.motors.values():
                motor.enabled = True
            return 0

        elif cmd == CMD_DISABLE_ALL_MOTORS:
            for motor in self.motors.values():
                motor.enabled = False
            return 0

        elif cmd in (CMD_ENABLE_MOTOR_X, CMD_ENABLE_MOTOR_Y, CMD_ENABLE_MOTOR_Z):
            axis = {CMD_ENABLE_MOTOR_X: 'X', CMD_ENABLE_MOTOR_Y: 'Y', CMD_ENABLE_MOTOR_Z: 'Z'}[cmd]
            self.motors[axis].enabled = True
            return 0

        elif cmd in (CMD_DISABLE_MOTOR_X, CMD_DISABLE_MOTOR_Y, CMD_DISABLE_MOTOR_Z):
            axis = {CMD_DISABLE_MOTOR_X: 'X', CMD_DISABLE_MOTOR_Y: 'Y', CMD_DISABLE_MOTOR_Z: 'Z'}[cmd]
            self.motors[axis].enabled = False
            return 0

        # Spindle control
        elif cmd == CMD_ENABLE_SPINDLE:
            self.spindle.enabled = True
            return 0

        elif cmd == CMD_DISABLE_SPINDLE:
            self.spindle.enabled = False
            return 0

        # Homing commands
        elif cmd == CMD_HOME_ALL:
            self.state = STATE_HOMING
            self.homing_axis = 'ALL'
            return 0

        elif cmd in (CMD_HOME_X, CMD_HOME_Y, CMD_HOME_Z):
            axis = {CMD_HOME_X: 'X', CMD_HOME_Y: 'Y', CMD_HOME_Z: 'Z'}[cmd]
            self.state = STATE_HOMING
            self.homing_axis = axis
            return 0

        # Emergency stop
        elif cmd == CMD_E_STOP:
            self.state = STATE_E_STOP
            for motor in self.motors.values():
                motor.enabled = False
            self.spindle.enabled = False
            return 0

        elif cmd == CMD_RESET_E_STOP:
            if self.state == STATE_E_STOP:
                self.state = STATE_IDLE
            return 0

        elif cmd == CMD_CLEAR_ERRORS:
            if self.state == STATE_ERROR:
                self.state = STATE_IDLE
            return 0

        # Jog commands
        elif cmd in (CMD_JOG_X_POSITIVE, CMD_JOG_X_NEGATIVE,
                     CMD_JOG_Y_POSITIVE, CMD_JOG_Y_NEGATIVE,
                     CMD_JOG_Z_POSITIVE, CMD_JOG_Z_NEGATIVE):
            jog_distance = self.registers.read(18)  # JOG_DISTANCE register

            axis_map = {
                CMD_JOG_X_POSITIVE: ('X', 1), CMD_JOG_X_NEGATIVE: ('X', -1),
                CMD_JOG_Y_POSITIVE: ('Y', 1), CMD_JOG_Y_NEGATIVE: ('Y', -1),
                CMD_JOG_Z_POSITIVE: ('Z', 1), CMD_JOG_Z_NEGATIVE: ('Z', -1),
            }
            axis, direction = axis_map[cmd]

            # Update setpoint
            reg_addr = {'X': 14, 'Y': 15, 'Z': 16}[axis]
            current_setpoint = self.registers.read(reg_addr)
            new_setpoint = current_setpoint + (jog_distance * direction)
            self.motors[axis].setpoint = new_setpoint

            # Update register
            self.registers.write(reg_addr, new_setpoint)

            return 0

        # Unknown command
        return -1

    def update(self, dt: float):
        """Update CNC controller state and motors (called at 100Hz)"""
        # Update all motors
        for motor in self.motors.values():
            motor.update(dt)

        # Update spindle
        self.spindle.update(dt)

        # Handle homing logic
        if self.state == STATE_HOMING:
            # Simplified homing: move to home position from parameters
            if self.homing_axis == 'ALL':
                # Check if all axes are at home
                all_home = True
                for axis in ['X', 'Y', 'Z']:
                    motor = self.motors[axis]
                    home_addr = {'X': 22, 'Y': 23, 'Z': 24}[axis]
                    home_pos = self.parameters.read(home_addr)

                    if abs(motor.position - home_pos) > 1.0:
                        all_home = False
                        motor.setpoint = home_pos

                if all_home:
                    self.state = STATE_READY
                    self.homing_axis = None

            elif self.homing_axis:
                # Single axis homing
                motor = self.motors[self.homing_axis]
                home_addr = {'X': 22, 'Y': 23, 'Z': 24}[self.homing_axis]
                home_pos = self.parameters.read(home_addr)

                if abs(motor.position - home_pos) < 1.0:
                    self.state = STATE_READY
                    self.homing_axis = None
                else:
                    motor.setpoint = home_pos

        # Update controller state register
        self.registers.registers[4] = self.state

        # Update motor encoder registers (read-only registers 5, 6, 7)
        self.registers.registers[5] = self.motors['X'].get_encoder()
        self.registers.registers[6] = self.motors['Y'].get_encoder()
        self.registers.registers[7] = self.motors['Z'].get_encoder()

        # Update spindle registers (read-only registers 8, 9)
        self.registers.registers[8] = self.spindle.get_rpm()
        self.registers.registers[9] = self.spindle.get_load()

        # Update motor enabled status registers (read-only registers 10, 11, 12, 13)
        self.registers.registers[10] = 1 if self.motors['X'].enabled else 0
        self.registers.registers[11] = 1 if self.motors['Y'].enabled else 0
        self.registers.registers[12] = 1 if self.motors['Z'].enabled else 0
        self.registers.registers[13] = 1 if self.spindle.enabled else 0

        # Update motor setpoints from registers (read-write registers 14, 15, 16)
        self.motors['X'].setpoint = self.registers.read(14)
        self.motors['Y'].setpoint = self.registers.read(15)
        self.motors['Z'].setpoint = self.registers.read(16)

        # Update spindle setpoint from register (read-write register 17)
        self.spindle.setpoint = self.registers.read(17)


class RegisterMap:
    """Manages register values and behavior"""

    def __init__(self):
        # Read-only registers (addresses 0-13)
        self.DS_PACKET_COUNT = 0  # Address 0
        self.DS_ERROR_COUNT = 1   # Address 1
        self.CONTROL_INTERFACE = 2  # Address 2
        self.COUNTER_1HZ = 3      # Address 3
        # CNC registers
        self.CONTROLLER_STATE = 4   # Address 4
        self.MOTOR_X_ENCODER = 5    # Address 5
        self.MOTOR_Y_ENCODER = 6    # Address 6
        self.MOTOR_Z_ENCODER = 7    # Address 7
        self.SPINDLE_RPM = 8        # Address 8
        self.SPINDLE_LOAD = 9       # Address 9
        self.MOTOR_X_ENABLED = 10   # Address 10
        self.MOTOR_Y_ENABLED = 11   # Address 11
        self.MOTOR_Z_ENABLED = 12   # Address 12
        self.SPINDLE_ENABLED = 13   # Address 13

        # Register storage: address -> value
        self.registers: Dict[int, int] = {
            # Standard registers
            0: 0,  # DS_PACKET_COUNT
            1: 0,  # DS_ERROR_COUNT
            2: CONTROL_UNDECIDED,  # CONTROL_INTERFACE
            3: 0,  # COUNTER_1HZ
            # CNC read-only registers
            4: STATE_IDLE,  # CONTROLLER_STATE
            5: 0,  # MOTOR_X_ENCODER
            6: 0,  # MOTOR_Y_ENCODER
            7: 0,  # MOTOR_Z_ENCODER
            8: 0,  # SPINDLE_RPM
            9: 0,  # SPINDLE_LOAD
            10: 0,  # MOTOR_X_ENABLED
            11: 0,  # MOTOR_Y_ENABLED
            12: 0,  # MOTOR_Z_ENABLED
            13: 0,  # SPINDLE_ENABLED
            # CNC read-write registers
            14: 0,  # MOTOR_X_SETPOINT
            15: 0,  # MOTOR_Y_SETPOINT
            16: 0,  # MOTOR_Z_SETPOINT
            17: 0,  # SPINDLE_SPEED_SETPOINT
            18: 100,  # JOG_DISTANCE (default 100 encoder counts)
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
        # Addresses 0-13 are read-only, except CONTROL_INTERFACE (2) via Take Control
        if address < 14 and address != 2:
            return False

        # CONTROL_INTERFACE can only be set via Take Control command
        if address == 2:
            return False

        # Addresses 14-18 are read-write CNC registers
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
        # Parameter storage: address -> value (CNC parameters)
        self.parameters: Dict[int, int] = {
            # Motor maximum velocities (counts/sec)
            0: 10000,  # MOTOR_X_MAX_VEL
            1: 10000,  # MOTOR_Y_MAX_VEL
            2: 8000,   # MOTOR_Z_MAX_VEL
            # Motor maximum accelerations (counts/sec²)
            3: 5000,   # MOTOR_X_MAX_ACCEL
            4: 5000,   # MOTOR_Y_MAX_ACCEL
            5: 4000,   # MOTOR_Z_MAX_ACCEL
            # X-axis PID gains (stored as float bits via struct.pack)
            6: struct.unpack('i', struct.pack('f', 2.0))[0],   # MOTOR_X_KP
            7: struct.unpack('i', struct.pack('f', 0.1))[0],   # MOTOR_X_KI
            8: struct.unpack('i', struct.pack('f', 0.5))[0],   # MOTOR_X_KD
            # Y-axis PID gains
            9: struct.unpack('i', struct.pack('f', 2.0))[0],   # MOTOR_Y_KP
            10: struct.unpack('i', struct.pack('f', 0.1))[0],  # MOTOR_Y_KI
            11: struct.unpack('i', struct.pack('f', 0.5))[0],  # MOTOR_Y_KD
            # Z-axis PID gains
            12: struct.unpack('i', struct.pack('f', 2.0))[0],  # MOTOR_Z_KP
            13: struct.unpack('i', struct.pack('f', 0.1))[0],  # MOTOR_Z_KI
            14: struct.unpack('i', struct.pack('f', 0.5))[0],  # MOTOR_Z_KD
            # Motor scaling (steps per mm)
            15: struct.unpack('i', struct.pack('f', 200.0))[0],  # MOTOR_X_STEPS_PER_MM
            16: struct.unpack('i', struct.pack('f', 200.0))[0],  # MOTOR_Y_STEPS_PER_MM
            17: struct.unpack('i', struct.pack('f', 400.0))[0],  # MOTOR_Z_STEPS_PER_MM
            # Spindle parameters
            18: 24000,   # SPINDLE_MAX_RPM
            19: 10000,   # SPINDLE_ACCEL_RPM_PER_SEC
            # Emergency stop deceleration
            20: 20000,   # E_STOP_DECEL
            # Homing speed
            21: 2000,    # HOMING_SPEED
            # Home positions (encoder counts)
            22: 0,       # HOME_X_POSITION
            23: 0,       # HOME_Y_POSITION
            24: 0,       # HOME_Z_POSITION
        }

    def read(self, address: int) -> int:
        """Read a parameter value"""
        return self.parameters.get(address, 0)

    def write(self, address: int, value: int) -> bool:
        """Write a parameter value (all CNC parameters are writable)"""
        # All CNC parameters (0-24) are writable
        if address < 0 or address > 24:
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
        """Return emulator MAC address (6 bytes)"""
        # Use a locally administered MAC address (02:xx:xx:xx:xx:xx)
        return bytes([0x02, 0x00, 0x00, 0x00, 0x00, 0x01])


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

        # CNC Controller
        self.cnc_controller = CNCController(self.registers, self.parameters)

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

        # Start discovery/UDP service (handles both discovery and data packets)
        threading.Thread(target=self._discovery_service, daemon=True).start()

        # Start TCP service
        threading.Thread(target=self._tcp_service, daemon=True).start()

        # UDP service is now integrated with discovery service
        # threading.Thread(target=self._udp_service, daemon=True).start()

        # Start CNC motion control thread (100Hz update rate)
        threading.Thread(target=self._motion_update_thread, daemon=True).start()

        print(f"\nEmulator started successfully!")
        print(f"Discovery/UDP: port {DISCOVERY_PORT} (handles both discovery and data)")
        print(f"TCP Data: port {DEFAULT_TCP_PORT}")
        print(f"CNC Motion Control: 100Hz update rate")
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
        """Handle UDP discovery requests and data packets"""
        try:
            self.discovery_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.discovery_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.discovery_socket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            self.discovery_socket.bind(('', DISCOVERY_PORT))
            self.discovery_socket.settimeout(1.0)

            print(f"[Discovery/UDP] Listening on UDP port {DISCOVERY_PORT}")

            while self.running:
                try:
                    data, addr = self.discovery_socket.recvfrom(1024)

                    if len(data) >= 5:
                        magic, command = struct.unpack('<IB', data[:5])

                        # Check if this is a discovery request
                        if magic == DS_DISCOVERY_MAGIC and command == DS_DISCOVERY_REQUEST:
                            print(f"[Discovery] Request from {addr[0]}:{addr[1]}")
                            self._send_discovery_response(addr)
                        else:
                            # This is a data packet, process it
                            response = self._process_packet(data, 'UDP', addr)
                            if response:
                                self.discovery_socket.sendto(response, addr)
                except socket.timeout:
                    continue
                except Exception as e:
                    if self.running:
                        print(f"[Discovery/UDP] Error: {e}")
        except Exception as e:
            print(f"[Discovery/UDP] Failed to start: {e}")

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

    def _motion_update_thread(self):
        """Motion control loop running at 100Hz"""
        dt = 0.01  # 10ms update interval
        print(f"[MOTION] Motion control thread started (100Hz)")

        while self.running:
            start_time = time.time()

            # Update CNC controller
            with self.lock:
                self.cnc_controller.update(dt)

            # Sleep to maintain 100Hz rate
            elapsed = time.time() - start_time
            sleep_time = dt - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

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
            if command == CMD_SYS_COMMAND:
                # SYS_COMMAND: address field contains the command code
                sys_cmd = address
                cmd_value = value

                # Command name lookup
                cmd_names = {
                    CMD_SYS_READ_FLASH: "READ_FLASH",
                    CMD_SYS_WRITE_FLASH: "WRITE_FLASH",
                    CMD_SYS_RESET_FIRMWARE: "RESET_FIRMWARE",
                    CMD_ENABLE_ALL_MOTORS: "ENABLE_ALL_MOTORS",
                    CMD_DISABLE_ALL_MOTORS: "DISABLE_ALL_MOTORS",
                    CMD_ENABLE_MOTOR_X: "ENABLE_MOTOR_X",
                    CMD_ENABLE_MOTOR_Y: "ENABLE_MOTOR_Y",
                    CMD_ENABLE_MOTOR_Z: "ENABLE_MOTOR_Z",
                    CMD_DISABLE_MOTOR_X: "DISABLE_MOTOR_X",
                    CMD_DISABLE_MOTOR_Y: "DISABLE_MOTOR_Y",
                    CMD_DISABLE_MOTOR_Z: "DISABLE_MOTOR_Z",
                    CMD_ENABLE_SPINDLE: "ENABLE_SPINDLE",
                    CMD_DISABLE_SPINDLE: "DISABLE_SPINDLE",
                    CMD_HOME_ALL: "HOME_ALL",
                    CMD_HOME_X: "HOME_X",
                    CMD_HOME_Y: "HOME_Y",
                    CMD_HOME_Z: "HOME_Z",
                    CMD_E_STOP: "E_STOP",
                    CMD_RESET_E_STOP: "RESET_E_STOP",
                    CMD_CLEAR_ERRORS: "CLEAR_ERRORS",
                    CMD_JOG_X_POSITIVE: "JOG_X_POSITIVE",
                    CMD_JOG_X_NEGATIVE: "JOG_X_NEGATIVE",
                    CMD_JOG_Y_POSITIVE: "JOG_Y_POSITIVE",
                    CMD_JOG_Y_NEGATIVE: "JOG_Y_NEGATIVE",
                    CMD_JOG_Z_POSITIVE: "JOG_Z_POSITIVE",
                    CMD_JOG_Z_NEGATIVE: "JOG_Z_NEGATIVE",
                }
                cmd_name = cmd_names.get(sys_cmd, f"UNKNOWN({sys_cmd})")

                print(f"[{interface}] {timestamp} SYS_COMMAND: {cmd_name} (value={cmd_value})")

                # Handle CNC commands
                result = self.cnc_controller.handle_sys_command(sys_cmd, cmd_value)

                if result == 0:
                    # Success (status = 0)
                    response = struct.pack('<BBi', 0, sys_cmd, result)
                else:
                    # Error (status = -1)
                    print(f"[{interface}] {timestamp} SYS_COMMAND {cmd_name} FAILED")
                    self.registers.increment_error_count()
                    response = struct.pack('<BBi', -1, sys_cmd, 0)

            elif command == CMD_READ_REGISTER:
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
