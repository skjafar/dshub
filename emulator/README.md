# DSHub Board Emulator

A comprehensive Python emulator for testing DSHub web applications without physical hardware.

## Features

- **Full Protocol Support**
  - UDP auto-discovery protocol
  - TCP data stream communication
  - UDP data stream communication
  - Register read/write operations
  - Parameter read/write operations
  - Take Control command
  - SYS_COMMAND protocol for system operations

- **CNC Motor Controller Emulation**
  - 3-axis servo motors (X, Y, Z) with encoder feedback
  - High-speed spindle motor control
  - Critically damped PID motion control
  - State machine (IDLE, HOMING, READY, RUNNING, PAUSED, ERROR, E_STOP)
  - Motor enable/disable commands
  - Jog functionality with configurable step distance
  - Realistic motion physics with velocity and acceleration limits
  - Real-time encoder position updates at 100Hz

- **Realistic Behavior**
  - Auto-incrementing 1Hz counter
  - Packet and error counters
  - Control interface state management
  - Read-only and read-write register enforcement
  - Proper protocol response formatting
  - Smooth motor motion simulation

- **Zero Dependencies**
  - Uses only Python standard library
  - No external packages required
  - Compatible with Python 3.6+

## Quick Start

### 1. Start the Emulator

```bash
cd emulator
python3 dshub_emulator.py
```

The emulator will start and listen on:
- **UDP Discovery**: Port 2011
- **TCP Data**: Port 2009
- **UDP Data**: Port 2011

### 2. Connect from DSHub

1. Start your DSHub web application:
   ```bash
   cd ..
   ./start.sh
   ```

2. Open your browser to http://localhost:3000

3. Click **"Scan for Devices"** - the emulator will be discovered as "Python Emulator"

4. Click **Connect** (TCP or UDP)

5. Click **"Take Control"**

6. Start reading/writing registers and parameters!

## CNC Motor Controller Profile

The emulator now includes a **CNC Motor Controller** profile emulating a 3-axis milling machine. Load this profile in the web interface to access CNC-specific registers and parameters.

### Controller States

| Value | State | Description |
|-------|-------|-------------|
| 0 | IDLE | System powered on, motors disabled |
| 1 | HOMING | Executing homing sequence |
| 2 | READY | Homed and ready for operations |
| 3 | RUNNING | Executing motion commands |
| 4 | PAUSED | Motion paused (reserved for future use) |
| 5 | ERROR | Error state, requires reset |
| 6 | E_STOP | Emergency stop engaged |

## Emulated Registers

### Standard Registers (Addresses 0-3, Read-Only)

| Address | Name | Type | Description |
|---------|------|------|-------------|
| 0 | DS_PACKET_COUNT | uint32_t | Total packets received (auto-increments) |
| 1 | DS_ERROR_COUNT | uint32_t | Total errors (increments on invalid operations) |
| 2 | CONTROL_INTERFACE | uint32_t | Current control interface state |
| 3 | COUNTER_1HZ | uint32_t | Seconds since emulator started (auto-increments) |

**COUNTER_1HZ** increments every second automatically - perfect for testing plotting!

### CNC Registers (Addresses 4-18)

**Read-Only CNC Status (4-13)**:

| Address | Name | Type | Description |
|---------|------|------|-------------|
| 4 | CONTROLLER_STATE | uint32_t | Current controller state (see states above) |
| 5 | MOTOR_X_ENCODER | int32_t | X-axis encoder position (counts) |
| 6 | MOTOR_Y_ENCODER | int32_t | Y-axis encoder position (counts) |
| 7 | MOTOR_Z_ENCODER | int32_t | Z-axis encoder position (counts) |
| 8 | SPINDLE_RPM | uint32_t | Current spindle speed (RPM) |
| 9 | SPINDLE_LOAD | uint32_t | Spindle load percentage (0-100) |
| 10 | MOTOR_X_ENABLED | uint32_t | X-axis motor enable status (0=disabled, 1=enabled) |
| 11 | MOTOR_Y_ENABLED | uint32_t | Y-axis motor enable status |
| 12 | MOTOR_Z_ENABLED | uint32_t | Z-axis motor enable status |
| 13 | SPINDLE_ENABLED | uint32_t | Spindle enable status |

