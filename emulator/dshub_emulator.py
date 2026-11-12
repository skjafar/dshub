#!/usr/bin/env python3
"""
DSHub Board Emulator
========================
Emulates a DSHub board with full protocol support including:
- UDP discovery protocol
- TCP/UDP data communication
- Register and parameter read/write
- System register read (read-only from protocol, cmd 6)
- Auto-incrementing counters and realistic register behavior
- Control interface state management

Uses only Python standard library - no external dependencies required.

Protocol v0.2.4: 8-byte packets with 16-bit type/address/status fields.
  RX: type(u16 LE) + address(u16 LE) + value(i32 LE) = 8 bytes
  TX: status(i16 LE) + address(u16 LE) + value(i32 LE) = 8 bytes
"""

import argparse
import socket
import threading
import struct
import time
import sys
import math
import random
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# Protocol Constants
DS_DISCOVERY_MAGIC = 0xDEADBEEF
DS_DISCOVERY_REQUEST = 0x01
DS_DISCOVERY_RESPONSE = 0x02
DISCOVERY_PORT = 2011
DEFAULT_TCP_PORT = 2009
DEFAULT_UDP_PORT = 2011

# Command Types (type field in RX packet, u16)
CMD_SYS_COMMAND             = 0
CMD_READ_REGISTER           = 1
CMD_WRITE_REGISTER          = 2
CMD_READ_PARAMETER          = 3
CMD_WRITE_PARAMETER         = 4
CMD_TAKE_CONTROL            = 5
CMD_READ_SYSTEM_REGISTER    = 6
CMD_WRITE_SYSTEM_REGISTER   = 7   # Always returns PERMISSION_ERROR (-5)

# Response Status Codes (status field in TX packet, i16)
STATUS_SYS_COMMAND_OK       = 0
STATUS_READ_REGISTER_OK     = 1
STATUS_WRITE_REGISTER_OK    = 2
STATUS_READ_PARAMETER_OK    = 3
STATUS_WRITE_PARAMETER_OK   = 4
STATUS_CONTROL_OK           = 5
STATUS_SYS_COMMAND_ERROR    = -1
STATUS_INPUT_TYPE_ERROR     = -2
STATUS_PACKET_SIZE_ERROR    = -3
STATUS_ADDRESS_ERROR        = -4
STATUS_PERMISSION_ERROR     = -5
STATUS_CONTROL_ERROR        = -6

# Control Interface States
CONTROL_UNDECIDED           = 0
CONTROL_TCP_DATASTREAM      = 1
CONTROL_UDP_DATASTREAM      = 2
CONTROL_TCP_CLI             = 101
CONTROL_USB                 = 102

# Library System Commands (for CMD_SYS_COMMAND, address field, u16)
# Range 65000-65535 reserved for library use (v0.2.2+)
CMD_SYS_READ_FLASH          = 65000
CMD_SYS_WRITE_FLASH         = 65001
CMD_SYS_RESET_FIRMWARE      = 65002

# CNC Motor Controller Commands (SYS_COMMAND address field, u16)
# Sent as type=CMD_SYS_COMMAND (0) with the command code in the address field.
CMD_ENABLE_ALL_MOTORS       = 0
CMD_DISABLE_ALL_MOTORS      = 1
CMD_ENABLE_MOTOR_X          = 2
CMD_ENABLE_MOTOR_Y          = 3
CMD_ENABLE_MOTOR_Z          = 4
CMD_DISABLE_MOTOR_X         = 5
CMD_DISABLE_MOTOR_Y         = 6
CMD_DISABLE_MOTOR_Z         = 7
CMD_ENABLE_SPINDLE          = 8
CMD_DISABLE_SPINDLE         = 9
CMD_HOME_ALL                = 10
CMD_HOME_X                  = 11
CMD_HOME_Y                  = 12
CMD_HOME_Z                  = 13
CMD_E_STOP                  = 14
CMD_RESET_E_STOP            = 15
CMD_CLEAR_ERRORS            = 16
CMD_JOG_X_POSITIVE          = 20
CMD_JOG_X_NEGATIVE          = 21
CMD_JOG_Y_POSITIVE          = 22
CMD_JOG_Y_NEGATIVE          = 23
CMD_JOG_Z_POSITIVE          = 24
CMD_JOG_Z_NEGATIVE          = 25

# Controller States
STATE_IDLE   = 0
STATE_HOMING = 1
STATE_READY  = 2
STATE_RUNNING = 3
STATE_PAUSED = 4
STATE_ERROR  = 5
STATE_E_STOP = 6

# Counts an axis moves off its home switch before approaching it again.
HOMING_BACKOFF = 200.0

# ── System register address constants (cmd 6) ────────────────────────────────
# Only the 4 library-managed fields from ds_system_register_names_t.
SYSREG_DS_PACKET_COUNT      = 0
SYSREG_DS_ERROR_COUNT       = 1
SYSREG_CONTROL_INTERFACE    = 2
SYSREG_COUNTER_1HZ          = 3

# ── CNC user register address constants (cmd 1/2) ────────────────────────────
# Read-only section (addresses 0–9): application state, written internally.
# Protocol CMD_WRITE_REGISTER to these addresses returns PERMISSION_ERROR.
REG_CONTROLLER_STATE        = 0
REG_MOTOR_X_ENCODER         = 1
REG_MOTOR_Y_ENCODER         = 2
REG_MOTOR_Z_ENCODER         = 3
REG_SPINDLE_RPM             = 4
REG_SPINDLE_LOAD            = 5
REG_MOTOR_X_ENABLED         = 6
REG_MOTOR_Y_ENABLED         = 7
REG_MOTOR_Z_ENABLED         = 8
REG_SPINDLE_ENABLED         = 9

