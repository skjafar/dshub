# DSHub Quick Start Guide

DSHub is a native desktop application — no server to run, no browser to open. Just launch the app.

## Installation

### Arch Linux (AUR)

```bash
yay -S dshub
```

### From a .deb package (Ubuntu / Debian)

Download `DSHub_0.2.0_amd64.deb` from the releases page, then:

```bash
sudo dpkg -i DSHub_0.2.0_amd64.deb
```

### From a .rpm package (Fedora / openSUSE)

```bash
sudo rpm -i DSHub-0.2.0-1.x86_64.rpm
```

### From Source

```bash
git clone https://github.com/skjafar/dshub.git && cd dshub
./build.sh bin    # builds frontend + binary
./build.sh run    # launch it
```

---

## First Launch

1. **Open DSHub** from your application launcher or run `dshub` in a terminal.
2. The app opens a window — there is no browser tab involved.

---

## Connecting to a Device

### Step 1 — Scan

Click **Scan for Devices**. DSHub broadcasts a UDP discovery packet to every network interface on your machine. Devices on the local network respond with their board name, IP, and port.

Discovered devices appear in the device list within a few seconds.

### Step 2 — Connect

Select a device and choose **TCP** or **UDP**, then click **Connect**.

- **TCP** — reliable, ordered; recommended for most use cases
- **UDP** — lower latency; useful for high-speed polling

### Step 3 — Take Control

Click **Take Control**. This claims the device's control interface. The device will not respond to read/write commands until control is taken.

---

## Reading and Writing

### Registers

Go to the **Registers** panel. Enter an address (0–255) or select a named register from your loaded map profile. Click **Read** or enter a value and click **Write**.

### Parameters

Go to the **Parameters** panel. Same workflow as registers but uses command codes 3 (read) and 4 (write).

---

## Live Plotting

1. Open the **Plotter** panel.
2. Select a register name or enter an address.
3. Set a poll interval (minimum 10 ms).
4. Click **Start** — the chart updates in real time.

Multiple registers can be plotted simultaneously in the **Multi-Plot** panel.

---

## Map Profiles

Map profiles give human-readable names to register and parameter addresses. Load them from **Settings → Map Profiles**.

Default maps are at:
```
client/public/maps/registers.map
client/public/maps/parameters.map
client/public/maps/boardtypes.map
```

File format:
```c
// One entry per line
uint32_t    COUNTER_1HZ;       // address 3
int32_t     MOTOR_X_ENCODER;   // address 5
float       MOTOR_X_KP;        // address 6
```

---

## Testing Without Hardware

The Python emulator simulates a CNC motor controller board with full protocol support:

```bash
python3 emulator/dshub_emulator.py
```

Then scan for devices in DSHub — the emulator appears as **"Python Emulator"** at `127.0.0.1`. Connect via TCP or UDP, take control, and explore registers/parameters. Register 3 (`COUNTER_1HZ`) auto-increments once per second — good for testing the plotter.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No devices found | Check that port UDP 2011 is not blocked; verify the device is on the same subnet |
| Cannot connect | Try switching TCP ↔ UDP; confirm device firmware is running |
| Operations fail | Click **Take Control** first — required before any read/write |
| Emulator not discovered | Check that nothing else is using ports 2009/2011 on localhost |