**Read-Write CNC Setpoints (14-18)**:

| Address | Name | Type | Description |
|---------|------|------|-------------|
| 14 | MOTOR_X_SETPOINT | int32_t | X-axis target position (counts) |
| 15 | MOTOR_Y_SETPOINT | int32_t | Y-axis target position (counts) |
| 16 | MOTOR_Z_SETPOINT | int32_t | Z-axis target position (counts) |
| 17 | SPINDLE_SPEED_SETPOINT | uint32_t | Spindle target speed (RPM) |
| 18 | JOG_DISTANCE | int32_t | Jog step size (counts, default: 100) |

## Emulated Parameters

### CNC Motor Controller Parameters (Addresses 0-24)

All parameters are read-write and affect the motion control behavior:

**Motor Maximum Velocities** (encoder counts/sec):
| Address | Name | Default |
|---------|------|---------|
| 0 | MOTOR_X_MAX_VEL | 10000 |
| 1 | MOTOR_Y_MAX_VEL | 10000 |
| 2 | MOTOR_Z_MAX_VEL | 8000 |

**Motor Maximum Accelerations** (encoder counts/sec²):
| Address | Name | Default |
|---------|------|---------|
| 3 | MOTOR_X_MAX_ACCEL | 5000 |
| 4 | MOTOR_Y_MAX_ACCEL | 5000 |
| 5 | MOTOR_Z_MAX_ACCEL | 4000 |

**X-Axis PID Gains** (float):
| Address | Name | Default |
|---------|------|---------|
| 6 | MOTOR_X_KP | 2.0 |
| 7 | MOTOR_X_KI | 0.1 |
| 8 | MOTOR_X_KD | 0.5 |

**Y-Axis PID Gains** (float):
| Address | Name | Default |
|---------|------|---------|
| 9 | MOTOR_Y_KP | 2.0 |
| 10 | MOTOR_Y_KI | 0.1 |
| 11 | MOTOR_Y_KD | 0.5 |

**Z-Axis PID Gains** (float):
| Address | Name | Default |
|---------|------|---------|
| 12 | MOTOR_Z_KP | 2.0 |
| 13 | MOTOR_Z_KI | 0.1 |
| 14 | MOTOR_Z_KD | 0.5 |

**Motor Scaling Factors** (encoder counts/mm, float):
| Address | Name | Default |
|---------|------|---------|
| 15 | MOTOR_X_STEPS_PER_MM | 200.0 |
| 16 | MOTOR_Y_STEPS_PER_MM | 200.0 |
| 17 | MOTOR_Z_STEPS_PER_MM | 200.0 |

**Spindle & System Parameters**:
| Address | Name | Type | Default | Description |
|---------|------|------|---------|-------------|
| 18 | SPINDLE_MAX_RPM | uint32_t | 24000 | Maximum spindle speed |
| 19 | SPINDLE_ACCEL_RPM_PER_SEC | uint32_t | 5000 | Spindle acceleration rate |
| 20 | E_STOP_DECEL | uint32_t | 10000 | Emergency stop deceleration |
| 21 | HOMING_SPEED | uint32_t | 2000 | Homing speed (counts/sec) |

**Home Positions** (encoder counts, int32_t):
| Address | Name | Default |
|---------|------|---------|
| 22 | HOME_X_POSITION | 0 |
| 23 | HOME_Y_POSITION | 0 |
| 24 | HOME_Z_POSITION | 0 |

**Note**: Float parameters are stored as int32 bit patterns. The emulator automatically handles conversion.

## Protocol Details

### Discovery Protocol

**Request** (5 bytes):
```
[Magic: 0xDEADBEEF (4 bytes, LE)] [Command: 0x01 (1 byte)]
```