# Read-write section (addresses 10–14): setpoints written by the host.
REG_MOTOR_X_SETPOINT        = 10
REG_MOTOR_Y_SETPOINT        = 11
REG_MOTOR_Z_SETPOINT        = 12
REG_SPINDLE_SPEED_SETPOINT  = 13
REG_JOG_DISTANCE            = 14

# Number of read-only user registers at the start of the address space
USER_REG_READ_ONLY_COUNT    = 10


class MotorAxis:
    """A servo axis with encoder feedback.

    Motion follows a trapezoidal profile: the axis accelerates at most at
    max_accel, cruises at most at max_vel and brakes so that it stops on the
    target without overshooting. The PID gains are stored for the tuning
    dashboards; the simulated drive is an ideal position loop.
    """

    def __init__(self, name: str, kp: float, ki: float, kd: float, max_vel: float, max_accel: float):
        self.name = name
        # Encoder counts; the machine (home switch) position is position - offset.
        self.position = 0.0
        self.offset = 0.0
        self.velocity = 0.0
        self.setpoint = 0
        self.enabled = False
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self.max_vel = max_vel
        self.max_accel = max_accel

    def update(self, dt: float, target: Optional[float] = None, speed: Optional[float] = None):
        """Advances one step towards `target` (default: the setpoint), at
        most at `speed` (default: max_vel)."""
        if not self.enabled:
            # A disabled drive coasts to a stop at the axis deceleration.
            if abs(self.velocity) > 0.1:
                decel = -self.max_accel if self.velocity > 0 else self.max_accel
                old_velocity = self.velocity
                self.velocity += decel * dt
                if old_velocity * self.velocity <= 0:
                    self.velocity = 0.0
                self.position += self.velocity * dt
            else:
                self.velocity = 0.0
            return

        goal = float(self.setpoint if target is None else target)
        error = goal - self.position
        limit = self.max_vel if speed is None else min(self.max_vel, speed)
        if abs(error) < 0.5 and abs(self.velocity) <= self.max_accel * dt:
            self.position = goal
            self.velocity = 0.0
            return
        # The fastest speed from which the axis can still stop at the goal,
        # allowing for one step of reaction (v²/2a + v·dt ≤ distance), and
        # never more than the remaining distance in one step.
        reaction = self.max_accel * dt
        brake = math.sqrt(reaction * reaction + 2 * self.max_accel * abs(error)) - reaction
        wanted = math.copysign(min(limit, brake, abs(error) / dt), error)
        step = self.max_accel * dt
        self.velocity += max(-step, min(step, wanted - self.velocity))
        self.position += self.velocity * dt

    def at(self, goal: float) -> bool:
        return abs(goal - self.position) < 0.5 and self.velocity == 0.0

    def get_encoder(self) -> int:
        return int(round(self.position))

    def reset_integrator(self):
        """Kept for callers of the former PID model; the profile has no state."""


class SpindleController:
    """Simulates a high-speed spindle motor"""

    def __init__(self, max_rpm: int, accel_rpm_per_sec: int):
        self.rpm = 0.0
        self.setpoint = 0
        self.enabled = False
        self.load = 50
        self.max_rpm = max_rpm
        self.accel = accel_rpm_per_sec

    def update(self, dt: float):
        if not self.enabled:
            if self.rpm > 0:
                self.rpm -= self.accel * dt
                if self.rpm < 0:
                    self.rpm = 0
            self.load = 0
            return

        error = self.setpoint - self.rpm
        if abs(error) < 1:
            self.rpm = self.setpoint
        else:
            delta = self.accel * dt
            if error > 0:
                self.rpm += min(delta, error)
            else:
                self.rpm -= min(delta, -error)

        import random
        if self.rpm > 100:
            self.load = int(random.uniform(30, 70))
        else:
            self.load = 0

    def get_rpm(self) -> int:
        return int(self.rpm)

    def get_load(self) -> int:
        return self.load


class SystemRegisterMap:
    """
    Library-managed system registers (addresses 0–3).
    Matches ds_system_register_names_t from the datastream library.
    Read-only from the external protocol (cmd 6 = read, cmd 7 = always PERMISSION_ERROR).
    Written internally by the firmware/emulator logic only.
    """

    def __init__(self):
        self.start_time = time.time()
        self.registers: Dict[int, int] = {
            SYSREG_DS_PACKET_COUNT:   0,
            SYSREG_DS_ERROR_COUNT:    0,
            SYSREG_CONTROL_INTERFACE: CONTROL_UNDECIDED,
            SYSREG_COUNTER_1HZ:       0,
        }

    def read(self, address: int) -> int:
        """Read a system register value (updates dynamic registers first)."""
        self._update_dynamic()
        return self.registers.get(address, 0)

    def write_internal(self, address: int, value: int):
        """Write a system register internally (firmware use only — not from protocol)."""
        self.registers[address] = _clamp_i32(value)

    def set_control_interface(self, value: int):
        self.registers[SYSREG_CONTROL_INTERFACE] = value

    def increment_packet_count(self):
        self.registers[SYSREG_DS_PACKET_COUNT] = _clamp_i32(
            self.registers[SYSREG_DS_PACKET_COUNT] + 1)

    def increment_error_count(self):
        self.registers[SYSREG_DS_ERROR_COUNT] = _clamp_i32(
            self.registers[SYSREG_DS_ERROR_COUNT] + 1)

    def _update_dynamic(self):
        self.registers[SYSREG_COUNTER_1HZ] = int(time.time() - self.start_time)


