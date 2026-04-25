# DSHub Wire Protocol

Protocol version **v0.2.2** (8-byte data frames, `u16` command and address fields).

This document is the source of truth for the wire format spoken by DSHub, the datastream firmware library, and the Python emulator. The Rust constants live in [src-tauri/src/types.rs](src-tauri/src/types.rs#L160-L187); the Python constants live in [emulator/dshub_emulator.py](emulator/dshub_emulator.py).

All multi-byte fields are **little-endian** unless stated otherwise.

---

## Transports

| Transport | Port | Role |
|-----------|------|------|
| UDP | 2011 | Discovery (broadcast) and data |
| TCP | 2009 | Data (connection-oriented, reliable) |

Discovery is UDP-only. Data can be exchanged over either transport after discovery; the device reports both ports in its discovery response.

---

## Discovery

### Request (5 bytes, UDP broadcast → port 2011)

```
Offset  Size  Field
  0      4    Magic       0xDEADBEEF (u32 LE)
  4      1    Command     0x01 (discovery request)
```

### Response (32+ bytes, unicast from device)

```
Offset  Size  Field
  0      4    Magic                    0xDEADBEEF (u32 LE)
  4      1    Command                  0x02 (discovery response)
  5      1    Board Type               device class ID
  6      2    Firmware Version         u16 LE
  8      4    Board ID (device ID)     u32 LE
 12      4    IP Address               4 bytes, LE (reverse dotted-quad)
 16      2    TCP Data Port            u16 LE
 18      2    UDP Data Port            u16 LE
 20      2    Reserved                 zero
 22      6    MAC Address              6 raw bytes
 28     ...   Board Name               null-terminated ASCII
```

The host broadcasts the request on every non-loopback IPv4 interface. Devices reply directly; the host collects responses for 5 seconds.

---

## Data Frames

Both request and response are **8 bytes**. All integer fields are little-endian.

### Request (host → device)

```
Offset  Size  Field            Type
  0      2    Type             u16   — operation code (see table below)
  2      2    Address          u16   — register / parameter address, or sub-command
  4      4    Value            i32   — write payload, ignored on reads
```

### Response (device → host)

```
Offset  Size  Field            Type
  0      2    Status           i16   — positive = success code, negative = error
  2      2    Address          u16   — echoes the request address
  4      4    Value            i32   — read payload on reads, zero on writes
```

### Operation Types

| Type | Name | Description |
|------|------|-------------|
| 0 | `SYS_COMMAND` | System command; the `Address` field carries the sub-command code |
| 1 | `READ_REGISTER` | Read user register at `Address` |
| 2 | `WRITE_REGISTER` | Write `Value` to user register at `Address` |
| 3 | `READ_PARAMETER` | Read parameter at `Address` |
| 4 | `WRITE_PARAMETER` | Write `Value` to parameter at `Address` |
| 5 | `TAKE_CONTROL` | Claim the device's control interface. Required before reads/writes. |
| 6 | `READ_SYSTEM_REGISTER` | Read library-managed system register at `Address` |
| 7 | `WRITE_SYSTEM_REGISTER` | Always rejected with `PERMISSION_ERROR`; system registers are read-only from the wire |

### Status Codes

Positive values echo the successful operation code; negative values are errors.

| Status | Meaning |
|--------|---------|
|  0 | `SYS_COMMAND_OK` |
|  1 | `READ_REGISTER_OK` |
|  2 | `WRITE_REGISTER_OK` |
|  3 | `READ_PARAMETER_OK` |
|  4 | `WRITE_PARAMETER_OK` |
|  5 | `CONTROL_OK` |
|  6 | `READ_SYS_REG_OK` |
| -5 | `PERMISSION_ERROR` — e.g. writing to a read-only register or `WRITE_SYSTEM_REGISTER` |

---

## System Registers (Type 6)

Library-managed, read-only over the wire. Address space is small and well-known:

| Address | Name | Description |
|---------|------|-------------|
| 0 | `DS_PACKET_COUNT` | Total packets received by the device |
| 1 | `DS_ERROR_COUNT` | Total protocol errors |
| 2 | `CONTROL_INTERFACE` | Currently active control interface (see below) |
| 3 | `COUNTER_1HZ` | Seconds since firmware boot — useful for liveness checks |

### Control Interface Values (register 2)

| Value | Interface |
|-------|-----------|
| 0 | `UNDECIDED` |
| 1 | `TCP_DATASTREAM` |
| 2 | `UDP_DATASTREAM` |
| 101 | `TCP_CLI` |
| 102 | `USB` |

DSHub reads `CONTROL_INTERFACE` once per second as a heartbeat to detect silent device loss.

---

## SYS_COMMAND (Type 0)

`SYS_COMMAND` frames carry their sub-command in the `Address` field rather than a register address. This splits the 16-bit address space into two ranges:

### Library System Commands (0xFDE8–0xFFFF, i.e. 65000–65535)

Reserved for the datastream library itself.

| Address | Name |
|---------|------|
| 65000 | `SYS_READ_FLASH` |
| 65001 | `SYS_WRITE_FLASH` |
| 65002 | `SYS_RESET_FIRMWARE` |

### Application System Commands (0–64999)

Free for the firmware to define. The emulator exposes a CNC-motor-controller catalog:

**Motor enables (0–9):**

| Address | Command |
|---------|---------|
| 0 | Enable all motors |
| 1 | Disable all motors |
| 2–4 | Enable motor X / Y / Z |
| 5–7 | Disable motor X / Y / Z |
| 8 | Enable spindle |
| 9 | Disable spindle |

**State control (10–16):**

| Address | Command |
|---------|---------|
| 10 | Home all axes |
| 11–13 | Home X / Y / Z only |
| 14 | Emergency stop |
| 15 | Reset E-stop |
| 16 | Clear error state |

**Jog (20–25):**

| Address | Command |
|---------|---------|
| 20 / 21 | Jog X positive / negative by `JOG_DISTANCE` |
| 22 / 23 | Jog Y positive / negative |
| 24 / 25 | Jog Z positive / negative |

A successful system command returns `status=0` (`SYS_COMMAND_OK`); the response `Value` field is command-specific (often zero).

---

## Connection Lifecycle

1. **Discover** — UDP broadcast. Collect responses for 5 s.
2. **Connect** — TCP `connect()` to port 2009, or bind a local UDP socket for port 2011.
3. **Take Control** — send `TAKE_CONTROL` (type 5). The device rejects reads/writes before this step.
4. **Read / Write** — any of types 1–4 or 6.
5. **Heartbeat** — poll `CONTROL_INTERFACE` (type 6, address 2) every 1 s to detect device loss.
6. **Disconnect** — close the TCP socket, or simply stop sending UDP. The device returns to `UNDECIDED` control state after a timeout.

DSHub runs all data I/O through a single MPSC channel per connection, guaranteeing strict request/response ordering — multiple in-flight requests never race on the same byte stream.

---

## Conventions

### Float-as-`i32` bit-cast

The 32-bit `Value` field carries IEEE 754 `float` values by bit-cast, not numeric conversion. A register or parameter declared `float` in a map file is read as an `i32` on the wire and re-interpreted as `float` on the host via type punning (`*reinterpret_cast<float*>(&i32)` semantics). Writing follows the inverse.

The reference implementation lives in [client/src/utils/floatConversion.ts](client/src/utils/floatConversion.ts) and `struct.pack('<i', ...)` / `struct.unpack('<f', ...)` in the emulator.

### Map Files

Register and parameter *names* are defined in plain-text map files loaded at runtime — not baked into the protocol. See [client/public/maps/](client/public/maps/) for examples and the [QUICK_START.md](QUICK_START.md#map-profiles) for the grammar.

The `READ/WRITE` boundary marker in `registers.map` partitions user registers into a read-only prefix and a read-write suffix. Writes to read-only addresses return `PERMISSION_ERROR`.

### Endianness

Every multi-byte field on the wire is **little-endian**. This includes IP addresses in the discovery response (reverse of the dotted-quad reading order).

---

## Reference

- Rust constants: [src-tauri/src/types.rs](src-tauri/src/types.rs#L160-L187)
- Python constants + full CNC catalog: [emulator/dshub_emulator.py](emulator/dshub_emulator.py)
- TCP/UDP communicator: [src-tauri/src/communicator.rs](src-tauri/src/communicator.rs)
- Discovery scanner: [src-tauri/src/scanner.rs](src-tauri/src/scanner.rs)
- Emulator guide with SYS_COMMAND examples and test scenarios: [emulator/README.md](emulator/README.md)