**Response** (variable length):
```
[Magic: 0xDEADBEEF (4 bytes, LE)]
[Command: 0x02 (1 byte)]
[Board Type (1 byte)]
[Firmware Version (2 bytes, LE)]
[Board ID (4 bytes, LE)]
[IP Address (4 bytes, LE)]
[TCP Port (2 bytes, LE)]
[UDP Port (2 bytes, LE)]
[Reserved (2 bytes)]
[MAC Address (6 bytes)]
[Board Name (null-terminated string)]
```

### Data Protocol

**Request** (6 bytes):
```
[Command (1 byte)] [Address (1 byte)] [Value (4 bytes, signed LE)]
```

**Response** (6 bytes):
```
[Command (1 byte)] [Address (1 byte)] [Value (4 bytes, signed LE)]
```

**Commands**:
- `0` - SYS_COMMAND (system operations)
- `1` - Read Register
- `2` - Write Register
- `3` - Read Parameter
- `4` - Write Parameter
- `5` - Take Control

### SYS_COMMAND Protocol

**SYS_COMMAND Request** (6 bytes):
```
[Command: 0x00 (1 byte)] [SysCommand (1 byte)] [Value (4 bytes, signed LE)]
```

The **Address** field contains the system command code, not a register address.

**SYS_COMMAND Response** (6 bytes):
```
[Status (1 byte)] [SysCommand (1 byte)] [Result (4 bytes, signed LE)]
```

- Status: `0` = Success, `-1` (0xFF) = Error
- Result: Command-specific return value

### CNC System Commands

**Motor Enable/Disable**:
- `200` - Enable all motors
- `201` - Disable all motors
- `202` - Enable X-axis motor
- `203` - Enable Y-axis motor
- `204` - Enable Z-axis motor
- `205` - Disable X-axis motor
- `206` - Disable Y-axis motor
- `207` - Disable Z-axis motor
- `208` - Enable spindle
- `209` - Disable spindle

**Homing Commands**:
- `210` - Home all axes
- `211` - Home X-axis only
- `212` - Home Y-axis only
- `213` - Home Z-axis only

**System Control**:
- `214` - Emergency stop (E_STOP)
- `215` - Reset emergency stop
- `216` - Clear error state

**Jog Commands**:
- `220` - Jog X-axis positive (by JOG_DISTANCE)
- `221` - Jog X-axis negative
- `222` - Jog Y-axis positive
- `223` - Jog Y-axis negative
- `224` - Jog Z-axis positive
- `225` - Jog Z-axis negative

**Example**: To enable all motors, send:
```
[0x00] [0xC8] [0x00 0x00 0x00 0x00]
 ^CMD   ^200   ^Value (0)
```

## Testing Scenarios

### Test Auto-Incrementing Counter

1. Connect to emulator
2. Take control
3. Go to Register Read panel
4. Read register 3 (COUNTER_1HZ) repeatedly
5. Watch the value increment every second

### Test Plotting

1. Connect to emulator
2. Take control
3. Go to Plotter panel
4. Add register 3 (COUNTER_1HZ)
5. Set poll interval to 250ms
6. Start plotting
7. Watch the counter increment in real-time on the chart

### Test CNC Motor Control

**Load CNC Profile**:
1. Go to Settings
2. Select "CNC Motor Controller" profile
3. Observe CNC-specific registers and parameters

**Test Motor Motion**:
1. Connect and take control
2. Send SYS_COMMAND 200 (Enable all motors)
3. Write to MOTOR_X_SETPOINT (register 14) = 1000
4. Read MOTOR_X_ENCODER (register 5) repeatedly
5. Watch the encoder count smoothly approach 1000
6. Observe critically damped motion (no overshoot)

**Test Jog Functionality**:
1. Write JOG_DISTANCE (register 18) = 500
2. Send SYS_COMMAND 220 (Jog X positive)
3. Observe MOTOR_X_SETPOINT increment by 500
4. Watch encoder follow to new position

**Test Homing Sequence**:
1. Send SYS_COMMAND 210 (Home all axes)
2. Read CONTROLLER_STATE (register 4)
3. Observe state change: IDLE(0) → HOMING(1) → READY(2)
4. Check encoder positions match HOME_X/Y/Z_POSITION parameters