class UserRegisterMap:
    """
    CNC application user registers (addresses 0–14).
    - Addresses 0–9 (USER_REG_READ_ONLY_COUNT): read-only from the protocol.
      Written internally by the CNC controller via write_internal().
      CMD_WRITE_REGISTER to these addresses returns PERMISSION_ERROR.
    - Addresses 10–14: read-write, written by the host via CMD_WRITE_REGISTER.
    """

    def __init__(self):
        self.registers: Dict[int, int] = {
            # Read-only section (0–9): CNC application state
            REG_CONTROLLER_STATE:       STATE_IDLE,
            REG_MOTOR_X_ENCODER:        0,
            REG_MOTOR_Y_ENCODER:        0,
            REG_MOTOR_Z_ENCODER:        0,
            REG_SPINDLE_RPM:            0,
            REG_SPINDLE_LOAD:           0,
            REG_MOTOR_X_ENABLED:        0,
            REG_MOTOR_Y_ENABLED:        0,
            REG_MOTOR_Z_ENABLED:        0,
            REG_SPINDLE_ENABLED:        0,
            # Read-write section (10–14): setpoints
            REG_MOTOR_X_SETPOINT:       0,
            REG_MOTOR_Y_SETPOINT:       0,
            REG_MOTOR_Z_SETPOINT:       0,
            REG_SPINDLE_SPEED_SETPOINT: 0,
            REG_JOG_DISTANCE:           100,  # default: 100 encoder counts
        }

    def read(self, address: int) -> int:
        return self.registers.get(address, 0)

    def write(self, address: int, value: int) -> bool:
        """Write via protocol (cmd 2). Rejects read-only section (addresses < USER_REG_READ_ONLY_COUNT)."""
        if address < USER_REG_READ_ONLY_COUNT:
            return False  # Read-only — caller should return PERMISSION_ERROR
        if address not in self.registers:
            return False
        self.registers[address] = _clamp_i32(value)
        return True

    def write_internal(self, address: int, value: int):
        """Write from firmware logic — allowed for all addresses including read-only section."""
        self.registers[address] = _clamp_i32(value)


