# DSHub Wire Protocol

Protocol version **v0.2.4**, as implemented by the datastream firmware library v0.2.4.1. The library's version has four parts: the first three match the DSHub release that speaks the same protocol, and the fourth counts library-only changes that need no DSHub update.

This document describes what devices running the datastream library actually send and accept. It was written from the library sources (`datastream.h`, `datastream.c`, `dsRegisters.c`, `dsParameters.c`, `dsTCP.c`, `dsUDP.c`, `ds_default_config.h`). DSHub and the Python emulator follow it; [Compatibility notes](#compatibility-notes) lists firmware requirements and older library defects.

All multi-byte fields are **little-endian** unless stated otherwise.

---

## Transports

| Transport | Default port | Role |
|-----------|--------------|------|
| UDP | 2011 (`DS_UDP_PORT`) | Discovery and data, on the same socket |
| TCP | 2009 (`DS_TCP_PORT`) | Data |
| TCP | 2013 (`DS_CLI_PORT`) | Optional text CLI (`DS_CLI_ENABLE`, off by default); not used by DSHub |

Ports are build-time settings; the device reports its TCP and UDP data ports in its discovery response.

**TCP** accepts **one client at a time**. The device reads exactly one frame per `recv()` call and does not reassemble frames: a read that returns fewer bytes than a frame is answered with `PACKET_SIZE_ERROR` and those bytes are discarded. Hosts must therefore send each request as one complete frame (DSHub sets `TCP_NODELAY` and writes whole frames) and wait for its response before sending the next. When the client disconnects, the device closes the socket and listens again.

**UDP** answers each datagram to the address and port it came from. A datagram is classified by its size:

| Datagram size | Handling |
|---------------|----------|
| Frame size (8 bytes, or 9 with CRC) | Data frame |
| 5 bytes | Discovery request; ignored without reply if the magic or command byte is wrong |
| Anything else | `PACKET_SIZE_ERROR` reply. The device reads at most one frame's worth of bytes, so a longer datagram is truncated and processed as a data frame. |

---

## Discovery

Enabled by `DS_AUTO_DETECTION_ENABLE` (on by default).

### Request (5 bytes, UDP broadcast → UDP data port)

```
Offset  Size  Field
  0      4    Magic       0xDEADBEEF (u32 LE, DS_DISCOVERY_MAGIC)
  4      1    Command     0x01 (DS_DISCOVERY_REQUEST)
```

### Response (44 bytes, UDP unicast to the requester's address and port)

```
Offset  Size  Field
  0      4    Magic              0xDEADBEEF (u32 LE)
  4      1    Command            0x02 (DS_DISCOVERY_RESPONSE)
  5      1    Board Type         DS_BOARD_TYPE (0 unknown, 1–3 custom by default)
  6      2    Firmware Version   u16 LE, DS_FIRMWARE_VERSION (default 0x0200)
  8      4    Board ID           u32 LE, DS_BOARD_ID
 12      4    IP Address         network byte order: bytes 12–15 read a.b.c.d
 16      2    TCP Data Port      u16 LE
 18      2    UDP Data Port      u16 LE
 20      6    MAC Address        6 raw bytes; all zero if the platform cannot report it
 26      2    Reserved           zero
 28     16    Board Name         ASCII, null-terminated, at most 15 characters
```

The IP address is the device's own interface address (0 if unavailable). The board name defaults to `DS_BOARD_NAME` and can be changed at run time; `WRITE_FLASH` persists it.

The host broadcasts the request on every non-loopback IPv4 interface and collects responses for 5 seconds.

---

## Data Frames

Requests and responses are **8 bytes**. If the firmware is built with `CRC8_ENABLE` (off by default), both are **9 bytes**: a CRC-8 byte follows the eight below. DSHub supports only the 8-byte format.

### Request (host → device)

```
Offset  Size  Field     Type
  0      2    Type      u16   — operation (see Operation Types)
  2      2    Address   u16   — register / parameter address, or system command code
  4      4    Value     u32   — write payload; ignored by reads
```

### Response (device → host)

```
Offset  Size  Field     Type
  0      2    Status    i16   — success code (≥ 0) or error (< 0)
  2      2    Address   u16   — echo of the request address
  4      4    Value     u32   — see below
```

The library declares `Value` as `u32`. DSHub handles it as `i32`; both carry the same 32 bits, and the map type decides how they are shown.

| Operation | Response `Value` |
|-----------|------------------|
| Read (register, parameter, system register) | The value read; 0 on error |
| Write register / parameter, success | Echo of the value written |
| Write, refused | 0 |
| `SYS_COMMAND` | Set by the command handler; 0 for built-in commands and on error |
| `CONTROL_INTERFACE` | 0. Library v0.2.4.1 and earlier leave the previous response's value |
| `PACKET_SIZE_ERROR` | 0 (the `Address` field is not updated and repeats the previous response's) |

### CRC-8 (optional)

Polynomial 0x07, initial value 0x00, no reflection, no final XOR, computed over the first 8 bytes. A request whose CRC does not match is answered with status `CRC_ERROR` (-9).

### Operation Types

| Type | Name in library | Description | Needs Control |
|------|-----------------|-------------|---------------|
| 0 | `ds_type_SYS_COMMAND` | System command; `Address` carries the command code | Yes |
| 1 | `ds_type_READ_REGISTER` | Read user register at `Address` | No |
| 2 | `ds_type_WRITE_REGISTER` | Write `Value` to user register at `Address` | Yes |
| 3 | `ds_type_READ_PARAMETER` | Read parameter at `Address` | No |
| 4 | `ds_type_WRITE_PARAMETER` | Write `Value` to parameter at `Address` | Yes |
| 5 | `ds_type_CONTROL_INTERFACE` | Take Control for the transport this request arrived on | — |
| 6 | `ds_type_READ_SYSTEM_REGISTER` | Read library system register at `Address` | No |
| 7 | `ds_type_WRITE_SYSTEM_REGISTER` | Always refused with `PERMISSION_ERROR` | — |
| 8–99 | — | Reserved for the library; answered with `INPUT_TYPE_ERROR` | — |
| 100–65535 | `ds_type_USER_DEFINED_START`… | Application-defined; firmware that does not handle them answers `INPUT_TYPE_ERROR` | Firmware-defined |

### Status Codes

| Status | Library name | Meaning |
|--------|--------------|---------|
|  0 | `SYS_COMMAND_OK` | System command executed |
|  1 | `READ_REGISTER_OK` | Register read — **also returned for system register reads** |
|  2 | `WRITE_REGISTER_OK` | Register written |
|  3 | `READ_PARAMETER_OK` | Parameter read |
|  4 | `WRITE_PARAMETER_OK` | Parameter written |
|  5 | `CONTROL_INTERFACE_OK` | Control taken |
| -1 | `SYS_COMMAND_ERROR` | Unknown system command, or the command handler failed |
| -2 | `INPUT_TYPE_ERROR` | Unknown operation type |
| -3 | `PACKET_SIZE_ERROR` | Frame had the wrong length |
| -4 | `ADDRESS_OUT_OF_RANGE_ERROR` | Address past the end of the addressed map |
| -5 | `PERMISSION_ERROR` | Write to a read-only register, or `WRITE_SYSTEM_REGISTER` |
| -6 | `CONTROL_INTERFACE_ERROR` | This transport does not hold Control (write or command), or Take Control came from an unregistered task |
| -7 | `SYNTAX_ERROR` | Defined for the CLI; not sent on data frames by the library |
| -8 | `PARAMETERS_ERROR` | Defined for the CLI; not sent on data frames by the library |
| -9 | `CRC_ERROR` | CRC mismatch (only with `CRC8_ENABLE`) |

Every response with a negative status increments `DS_ERROR_COUNT` (when statistics are enabled).

Checks are made in this order: Control first, then the address, then read-only protection. A write to a read-only register from a transport without Control therefore returns -6, not -5.

`tests/protocol-vectors.json` lists request and response frames; `cargo test --test conformance -- --ignored` replays them against the emulator, or against a device on a bench with `DSHUB_CONFORMANCE_ADDR=ip:port`. The vectors follow the library's behaviour, including its fixed `SYS_COMMAND` status.

---

## Address spaces

Registers, parameters and system registers are three separate address spaces, each indexed from 0 in 32-bit words.

- **User registers** (types 1 and 2): the first `DS_REGISTERS_READ_ONLY_COUNT` registers are read-only from the wire; the rest are read/write. Firmware updates read-only registers itself.
- **Parameters** (types 3 and 4): all writable. `READ_FLASH` and `WRITE_FLASH` load and store them.
- **System registers** (types 6 and 7): owned by the library, read-only from the wire.

The firmware's register and parameter layout is defined in its `ds_app_register_names.h` / `ds_app_parameter_names.h`; DSHub's map files must describe the same layout. Firmware may run callbacks on every register or parameter read and write.

### System Registers

| Address | Name | Description |
|---------|------|-------------|
| 0 | `DS_PACKET_COUNT` | Data frames received with a valid CRC |
| 1 | `DS_ERROR_COUNT` | Responses with a negative status |
| 2 | `CONTROL_INTERFACE` | Transport that holds Control (see below) |
| 3 | `COUNTER_1HZ` | A 1 Hz counter. The library does not advance it; the application must, so it only counts seconds if the firmware does so |

`DS_PACKET_COUNT` and `DS_ERROR_COUNT` exist only when the firmware is built with `DS_STATS_ENABLE` (the default). Without it the space shrinks to `CONTROL_INTERFACE` at 0 and `COUNTER_1HZ` at 1. DSHub's heartbeat assumes the default layout.

### Control Interface Values

| Value | Interface |
|-------|-----------|
| 0 | `UNDECIDED` — nobody holds Control (power-on state) |
| 1 | `TCP_DATASTREAM` |
| 2 | `UDP_DATASTREAM` |
| 101 | `TCP_CLI` (optional CLI) |
| 102 | `USB` (example application interface) |
| 100+ | Other application-defined interfaces |

---

## Control

Control decides which interface may write and send system commands. Reads never need it.

- **Take Control** (type 5) gives Control to the task that received the request: the TCP datastream task, the UDP datastream task, or another registered interface. The request's `Address` and `Value` are ignored. There is no request to release Control.
- Control belongs to the **transport task, not to a connection or client**. It passes to another interface only when that interface sends Take Control. It is not released by a timeout or when a TCP client disconnects: a later TCP client inherits Control, and on UDP every sender shares it.
- A request from a task that never registered (not normally reachable from the network) is refused with -6 and leaves `CONTROL_INTERFACE` at 0.

---

## SYS_COMMAND (Type 0)

`SYS_COMMAND` frames carry their command code in the `Address` field and an argument in `Value`. They require Control; without it the reply is -6.

### Library commands (65000–65535)

| Code | Name | Effect |
|------|------|--------|
| 65000 | `READ_FLASH` | Reload parameters and the board name from flash |
| 65001 | `WRITE_FLASH` | Store parameters and the board name to flash |
| 65002 | `RESET_FIRMWARE` | Restart the device (ESP32 and STM32). The reset happens before a reply is sent, so the host sees the connection drop rather than an acknowledgement |

### Application commands (0–64999)

Any other code is passed to the firmware's `dsProcessUserSysCommand(command, inValue, &outValue, &reply)`. The firmware chooses the reply status (normally 0 or -1) and the response `Value`. Codes the firmware does not handle return -1 (`SYS_COMMAND_ERROR`).

The bundled emulator implements this CNC catalogue:

| Codes | Command |
|-------|---------|
| 0 / 1 | Enable / disable all motors |
| 2–4 / 5–7 | Enable / disable motor X / Y / Z |
| 8 / 9 | Enable / disable spindle |
| 10 / 11–13 | Home all axes / X / Y / Z |
| 14 / 15 / 16 | Emergency stop / reset E-stop / clear errors |
| 20 / 21 | Jog X positive / negative by `JOG_DISTANCE` |
| 22 / 23 | Jog Y positive / negative |
| 24 / 25 | Jog Z positive / negative |

---

## Connection Lifecycle

1. **Discover** (optional) — UDP broadcast; collect responses for 5 s.
2. **Connect** — TCP `connect()` to the TCP data port, or send datagrams to the UDP data port.
3. **Take Control** — send type 5 before any write or system command.
4. **Read / Write** — types 1–4 and 6, one request at a time.
5. **Heartbeat** — DSHub reads `CONTROL_INTERFACE` (type 6, address 2) every second to detect a lost device and to see whether another interface has taken Control.
6. **Disconnect** — close the TCP socket or stop sending datagrams. Control stays with the transport task (see [Control](#control)).

DSHub sends all requests for a connection through one queue, so only one request is ever in flight.

---

## Conventions

### Float values

The 32-bit `Value` field carries IEEE 754 `float` values by bit pattern, not numeric conversion. An entry declared `float` in a map file is sent and received as its raw 32 bits. DSHub's implementation is `Entry::decode` / `Entry::encode` in [src/model.rs](src/model.rs); the emulator uses `struct.pack('<i', ...)` / `struct.unpack('<f', ...)`.

### Map files

Register and parameter names are defined in plain-text map files, not in the protocol. See [assets/maps/](assets/maps/) for examples and `parse_map` in [src/model.rs](src/model.rs) for the grammar. In a register map, the read-only section must match the firmware's `DS_REGISTERS_READ_ONLY_COUNT`; writes to read-only addresses return `PERMISSION_ERROR`.

### Endianness

Every multi-byte field is little-endian, except the discovery IP address, which is in network byte order (its four bytes read in dotted-quad order).

---

## Compatibility notes

DSHub v0.3.2 and the bundled emulator follow this document. Remaining limits and firmware requirements:

| Area | Library | DSHub | Effect |
|------|---------|-------|--------|
| `SYS_COMMAND` status in library v0.2.4.1 and earlier | `dsProcessPacket` does not copy the command's reply into the status, so the reply repeats the previous response's status. Fixed in the library after v0.2.4.1 | Requires status 0 or a negative code | On older firmware a command answered after a successful read or write is discarded as unmatched and reported with an unknown outcome. Update the firmware's library |
| `CONTROL_INTERFACE` reply value in library v0.2.4.1 and earlier | Not written (stale); 0 after the fix | Ignores it and takes the new control state from the interface it requested | None |
| CRC-8 frames | Optional 9-byte frames | Not supported | Build firmware with `CRC8_ENABLE 0` |
| System registers without statistics | `CONTROL_INTERFACE` moves to address 0 | Reads address 2 | Build firmware with `DS_STATS_ENABLE 1` |
| TCP framing | No reassembly of split frames | Sends whole frames with `TCP_NODELAY`; the emulator also reassembles | None |

---

## Reference

- Firmware library: datastream v0.2.4.1 (`include/datastream.h`, `src/datastream.c`, `src/dsTCP.c`, `src/dsUDP.c`)
- Rust constants: [src/backend/types.rs](src/backend/types.rs)
- TCP/UDP communicator: [src/backend/communicator.rs](src/backend/communicator.rs)
- Discovery scanner: [src/backend/scanner.rs](src/backend/scanner.rs)
- Python constants and the CNC catalogue: [emulator/dshub_emulator.py](emulator/dshub_emulator.py)
- Emulator guide: [emulator/README.md](emulator/README.md)