**Test Spindle Control**:
1. Send SYS_COMMAND 208 (Enable spindle)
2. Write SPINDLE_SPEED_SETPOINT (register 17) = 12000
3. Read SPINDLE_RPM (register 8) repeatedly
4. Watch RPM ramp up smoothly (respects SPINDLE_ACCEL_RPM_PER_SEC)
5. Read SPINDLE_LOAD (register 9) - varies 30-70% when running

**Test Emergency Stop**:
1. Set motors in motion with high setpoints
2. Send SYS_COMMAND 214 (E_STOP)
3. Observe CONTROLLER_STATE → E_STOP(6)
4. Watch motors decelerate rapidly
5. Send SYS_COMMAND 215 (Reset E_STOP) to recover

**Test PID Tuning**:
1. Write MOTOR_X_KP (parameter 6) with different values
2. Set a new MOTOR_X_SETPOINT
3. Observe different motion characteristics
4. Higher Kp = faster response, lower Kp = slower

### Test Read-Only Protection

1. Connect to emulator
2. Take control
3. Try to write to register 0, 1, or 3-13 (read-only)
4. Observe that the write is rejected
5. Check error count (register 1) - it increments on errors

### Test Control Interface

1. Connect via TCP
2. Take control - observe CONTROL_INTERFACE (register 2) becomes 1
3. Disconnect
4. Connect via UDP
5. Take control - observe CONTROL_INTERFACE becomes 2

## Customization

You can customize the emulator when starting it:

```python
emulator = DSHubEmulator(
    board_name="My Custom Board",  # Changes discovery name
    board_type=2,                  # Changes board type ID
    firmware_version=0x0200        # Changes firmware version
)
```

## Command Line Options

Run the emulator directly:

```bash
python3 dshub_emulator.py
```

Stop with `Ctrl+C`.

The emulator prints status every 10 seconds showing:
- Total packets received/sent
- Current register values
- Statistics

## Troubleshooting

### Emulator not discovered

1. Check firewall settings - allow UDP port 2011
2. Ensure no other DSHub emulator or board is running
3. Check the emulator console for "[Discovery] Request" messages

### Cannot connect

1. Verify emulator is running (check console output)
2. Ensure ports 2009 (TCP) and 2011 (UDP) are not in use
3. Try both TCP and UDP interfaces

### Register/Parameter operations fail

1. Click "Take Control" first - required for data operations
2. Check emulator console for error messages
3. Verify you're not trying to write to read-only registers (0, 1, 3)

## Architecture

```
dshub_emulator.py
├── MotorAxis          # Servo motor with critically damped PID
├── SpindleController  # High-speed spindle emulation
├── CNCController      # State machine and motion coordination
├── RegisterMap        # CNC registers (0-18)
├── ParameterMap       # CNC parameters (0-24)
└── DSHubEmulator  # Main emulator with 4 services:
    ├── Discovery Service (UDP port 2011)
    ├── TCP Data Service  (TCP port 2009)
    ├── UDP Data Service  (UDP port 2011)
    └── Motion Update     (100Hz motion control loop)
```

All services run in separate threads for concurrent operation. The motion control thread updates motor positions, velocities, and PID calculations at 100Hz (10ms intervals) for smooth, realistic motion simulation.

## Limitations

- Emulator always runs on localhost (127.0.0.1)
- No flash memory persistence - parameter values reset when emulator restarts
- Single client at a time (TCP) / unlimited concurrent (UDP)
- CNC motors have no physical travel limits (encoders can count infinitely)
- Spindle load is simulated randomly (30-70%) rather than modeling actual cutting forces

## Development

The emulator uses only Python standard library modules:
- `socket` - Network communication
- `threading` - Concurrent services
- `struct` - Binary packet packing/unpacking
- `time` - Timestamps and delays
- `datetime` - Human-readable timestamps

No external dependencies required!

## License

Part of the DSHub project.