class CNCController:
    """CNC Motor Controller state machine and command processor"""

    def __init__(self, system_registers: SystemRegisterMap,
                 user_registers: UserRegisterMap, parameters):
        self.sys_regs = system_registers
        self.user_regs = user_registers
        self.parameters = parameters
        self.state = STATE_IDLE

        self.motors = {
            'X': MotorAxis('X', kp=2.0, ki=0.1, kd=0.5, max_vel=10000, max_accel=5000),
            'Y': MotorAxis('Y', kp=2.0, ki=0.1, kd=0.5, max_vel=10000, max_accel=5000),
            'Z': MotorAxis('Z', kp=2.0, ki=0.1, kd=0.5, max_vel=8000,  max_accel=4000),
        }
        self.spindle = SpindleController(max_rpm=24000, accel_rpm_per_sec=10000)
        # Axes being homed and their phase: 'seek' the switch at homing
        # speed, 'backoff' clear of it, then 'approach' it again slowly.
        self.homing: Dict[str, str] = {}

    def handle_sys_command(self, cmd: int, value: int) -> int:
        if self.state in (STATE_E_STOP, STATE_ERROR) and cmd not in (
                CMD_E_STOP, CMD_RESET_E_STOP, CMD_CLEAR_ERRORS,
                CMD_DISABLE_ALL_MOTORS, CMD_DISABLE_MOTOR_X,
                CMD_DISABLE_MOTOR_Y, CMD_DISABLE_MOTOR_Z, CMD_DISABLE_SPINDLE):
            return -1
        if cmd == CMD_ENABLE_ALL_MOTORS:
            for motor in self.motors.values():
                motor.enabled = True
            return 0

        elif cmd == CMD_DISABLE_ALL_MOTORS:
            self._cancel_homing(self.motors)
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
            self._cancel_homing([axis])
            return 0

        elif cmd == CMD_ENABLE_SPINDLE:
            self.spindle.enabled = True
            if self.user_regs.read(REG_SPINDLE_SPEED_SETPOINT) == 0:
                self.user_regs.write_internal(REG_SPINDLE_SPEED_SETPOINT, 12000)
                self.spindle.setpoint = 12000
            return 0

        elif cmd == CMD_DISABLE_SPINDLE:
            self.spindle.enabled = False
            return 0

        elif cmd in (CMD_HOME_ALL, CMD_HOME_X, CMD_HOME_Y, CMD_HOME_Z):
            axes = {CMD_HOME_ALL: 'XYZ', CMD_HOME_X: 'X', CMD_HOME_Y: 'Y', CMD_HOME_Z: 'Z'}[cmd]
            # Homing drives the axes, so it enables them.
            for axis in axes:
                self.motors[axis].enabled = True
                self.homing[axis] = 'seek'
            self.state = STATE_HOMING
            return 0

        elif cmd == CMD_E_STOP:
            self.state = STATE_E_STOP
            for motor in self.motors.values():
                motor.enabled = False
            self.spindle.enabled = False
            self.homing.clear()
            for i, motor in enumerate(self.motors.values()):
                motor.reset_integrator()
                self.user_regs.write_internal(REG_MOTOR_X_SETPOINT + i, motor.get_encoder())
            self.user_regs.write_internal(REG_SPINDLE_SPEED_SETPOINT, 0)
            return 0

        elif cmd == CMD_RESET_E_STOP:
            if self.state == STATE_E_STOP:
                if any(abs(m.velocity) > 0.1 for m in self.motors.values()) or self.spindle.rpm > 0:
                    return -1
                for i, motor in enumerate(self.motors.values()):
                    self.user_regs.write_internal(REG_MOTOR_X_SETPOINT + i, motor.get_encoder())
                self.state = STATE_IDLE
            return 0

        elif cmd == CMD_CLEAR_ERRORS:
            if self.state == STATE_ERROR:
                self.state = STATE_IDLE
            return 0

        elif cmd in (CMD_JOG_X_POSITIVE, CMD_JOG_X_NEGATIVE,
                     CMD_JOG_Y_POSITIVE, CMD_JOG_Y_NEGATIVE,
                     CMD_JOG_Z_POSITIVE, CMD_JOG_Z_NEGATIVE):
            # A negative distance (written as a value the map reads unsigned)
            # does not move the axis backwards.
            jog_distance = max(0, self.user_regs.read(REG_JOG_DISTANCE))
            axis_map = {
                CMD_JOG_X_POSITIVE: ('X', 1,  REG_MOTOR_X_SETPOINT),
                CMD_JOG_X_NEGATIVE: ('X', -1, REG_MOTOR_X_SETPOINT),
                CMD_JOG_Y_POSITIVE: ('Y', 1,  REG_MOTOR_Y_SETPOINT),
                CMD_JOG_Y_NEGATIVE: ('Y', -1, REG_MOTOR_Y_SETPOINT),
                CMD_JOG_Z_POSITIVE: ('Z', 1,  REG_MOTOR_Z_SETPOINT),
                CMD_JOG_Z_NEGATIVE: ('Z', -1, REG_MOTOR_Z_SETPOINT),
            }
            axis, direction, reg_addr = axis_map[cmd]
            if axis in self.homing:
                return -1
            new_setpoint = self.user_regs.read(reg_addr) + (jog_distance * direction)
            self.motors[axis].setpoint = new_setpoint
            self.user_regs.write_internal(reg_addr, new_setpoint)
            return 0

        return -1

    def _cancel_homing(self, axes):
        for axis in axes:
            self.homing.pop(axis, None)
        if self.state == STATE_HOMING and not self.homing:
            self.state = STATE_IDLE

    def _home(self, i: int, axis: str, motor: MotorAxis, dt: float):
        """One step of an axis's homing sequence."""
        speed = self.parameters.usable(21)
        phase = self.homing[axis]
        machine = {'seek': 0.0, 'backoff': HOMING_BACKOFF, 'approach': 0.0}[phase]
        goal = machine + motor.offset
        motor.update(dt, goal, speed if phase != 'approach' else max(speed / 4, 1))
        if not motor.at(goal):
            return
        if phase == 'seek':
            self.homing[axis] = 'backoff'
        elif phase == 'backoff':
            self.homing[axis] = 'approach'
        else:
            # On the switch: the encoder now reads the configured home value.
            home = self.parameters.read(22 + i)
            motor.offset = float(home)
            motor.position = float(home)
            self.user_regs.write_internal(REG_MOTOR_X_SETPOINT + i, home)
            del self.homing[axis]

    def update(self, dt: float):
        """Update CNC controller state and motors (called at 100Hz)"""
        if dt <= 0:
            return
        homing = self.state == STATE_HOMING
        for i, (axis, motor) in enumerate(self.motors.items()):
            motor.max_vel = self.parameters.usable(i)
            motor.max_accel = self.parameters.usable(20 if self.state == STATE_E_STOP else 3 + i)
            motor.kp, motor.ki, motor.kd = [
                struct.unpack('<f', struct.pack('<i', self.parameters.usable(6 + i * 3 + j)))[0]
                for j in range(3)]
            target = REG_MOTOR_X_SETPOINT + i
            if axis in self.homing:
                # A homing axis ignores its setpoint until it is homed.
                self._home(i, axis, motor, dt)
                continue
            motor.setpoint = self.user_regs.read(target)
            motor.update(dt)
        self.spindle.max_rpm = self.parameters.usable(18)
        self.spindle.accel = self.parameters.usable(19)
        self.spindle.setpoint = max(0, min(self.spindle.max_rpm,
            self.user_regs.read(REG_SPINDLE_SPEED_SETPOINT)))
        self.spindle.update(dt)
        moving = any(m.enabled and (abs(m.setpoint - m.position) >= 0.5 or abs(m.velocity) >= 1)
                     for m in self.motors.values())
        if homing:
            if not self.homing:
                self.state = STATE_READY
        elif self.state not in (STATE_E_STOP, STATE_ERROR):
            self.state = (STATE_RUNNING if moving else
                          STATE_READY if any(m.enabled for m in self.motors.values()) else STATE_IDLE)

        # Write current state to user registers (read-only section, internal writes)
        self.user_regs.write_internal(REG_CONTROLLER_STATE,  self.state)
        self.user_regs.write_internal(REG_MOTOR_X_ENCODER,   self.motors['X'].get_encoder())
        self.user_regs.write_internal(REG_MOTOR_Y_ENCODER,   self.motors['Y'].get_encoder())
        self.user_regs.write_internal(REG_MOTOR_Z_ENCODER,   self.motors['Z'].get_encoder())
        self.user_regs.write_internal(REG_SPINDLE_RPM,        self.spindle.get_rpm())
        self.user_regs.write_internal(REG_SPINDLE_LOAD,       self.spindle.get_load())
        self.user_regs.write_internal(REG_MOTOR_X_ENABLED,    1 if self.motors['X'].enabled else 0)
        self.user_regs.write_internal(REG_MOTOR_Y_ENABLED,    1 if self.motors['Y'].enabled else 0)
        self.user_regs.write_internal(REG_MOTOR_Z_ENABLED,    1 if self.motors['Z'].enabled else 0)
        self.user_regs.write_internal(REG_SPINDLE_ENABLED,    1 if self.spindle.enabled else 0)



