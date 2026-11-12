# DSHub CNC emulator

A Python standard-library device emulator for the native DSHub application.

## Run and connect

```bash
python3 emulator/dshub_emulator.py
cargo run --locked
```

Select **CNC Motor Controller**, connect to `127.0.0.1` with TCP (2009) or UDP
(2011), and take Control. UDP discovery also uses port 2011.

The emulator listens on every interface by default, so DSHub can reach it from
this machine (`127.0.0.1`) or from another machine on the network; it prints
the addresses it can be reached at. Discovery reports the address that routes
to each requesting client. Start it with `--local` to listen on `127.0.0.1`
only, or `--host <address>` for one interface. The protocol has no
authentication, so only run it on the network where that is acceptable. The
launcher scripts pass their arguments through (`./run_emulator.sh --local`).

To test how DSHub copes with a slow or lossy link, add `--latency-ms 20` to
delay every reply, or `--drop-rate 0.2` to leave a share of UDP requests
unanswered (`--seed 1` makes the drops repeatable).
Open the Dashboard pane and select **CNC Control**, **Monitoring**, or
**Motion tuning**. Existing saved profiles can use **Add CNC panels** to append
the panels while retaining their dashboards. Map changes still require binding
review before affected controls can operate.

The control panel includes all axis enable/disable and home commands, signed
position targets, six jog directions, jog step selection, encoder feedback,
spindle speed/load, emergency stop, reset, and error clearing. Monitoring provides
position/RPM plots and communication diagnostics. Motion tuning exposes all 25
parameters; changing position targets, enabling drives, homing, starting the
spindle, and parameter writes require confirmation in the dashboard.

## Wire contract

Protocol v0.2.4 uses **8-byte little-endian packets**, answered as the datastream library v0.2.4.1 answers them (see [PROTOCOL.md](../PROTOCOL.md)):

- Request: `type: u16`, `address: u16`, `value: i32` (`<HHi`).
- Response: `status: i16`, `address: u16`, `value: i32` (`<hHi`).
- Types: 0 system command, 1/2 user register read/write, 3/4 parameter read/write,
  5 take Control, 6 system register read, 7 system register write (always refused).
- Successful statuses echo the request type, except system register reads,
  which answer 1 (`READ_REGISTER_OK`). Negative status means refusal: -1 command
  failed or unknown, -2 unknown type, -3 wrong datagram size, -4 invalid address,
  -5 read-only, -6 not in Control.
- Writes and system commands require Control on the requesting transport.
  Take Control gives Control to the transport it arrives on; its value is
  ignored and there is no release.
- Discovery answers with the library's 44-byte response (MAC at offset 20).
- TCP also accepts fragmented and concatenated packets, which the library does not.

The authoritative maps are in `assets/maps/cnc_*.map`; command definitions and
metadata are in `assets/cnc-profile-data.json`. User and system register spaces
are separate. System registers 0–3 are packet count, error count, control
interface, and uptime seconds. User registers 0–9 are read-only feedback;
10–12 are signed axis targets, 13 is spindle RPM target, and 14 is jog distance.
Float parameters travel as IEEE-754 f32 bit patterns in the signed value field.

CNC command codes:

| Codes | Operation |
| --- | --- |
| 0 / 1 | Enable / disable all axes |
| 2–4 / 5–7 | Enable / disable X, Y, Z |
| 8 / 9 | Enable / disable spindle |
| 10 / 11–13 | Home all / X, Y, Z |
| 14 / 15 / 16 | E-stop / reset E-stop / clear errors |
| 20 / 21 | Jog X positive / negative |
| 22 / 23 | Jog Y positive / negative |
| 24 / 25 | Jog Z positive / negative |
| 65000 / 65001 / 65002 | Read flash / write flash / reset firmware |

## Simulation behavior

A 100 Hz loop moves each axis along a trapezoidal profile within the axis
velocity and acceleration limits from the live parameter map, braking so that it
stops on the target without overshoot. The PID gains are stored and applied to
the parameter map for the tuning dashboards; the simulated drive is an ideal
position loop. Scaling parameters describe counts per millimeter; wire positions
remain encoder counts. Normal motion reports RUNNING, then READY when settled;
disabled axes report IDLE.

Homing enables the selected axes and, for each one, seeks the home switch at
the homing speed, backs off 200 counts and approaches it again at a quarter of
that speed. On the switch the encoder reads the axis's home position parameter,
which also becomes its setpoint. An axis already at home still moves, so homing
is always visible. While an axis homes, writes to its setpoint and jogs are
refused; disabling it cancels its homing.
PAUSED is reserved and has no command in the CNC catalog.

Spindle speed ramps at the configured rate and clamps to the configured maximum.
Load is simulated between 30% and 70% while running. E-stop disables drives,
cancels homing and pending targets, uses the configured emergency deceleration,
and blocks enable, home, and jog commands until reset. Reset is refused until motion has stopped and leaves drives disabled.

Flash commands save/load a parameter snapshot in memory. Firmware reset restores
that snapshot, clears motion state, and releases Control. Snapshots do not survive
emulator process exit. Negative speed/jog values, non-finite gains, negative gains,
and nonpositive speed/acceleration/scaling parameters are refused.

## Verification

```bash
python3 -m unittest discover -s tests -p 'test_cnc_emulator.py'
cargo test --locked
cargo test --locked --test emulator -- --ignored
bash tests/native-smoke.sh
```

The Python suite covers every CNC command family, homing, feedback, limits,
parameter application, E-stop, flash, permissions, invalid addresses, and TCP
stream framing. The Rust integration test connects the production backend over
both TCP and UDP. Native smoke tests capture the CNC panel and other native panes.
Local socket access and a graphical display are required for the corresponding tests.

This is a software simulation with no travel limits, physical limit switches,
cutting-force model, or persistent disk flash. It does not establish hardware
motion or emergency-stop performance.
