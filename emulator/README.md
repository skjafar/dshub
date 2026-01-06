# DeviceMon Board Emulator

A comprehensive Python emulator for testing DeviceMon web applications without physical hardware.

## Features

- **Full Protocol Support**
  - UDP auto-discovery protocol
  - TCP data stream communication
  - UDP data stream communication
  - Register read/write operations
  - Parameter read/write operations
  - Take Control command

- **Realistic Behavior**
  - Auto-incrementing 1Hz counter
  - Packet and error counters
  - Control interface state management
  - Read-only and read-write register enforcement
  - Proper protocol response formatting

- **Zero Dependencies**
  - Uses only Python standard library
  - No external packages required
  - Compatible with Python 3.6+

## Quick Start

### 1. Start the Emulator

```bash
cd emulator
python3 devicemon_emulator.py
```

The emulator will start and listen on:
- **UDP Discovery**: Port 2011
- **TCP Data**: Port 2009
- **UDP Data**: Port 2011

### 2. Connect from DeviceMon Web

1. Start your DeviceMon web application:
   ```bash
   cd ..
   ./start.sh
   ```

2. Open your browser to http://localhost:3000

3. Click **"Scan for Devices"** - the emulator will be discovered as "Python Emulator"

4. Click **Connect** (TCP or UDP)

5. Click **"Take Control"**

6. Start reading/writing registers and parameters!

## Emulated Registers

### Read-Only Registers (Addresses 0-3)

| Address | Name | Type | Description |
|---------|------|------|-------------|
| 0 | DS_PACKET_COUNT | uint32_t | Total packets received (auto-increments) |
| 1 | DS_ERROR_COUNT | uint32_t | Total errors (increments on invalid operations) |
| 2 | CONTROL_INTERFACE | uint32_t | Current control interface state |
| 3 | COUNTER_1HZ | uint32_t | Seconds since emulator started (auto-increments) |

**COUNTER_1HZ** increments every second automatically - perfect for testing plotting!

## Emulated Parameters

| Address | Name | Type | Description |
|---------|------|------|-------------|
| 0 | DEVICE_ID | uint32_t | Device ID (default: 12345) |
| 1 | USES_DHCP | uint32_t | DHCP enabled flag |
| 2-5 | IP_ADDR[4] | uint32_t | IP address bytes (127.0.0.1) |
| 6-9 | GATEWAY_ADDR[4] | uint32_t | Gateway address |
| 10-13 | DNS_SERVER_ADDR[4] | uint32_t | DNS server address |
| 14-17 | NET_MASK[4] | uint32_t | Network mask |
| 18-23 | MAC_ADDR[6] | hex | MAC address (02:00:DE:AD:BE:EF) |
| 24 | PARAMETERS_SETS_IN_FLASH | uint32_t | Parameter sets (read-only) |
| 25 | PARAMETERS_INITIALIZATION_MARKER | hex | Init marker (read-only) |

**Note**: Network settings (IP, Gateway, etc.) have no effect in the emulator - it always runs on localhost.

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
- `1` - Read Register
- `2` - Write Register
- `3` - Read Parameter
- `4` - Write Parameter
- `5` - Take Control

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

### Test Read-Only Protection

1. Connect to emulator
2. Take control
3. Try to write to register 0, 1, or 3
4. Observe that the write is rejected
5. Check error count (register 1) - it increments on errors

### Test Control Interface

1. Connect via TCP
2. Take control - observe CONTROL_INTERFACE (register 2) becomes 1
3. Disconnect
4. Connect via UDP
5. Take control - observe CONTROL_INTERFACE becomes 2

### Test Parameter Persistence

1. Connect to emulator
2. Take control
3. Write to parameter 0 (DEVICE_ID)
4. Read it back - value is stored
5. Network parameters (IP, etc.) can be written but don't affect emulator behavior

## Customization

You can customize the emulator when starting it:

```python
emulator = DeviceMonEmulator(
    board_name="My Custom Board",  # Changes discovery name
    board_type=2,                  # Changes board type ID
    firmware_version=0x0200        # Changes firmware version
)
```

## Command Line Options

Run the emulator directly:

```bash
python3 devicemon_emulator.py
```

Stop with `Ctrl+C`.

The emulator prints status every 10 seconds showing:
- Total packets received/sent
- Current register values
- Statistics

## Troubleshooting

### Emulator not discovered

1. Check firewall settings - allow UDP port 2011
2. Ensure no other DeviceMon emulator or board is running
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
devicemon_emulator.py
├── RegisterMap        # Manages register values and auto-increment
├── ParameterMap       # Manages parameter values
└── DeviceMonEmulator  # Main emulator with 3 services:
    ├── Discovery Service (UDP port 2011)
    ├── TCP Data Service  (TCP port 2009)
    └── UDP Data Service  (UDP port 2011)
```

All services run in separate threads for concurrent operation.

## Limitations

- Network parameter writes (IP, Gateway, DNS, etc.) are accepted but have no effect
- Emulator always runs on localhost (127.0.0.1)
- No flash memory persistence - values reset when emulator restarts
- Single client at a time (TCP) / unlimited concurrent (UDP)

## Development

The emulator uses only Python standard library modules:
- `socket` - Network communication
- `threading` - Concurrent services
- `struct` - Binary packet packing/unpacking
- `time` - Timestamps and delays
- `datetime` - Human-readable timestamps

No external dependencies required!

## License

Part of the DeviceMon Web project.