class ParameterMap:
    """Manages parameter values"""

    def __init__(self):
        self.parameters: Dict[int, int] = {
            0:  10000,
            1:  10000,
            2:  8000,
            3:  5000,
            4:  5000,
            5:  4000,
            6:  struct.unpack('i', struct.pack('f', 2.0))[0],
            7:  struct.unpack('i', struct.pack('f', 0.1))[0],
            8:  struct.unpack('i', struct.pack('f', 0.5))[0],
            9:  struct.unpack('i', struct.pack('f', 2.0))[0],
            10: struct.unpack('i', struct.pack('f', 0.1))[0],
            11: struct.unpack('i', struct.pack('f', 0.5))[0],
            12: struct.unpack('i', struct.pack('f', 2.0))[0],
            13: struct.unpack('i', struct.pack('f', 0.1))[0],
            14: struct.unpack('i', struct.pack('f', 0.5))[0],
            15: struct.unpack('i', struct.pack('f', 200.0))[0],
            16: struct.unpack('i', struct.pack('f', 200.0))[0],
            17: struct.unpack('i', struct.pack('f', 400.0))[0],
            18: 24000,
            19: 10000,
            20: 20000,
            21: 2000,
            22: 0,
            23: 0,
            24: 0,
        }
        self.defaults = dict(self.parameters)

    def read(self, address: int) -> int:
        return self.parameters.get(address, 0)

    def write(self, address: int, value: int) -> bool:
        """Like dsSetParameter(): any value is stored at an address in range.
        The controller checks values where it uses them (see `usable`)."""
        if address < 0 or address > 24:
            return False
        self.parameters[address] = _clamp_i32(value)
        return True

    def usable(self, address: int) -> int:
        """The parameter as the controller uses it: a value it cannot use (a
        speed or acceleration of 0 or less, a gain that is not a finite
        non-negative float, or zero steps per mm) gives way to the default."""
        value = self.read(address)
        if 6 <= address <= 17:
            decoded = struct.unpack('<f', struct.pack('<i', value))[0]
            if not math.isfinite(decoded) or decoded < 0 or (address >= 15 and decoded == 0):
                return self.defaults[address]
        elif address <= 21 and value <= 0:
            return self.defaults[address]
        return value

    def get_mac_address(self) -> bytes:
        return bytes([0x02, 0x00, 0x00, 0x00, 0x00, 0x01])


def _clamp_i32(value: int) -> int:
    """Clamp value to signed 32-bit integer range"""
    return max(-2147483648, min(2147483647, value))


def _pack_response(status: int, address: int, value: int) -> bytes:
    """Pack an 8-byte response packet (protocol v0.2.2).
    status: signed i16, address: unsigned u16, value: signed i32."""
    return struct.pack('<hHi', status, address, value)


# Returned instead of a response by RESET_FIRMWARE: like a device built on
# the library, the emulator restarts before it can reply, and a TCP client
# loses its connection.
RESTART = object()


class DSHubEmulator:
    """Main emulator class"""

    def __init__(self, board_name: str = "DSHub Emulator", board_type: int = 1,
                 firmware_version: int = 0x0100, host: str = '127.0.0.1',
                 latency_ms: float = 0.0, drop_rate: float = 0.0,
                 seed: Optional[int] = None):
        # Listen address for TCP and UDP: 0.0.0.0 serves this machine and the
        # network, 127.0.0.1 this machine only.
        self.host = host
        # Fault injection for testing a host application: a delay before every
        # reply, and a chance of not replying at all (UDP only; over TCP a
        # missing reply is a stall, which the delay already models).
        self.latency = max(latency_ms, 0.0) / 1000.0
        self.drop_rate = min(max(drop_rate, 0.0), 1.0)
        self.random = random.Random(seed)
        self.board_name = board_name
        self.board_type = board_type
        self.firmware_version = firmware_version

        self.system_registers = SystemRegisterMap()
        self.user_registers = UserRegisterMap()
        self.parameters = ParameterMap()

        self.cnc_controller = CNCController(
            self.system_registers, self.user_registers, self.parameters)

        self.discovery_socket: Optional[socket.socket] = None
        self.tcp_socket: Optional[socket.socket] = None
        self.running = False
        # The library serves one TCP client at a time.
        self.tcp_client_active = threading.Event()
        self.total_packets_received = 0
        self.total_packets_sent = 0
        self.lock = threading.RLock()
        # Flash survives firmware reset within this process, but not process exit.
        self.flash_parameters = self.parameters.parameters.copy()

        print(f"DSHub Emulator initialized: {board_name}")
        print(f"Board Type: {board_type}, Firmware: 0x{firmware_version:04X}")

    def start(self):
        self.running = True
        threading.Thread(target=self._discovery_service, daemon=True).start()
        threading.Thread(target=self._tcp_service, daemon=True).start()
        threading.Thread(target=self._motion_update_thread, daemon=True).start()

        print(f"\nEmulator started successfully!")
        print(f"Discovery/UDP: port {DISCOVERY_PORT}")
        print(f"TCP Data:      port {DEFAULT_TCP_PORT}")
        if self.host in ('0.0.0.0', ''):
            print(f"Reachable at:  {', '.join(_local_addresses())} (and 127.0.0.1)")
            print("               The protocol has no authentication; use trusted networks only.")
        else:
            print(f"Reachable at:  {self.host} only")
        print(f"CNC Motion:    100Hz update rate")
        print(f"\nPress Ctrl+C to stop the emulator\n")

    def stop(self):
        self.running = False
        if self.discovery_socket:
            self.discovery_socket.close()
        if self.tcp_socket:
            self.tcp_socket.close()

    def _discovery_service(self):
        try:
            self.discovery_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.discovery_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.discovery_socket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            self.discovery_socket.bind(('' if self.host == '0.0.0.0' else self.host, DISCOVERY_PORT))
            self.discovery_socket.settimeout(1.0)
            print(f"[Discovery/UDP] Listening on UDP port {DISCOVERY_PORT}")

            while self.running:
                try:
                    # Like the library: one frame's worth of bytes per datagram;
                    # a 5-byte datagram is a discovery request (ignored if
                    # malformed), any other short one a packet size error.
                    data, addr = self.discovery_socket.recvfrom(1024)
                    data = data[:8]
                    if len(data) == 5:
                        magic, command = struct.unpack('<IB', data)
                        if magic == DS_DISCOVERY_MAGIC and command == DS_DISCOVERY_REQUEST:
                            print(f"[Discovery] Request from {addr[0]}:{addr[1]}")
                            self._send_discovery_response(addr)
                    elif len(data) == 8:
                        response = self._process_packet(data, 'UDP', addr)
                        if response is RESTART:
                            continue
                        if response and self.random.random() >= self.drop_rate:
                            if self.latency:
                                time.sleep(self.latency)
                            self.discovery_socket.sendto(response, addr)
                    elif data:
                        self.discovery_socket.sendto(self._size_error(), addr)
                except socket.timeout:
                    continue
                except Exception as e:
                    if self.running:
                        print(f"[Discovery/UDP] Error: {e}")
        except Exception as e:
            print(f"[Discovery/UDP] Failed to start: {e}")

    def _advertised_ip(self, requester: str) -> str:
        """The address a discovering client should connect to."""
        if self.host not in ('0.0.0.0', ''):
            return self.host
        # Listening everywhere: report the local address that routes to the
        # requester. Connecting a UDP socket sends nothing.
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
                probe.connect((requester, DISCOVERY_PORT))
                return probe.getsockname()[0]
        except OSError:
            return '127.0.0.1'

    def _send_discovery_response(self, addr: Tuple[str, int]):
        board_id = 1
        mac = self.parameters.get_mac_address()
        ip_bytes = socket.inet_aton(self._advertised_ip(addr[0]))
        ip_uint32 = struct.unpack('<I', ip_bytes)[0]

        # ds_discovery_response_t: 44 bytes, MAC before two reserved bytes,
        # then a 16-byte null-terminated name.
        response = struct.pack('<IBBHIIHH',
            DS_DISCOVERY_MAGIC, DS_DISCOVERY_RESPONSE,
            self.board_type, self.firmware_version,
            board_id, ip_uint32,
            DEFAULT_TCP_PORT, DEFAULT_UDP_PORT)
        response += mac + b'\x00\x00'
        response += self.board_name.encode('ascii')[:15].ljust(16, b'\x00')

        self.discovery_socket.sendto(response, addr)
        print(f"[Discovery] Sent response to {addr[0]}:{addr[1]}")

    def _tcp_service(self):
        try:
            self.tcp_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.tcp_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.tcp_socket.bind((self.host, DEFAULT_TCP_PORT))
            self.tcp_socket.listen(1)
            print(f"[TCP] Listening on {self.host}:{DEFAULT_TCP_PORT}")

            while self.running:
                try:
                    self.tcp_socket.settimeout(1.0)
                    client, addr = self.tcp_socket.accept()
                    # One client at a time, as the library serves them; a
                    # client that just left gets a moment to be torn down.
                    if self.tcp_client_active.is_set():
                        time.sleep(0.2)
                    if self.tcp_client_active.is_set():
                        print(f"[TCP] Refused {addr[0]}:{addr[1]}: another client is connected")
                        client.close()
                        continue
                    self.tcp_client_active.set()
                    print(f"[TCP] Client connected from {addr[0]}:{addr[1]}")
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
        """Serves one TCP client the way the library does: each receive takes
        at most one frame's bytes, and a short one is answered with
        PACKET_SIZE_ERROR and discarded, never joined with the next."""
        try:
            client.settimeout(1.0)
            while self.running:
                try:
                    data = client.recv(8)
                    if not data:
                        break
                    if len(data) < 8:
                        client.sendall(self._size_error())
                        continue
                    response = self._process_packet(data, 'TCP', addr)
                    if response is RESTART:
                        break
                    if response:
                        if self.latency:
                            time.sleep(self.latency)
                        client.sendall(response)
                except socket.timeout:
                    continue
                except Exception as e:
                    print(f"[TCP] Client error: {e}")
                    break
        finally:
            client.close()
            self.tcp_client_active.clear()
            print(f"[TCP] Client disconnected from {addr[0]}:{addr[1]}")

    def _size_error(self) -> bytes:
        """A PACKET_SIZE_ERROR reply. Its address is 0, as in datastream 0.3.3.1."""
        with self.lock:
            self.system_registers.increment_error_count()
        return _pack_response(STATUS_PACKET_SIZE_ERROR, 0, 0)

    def _motion_update_thread(self):
        dt = 0.01
        print(f"[MOTION] Motion control thread started (100Hz)")
        while self.running:
            start_time = time.time()
            with self.lock:
                self.cnc_controller.update(dt)
            elapsed = time.time() - start_time
            sleep_time = dt - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

    def _process_packet(self, data: bytes, interface: str,
                        addr: Tuple[str, int]) -> Optional[bytes]:
        with self.lock:
            return self._process_packet_locked(data, interface, addr)

    def _process_packet_locked(self, data: bytes, interface: str,
                               addr: Tuple[str, int]) -> Optional[bytes]:
        # Protocol v0.2.4: 8-byte packets with 16-bit type/address fields
        if len(data) != 8:
            return None

        with self.lock:
            self.system_registers.increment_packet_count()
            self.total_packets_received += 1

        try:
            command, address = struct.unpack('<HH', data[0:4])
            value = struct.unpack('<i', data[4:8])[0]
            ts = datetime.now().strftime('%H:%M:%S.%f')[:-3]

            expected_control = CONTROL_TCP_DATASTREAM if interface == 'TCP' else CONTROL_UDP_DATASTREAM
            if command in (CMD_SYS_COMMAND, CMD_WRITE_REGISTER, CMD_WRITE_PARAMETER) and (
                    self.system_registers.read(SYSREG_CONTROL_INTERFACE) != expected_control):
                self.system_registers.increment_error_count()
                return _pack_response(STATUS_CONTROL_ERROR, address, 0)
            maps = {CMD_READ_REGISTER: self.user_registers.registers,
                    CMD_READ_PARAMETER: self.parameters.parameters,
                    CMD_READ_SYSTEM_REGISTER: self.system_registers.registers}
            if command in maps and address not in maps[command]:
                self.system_registers.increment_error_count()
                return _pack_response(-4, address, 0)
            if command == CMD_SYS_COMMAND:
                # Library system commands (address=65000–65002)
                lib_cmd_names = {
                    CMD_SYS_READ_FLASH:     "READ_FLASH",
                    CMD_SYS_WRITE_FLASH:    "WRITE_FLASH",
                    CMD_SYS_RESET_FIRMWARE: "RESET_FIRMWARE",
                }
                # CNC user commands (address=0–25)
                cnc_cmd_names = {
                    CMD_ENABLE_ALL_MOTORS:  "ENABLE_ALL_MOTORS",
                    CMD_DISABLE_ALL_MOTORS: "DISABLE_ALL_MOTORS",
                    CMD_ENABLE_MOTOR_X:     "ENABLE_MOTOR_X",
                    CMD_ENABLE_MOTOR_Y:     "ENABLE_MOTOR_Y",
                    CMD_ENABLE_MOTOR_Z:     "ENABLE_MOTOR_Z",
                    CMD_DISABLE_MOTOR_X:    "DISABLE_MOTOR_X",
                    CMD_DISABLE_MOTOR_Y:    "DISABLE_MOTOR_Y",
                    CMD_DISABLE_MOTOR_Z:    "DISABLE_MOTOR_Z",
                    CMD_ENABLE_SPINDLE:     "ENABLE_SPINDLE",
                    CMD_DISABLE_SPINDLE:    "DISABLE_SPINDLE",
                    CMD_HOME_ALL:           "HOME_ALL",
                    CMD_HOME_X:             "HOME_X",
                    CMD_HOME_Y:             "HOME_Y",
                    CMD_HOME_Z:             "HOME_Z",
                    CMD_E_STOP:             "E_STOP",
                    CMD_RESET_E_STOP:       "RESET_E_STOP",
                    CMD_CLEAR_ERRORS:       "CLEAR_ERRORS",
                    CMD_JOG_X_POSITIVE:     "JOG_X+",
                    CMD_JOG_X_NEGATIVE:     "JOG_X-",
                    CMD_JOG_Y_POSITIVE:     "JOG_Y+",
                    CMD_JOG_Y_NEGATIVE:     "JOG_Y-",
                    CMD_JOG_Z_POSITIVE:     "JOG_Z+",
                    CMD_JOG_Z_NEGATIVE:     "JOG_Z-",
                }
                if address in lib_cmd_names:
                    cmd_name = lib_cmd_names[address]
                    print(f"[{interface}] {ts} SYS_COMMAND: {cmd_name} (value={value})")
                    if address == CMD_SYS_WRITE_FLASH:
                        self.flash_parameters = self.parameters.parameters.copy()
                    elif address == CMD_SYS_READ_FLASH:
                        self.parameters.parameters = self.flash_parameters.copy()
                    elif address == CMD_SYS_RESET_FIRMWARE:
                        self.parameters.parameters = self.flash_parameters.copy()
                        self.user_registers = UserRegisterMap()
                        self.cnc_controller = CNCController(
                            self.system_registers, self.user_registers, self.parameters)
                        self.system_registers.set_control_interface(CONTROL_UNDECIDED)
                        return RESTART
                    response = _pack_response(STATUS_SYS_COMMAND_OK, address, 0)
                elif address in cnc_cmd_names:
                    cmd_name = cnc_cmd_names[address]
                    print(f"[{interface}] {ts} SYS_COMMAND: {cmd_name} (value={value})")
                    with self.lock:
                        result = self.cnc_controller.handle_sys_command(address, value)
                    if result == 0:
                        response = _pack_response(STATUS_SYS_COMMAND_OK, address, 0)
                    else:
                        print(f"[{interface}] {ts} SYS_COMMAND {cmd_name} FAILED")
                        self.system_registers.increment_error_count()
                        response = _pack_response(-1, address, 0)
                else:
                    print(f"[{interface}] {ts} Unknown sys command address: {address}")
                    self.system_registers.increment_error_count()
                    response = _pack_response(-1, address, 0)

            elif command == CMD_READ_REGISTER:
                reg_value = self.user_registers.read(address)
                print(f"[{interface}] {ts} Read Register[{address}] = {reg_value}")
                response = _pack_response(STATUS_READ_REGISTER_OK, address, reg_value)

            elif command == CMD_WRITE_REGISTER:
                # Like dsSetRegister(), a writable register in range always
                # takes the value; firmware cannot refuse it with a status.
                # The controller decides what a setpoint does: a homing axis
                # ignores it and ends homed with its home value, and E-stop
                # reset replaces setpoints with the current positions.
                success = self.user_registers.write(address, value)
                if not success:
                    if address < USER_REG_READ_ONLY_COUNT:
                        print(f"[{interface}] {ts} Write Register[{address}] REJECTED (read-only)")
                        self.system_registers.increment_error_count()
                        response = _pack_response(STATUS_PERMISSION_ERROR, address, 0)
                    else:
                        print(f"[{interface}] {ts} Write Register[{address}] FAILED (unknown address)")
                        self.system_registers.increment_error_count()
                        response = _pack_response(-4, address, 0)  # ADDRESS_OUT_OF_RANGE
                else:
                    print(f"[{interface}] {ts} Write Register[{address}] = {value}")
                    reg_value = self.user_registers.read(address)
                    response = _pack_response(STATUS_WRITE_REGISTER_OK, address, reg_value)

            elif command == CMD_READ_PARAMETER:
                param_value = self.parameters.read(address)
                print(f"[{interface}] {ts} Read Parameter[{address}] = {param_value}")
                response = _pack_response(STATUS_READ_PARAMETER_OK, address, param_value)

            elif command == CMD_WRITE_PARAMETER:
                success = self.parameters.write(address, value)
                if not success:
                    print(f"[{interface}] {ts} Write Parameter[{address}] FAILED")
                    self.system_registers.increment_error_count()
                else:
                    print(f"[{interface}] {ts} Write Parameter[{address}] = {value}")
                param_value = self.parameters.read(address) if success else 0
                response = _pack_response(STATUS_WRITE_PARAMETER_OK if success else -4, address, param_value)

            elif command == CMD_TAKE_CONTROL:
                # Like the library: Control goes to the transport the request
                # arrived on; the value is ignored and there is no release.
                self.system_registers.set_control_interface(expected_control)
                print(f"[{interface}] {ts} Take Control -> {interface}_DATASTREAM")
                response = _pack_response(STATUS_CONTROL_OK, address, 0)

            elif command == CMD_READ_SYSTEM_REGISTER:
                sys_value = self.system_registers.read(address)
                print(f"[{interface}] {ts} Read SysReg[{address}] = {sys_value}")
                # The library answers system register reads with READ_REGISTER_OK.
                response = _pack_response(STATUS_READ_REGISTER_OK, address, sys_value)

            elif command == CMD_WRITE_SYSTEM_REGISTER:
                # System registers are always read-only from the protocol
                print(f"[{interface}] {ts} Write SysReg[{address}] REJECTED (PERMISSION_ERROR)")
                self.system_registers.increment_error_count()
                response = _pack_response(STATUS_PERMISSION_ERROR, address, 0)

            else:
                print(f"[{interface}] {ts} Unknown command type: {command}")
                self.system_registers.increment_error_count()
                return _pack_response(STATUS_INPUT_TYPE_ERROR, address, 0)

            with self.lock:
                self.total_packets_sent += 1

            return response

        except Exception as e:
            print(f"[{interface}] Packet processing error: {e}")
            self.system_registers.increment_error_count()
            return None

    def print_status(self):
        print("\n" + "="*60)
        print(f"DSHub Emulator Status - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*60)
        print(f"Board: {self.board_name}")
        print(f"Type: {self.board_type}, Firmware: 0x{self.firmware_version:04X}")
        print(f"\nPackets Received: {self.total_packets_received}")
        print(f"Packets Sent:     {self.total_packets_sent}")
        print(f"\nSystem Registers (cmd 6):")
        print(f"  [0] DS_PACKET_COUNT:   {self.system_registers.read(SYSREG_DS_PACKET_COUNT)}")
        print(f"  [1] DS_ERROR_COUNT:    {self.system_registers.read(SYSREG_DS_ERROR_COUNT)}")
        print(f"  [2] CONTROL_INTERFACE: {self.system_registers.read(SYSREG_CONTROL_INTERFACE)}")
        print(f"  [3] COUNTER_1HZ:       {self.system_registers.read(SYSREG_COUNTER_1HZ)}")
        print(f"\nUser Registers (cmd 1) — read-only section:")
        print(f"  [0] CONTROLLER_STATE:  {self.user_registers.read(REG_CONTROLLER_STATE)}")
        print(f"  [1] MOTOR_X_ENCODER:   {self.user_registers.read(REG_MOTOR_X_ENCODER)}")
        print(f"  [2] MOTOR_Y_ENCODER:   {self.user_registers.read(REG_MOTOR_Y_ENCODER)}")
        print(f"  [3] MOTOR_Z_ENCODER:   {self.user_registers.read(REG_MOTOR_Z_ENCODER)}")
        print(f"\nUser Registers (cmd 1/2) — read-write section:")
        print(f"  [10] MOTOR_X_SETPOINT: {self.user_registers.read(REG_MOTOR_X_SETPOINT)}")
        print(f"  [11] MOTOR_Y_SETPOINT: {self.user_registers.read(REG_MOTOR_Y_SETPOINT)}")
        print(f"  [12] MOTOR_Z_SETPOINT: {self.user_registers.read(REG_MOTOR_Z_SETPOINT)}")
        print(f"  [14] JOG_DISTANCE:     {self.user_registers.read(REG_JOG_DISTANCE)}")
        print("="*60 + "\n")


def _local_addresses() -> List[str]:
    """This machine's IPv4 addresses other machines can reach, best effort."""
    found = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.append(info[4][0])
    except OSError:
        pass
    try:
        # Connecting a UDP socket sends nothing; it only picks the outgoing interface.
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(('192.0.2.1', DISCOVERY_PORT))
            found.append(probe.getsockname()[0])
    except OSError:
        pass
    addresses = sorted({a for a in found if not a.startswith('127.')})
    return addresses or ['no network address found']


def main():
    parser = argparse.ArgumentParser(description="DSHub board emulator")
    parser.add_argument(
        '--host', default='0.0.0.0',
        help="listen address (default 0.0.0.0: this machine and the network)")
    parser.add_argument(
        '--local', action='store_const', const='127.0.0.1', dest='host',
        help="listen on 127.0.0.1 only (same as --host 127.0.0.1)")
    parser.add_argument(
        '--latency-ms', type=float, default=0.0,
        help="delay every reply by this many milliseconds (default 0)")
    parser.add_argument(
        '--drop-rate', type=float, default=0.0,
        help="probability of not answering a UDP request, 0 to 1 (default 0)")
    parser.add_argument(
        '--seed', type=int, default=None,
        help="seed for --drop-rate, for repeatable runs")
    args = parser.parse_args()

    print("\n" + "="*60)
    print("DSHub Board Emulator")
    print("="*60)
    print("Pure Python emulator with no external dependencies")
    print("Emulates register/parameter read/write and auto-discovery")
    print("Protocol v0.2.4: 8-byte packets, 16-bit type/address fields")
    print("="*60 + "\n")

    emulator = DSHubEmulator(
        board_name="Python Emulator",
        board_type=1,
        firmware_version=0x0200,
        host=args.host,
        latency_ms=args.latency_ms,
        drop_rate=args.drop_rate,
        seed=args.seed,
    )
    if args.latency_ms or args.drop_rate:
        print(f"Fault injection: {args.latency_ms:g} ms latency, "
              f"{args.drop_rate:.0%} of UDP replies dropped")

    try:
        emulator.start()
        last_status = time.time()
        while True:
            time.sleep(1)
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
