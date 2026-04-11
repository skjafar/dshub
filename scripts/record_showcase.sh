#!/usr/bin/env bash
# =============================================================================
# DSHub Showcase Recorder
# =============================================================================
# Records an automated showcase of DSHub for a Reddit post.
# Uses wf-recorder (Wayland-native capture) + ydotool (Wayland pointer control).
#
# First-time setup:
#   sudo pacman -S ydotool
#   systemctl --user enable --now ydotool.service
#   sudo usermod -aG input $USER   # then log out and back in
#   bash build.sh bin               # build the binary first if not already done
#
# Usage:
#   ./scripts/record_showcase.sh             # Full recording
#   ./scripts/record_showcase.sh calibrate   # Launch app + show live cursor pos
#
# Output: /tmp/dshub-showcase.mp4
# Then run: ./scripts/make_gif.sh
# =============================================================================

set -e

# ─────────────────────────────────────────────────────────────────────────────
# CALIBRATION CONSTANTS
# Run in calibrate mode first, hover over each UI element, and update these.
# All coordinates are ABSOLUTE screen coordinates (what hyprctl reports).
# ─────────────────────────────────────────────────────────────────────────────

# Update these after running calibrate mode:
WIN_X=2566           # window left edge (absolute screen X)
WIN_Y=75             # window top edge (absolute screen Y)
WIN_W=1908           # window width
WIN_H=999            # window height

# Sidebar nav item X center (sidebar is 240px wide, so ~120px from left edge)
NAV_X=107

# Nav item Y centers — relative to window top (AppBar ~64px tall, items ~48px)
Y_SCANNER=106
Y_STATUS=150
Y_DASHBOARD=199
Y_PLOT=246
Y_SYSCOMMAND=289
Y_REGISTERS=327
Y_PARAMETERS=366

# AppBar controls (relative to window)
Y_APPBAR=71
X_SCAN_BUTTON=336
X_CONNECT_ICON=1841   # rightmost column of device table
Y_DEVICE_ROW=326

# Registers panel — AppBar toolbar buttons (visible when currentView=registers)
X_REFRESH_ALL_BTN=461      # "Refresh All" button (second button, after "Read Register")

# Registers panel — tab strip (Read Only / Read/Write / System)
Y_REG_TABS=226             # Y of the Tabs row inside the content card
X_READWRITE_TAB=471        # X center of "Read/Write" tab
X_SYSTEM_TAB=602           # X center of "System" tab

# Registers panel — table body (auto-refresh checkbox + row positions)
X_AUTORELOAD_COL=1284      # X of the Auto-Refresh checkbox column
Y_REG_ROW_1=396            # Y of 1st data row
Y_REG_ROW_2=439            # Y of 2nd data row
Y_REG_ROW_3=489            # Y of 3rd data row

# DeviceDashboard (Status panel) — Take Control button
X_TAKE_CONTROL=1781
Y_TAKE_CONTROL=73

# SysCommand panel — left card (manual entry form)
X_SYSCMD_CODE_FIELD=358    # X of the Command Code text field
Y_SYSCMD_CODE_FIELD=208    # Y of the Command Code text field
X_SYSCMD_SEND_BTN=661      # X of the Send Command button
Y_SYSCMD_SEND_BTN=431      # Y of the Send Command button

# SysCommand panel — right card (quick-command chips, codes 0–25)
X_SYSCMD_CHIPS=1329        # X center of the quick-commands list
Y_SYSCMD_ENABLE_ALL=268    # Y of CMD_ENABLE_ALL_MOTORS (code 0, 1st chip)

# Plot panel controls (relative to window)
X_SOURCE_SELECT=373        # Source dropdown (leftmost: Register / System Register)
X_REGISTER_SELECT=543      # Register/System Register dropdown (2nd element)
Y_REGISTER_SELECT=150      # Y of the whole toolbar row
X_TARGET_PLOT_SELECT=1181   # Target Plot dropdown (4th element)
X_ADD_SERIES_BTN=1493      # Add Series button (5th element)
Y_ADD_SERIES_BTN=150       # Y of Add Series button (same toolbar row)
X_ADD_PLOT_BTN=1073         # Add Plot button (bottom card)
Y_ADD_PLOT_BTN=580         # Y of Add Plot button (with 1 plot visible) — CALIBRATE

# ─────────────────────────────────────────────────────────────────────────────
# SETTINGS
# ─────────────────────────────────────────────────────────────────────────────

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="/tmp/dshub-showcase.mp4"
EMULATOR_PID=""
TAURI_PID=""
RECORDER_PID=""

# XWayland display — auto-detected below
XDISPLAY=":1"

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

log()  { echo -e "\033[36m[SHOWCASE]\033[0m $*"; }
step() { echo -e "\033[32m[STEP]\033[0m $*"; }

# Live cursor tracker — runs in background, prints cursor pos on the top line
TRACKER_PID=""
start_cursor_tracker() {
  ( while true; do
      pos=$(hyprctl cursorpos 2>/dev/null)
      # Print on line 1, overwriting in place, then restore cursor
      printf "\033[s\033[1;1H\033[2K\033[33m[CURSOR]\033[0m  Wayland pos: %-20s   WIN offset: x=%d y=%d\033[u" \
        "$pos" "$WIN_X" "$WIN_Y"
      sleep 0.1
    done ) &
  TRACKER_PID=$!
}
stop_cursor_tracker() {
  [[ -n "$TRACKER_PID" ]] && kill "$TRACKER_PID" 2>/dev/null && TRACKER_PID=""
  # Clear the tracker line
  printf "\033[s\033[1;1H\033[2K\033[u"
}

CURSOR_TRACKER_PID=""

cleanup() {
  stop_cursor_tracker
  [[ -n "$RECORDER_PID" ]] && kill -INT "$RECORDER_PID" 2>/dev/null; wait "$RECORDER_PID" 2>/dev/null || true
  [[ -n "$TAURI_PID"    ]] && kill "$TAURI_PID"    2>/dev/null || true
  [[ -n "$EMULATOR_PID" ]] && kill "$EMULATOR_PID" 2>/dev/null || true
  echo ""
  log "Done."
}
trap cleanup EXIT

# Move cursor via hyprctl movecursor (real Wayland pointer, same coord space as
# hyprctl clients/cursorpos), then click via ydotool. Logs every action.
click_at() {
  local rx=$1 ry=$2 label=${3:-""}
  local ax=$((WIN_X + rx)) ay=$((WIN_Y + ry))
  stop_cursor_tracker
  echo ""
  log "CLICK${label:+  [$label]}"
  log "  window-relative: (${rx}, ${ry})"
  log "  absolute target:  (${ax}, ${ay})"
  hyprctl dispatch movecursor "$ax" "$ay" &>/dev/null
  sleep 0.2
  pos=$(hyprctl cursorpos 2>/dev/null)
  log "  cursor landed at: ${pos}"
  ydotool click 0xC0
  sleep 0.1
  start_cursor_tracker
}

# Get window geometry from Hyprland (DSHub is Wayland-native, not in XWayland).
# xdotool and hyprctl share the same logical coordinate space at scale 1.0.
refresh_win_geo() {
  local geo
  geo=$(hyprctl clients -j 2>/dev/null | python3 -c "
import sys, json
for c in json.load(sys.stdin):
    if 'dshub' in c.get('class','').lower() or 'DSHub' in c.get('title',''):
        print(c['at'][0], c['at'][1], c['size'][0], c['size'][1]); break
" 2>/dev/null)
  [[ -n "$geo" ]] && read -r WIN_X WIN_Y WIN_W WIN_H <<< "$geo"
}

# Poll hyprctl until the DSHub window appears; sets WID to a non-empty sentinel
wait_for_dshub() {
  local found=""
  for i in $(seq 1 120); do
    found=$(hyprctl clients -j 2>/dev/null | python3 -c "
import sys, json
for c in json.load(sys.stdin):
    if 'dshub' in c.get('class','').lower() or 'DSHub' in c.get('title',''):
        print('found'); break
" 2>/dev/null)
    [[ "$found" == "found" ]] && return 0
    sleep 1
    [[ $((i % 10)) -eq 0 ]] && log "  Still waiting… (${i}s)"
  done
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# PRE-FLIGHT
# ─────────────────────────────────────────────────────────────────────────────

# Auto-detect XWayland display
for xwpid in $(pgrep -x Xwayland 2>/dev/null); do
  detected=$(cat /proc/"$xwpid"/cmdline 2>/dev/null | tr '\0' '\n' \
             | grep -E '^:[0-9]+$' | head -1)
  [[ -n "$detected" ]] && XDISPLAY="$detected" && break
done

for tool in wf-recorder ydotool python3 hyprctl xdotool; do
  if ! command -v "$tool" &>/dev/null; then
    echo "ERROR: '$tool' not found." >&2
    if [[ "$tool" == "ydotool" ]]; then
      echo "  Install: sudo pacman -S ydotool" >&2
      echo "  Enable:  sudo systemctl enable --now ydotoold" >&2
      echo "  Group:   sudo usermod -aG input \$USER  (re-login after)" >&2
    fi
    exit 1
  fi
done

# Test ydotool is actually working (daemon running)
if ! ydotool mousemove -x 0 -y 0 &>/dev/null; then
  echo "ERROR: ydotoold daemon not running." >&2
  echo "  Run: sudo systemctl start ydotoold" >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# CALIBRATION MODE
# ─────────────────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "calibrate" ]]; then
  log "CALIBRATION MODE — Starting DSHub natively under Wayland…"
  ( bash "$PROJECT_DIR/build.sh" run &>/tmp/dshub-tauri.log ) &
  TAURI_PID=$!

  log "Waiting for DSHub window to appear (may take 30-60s)…"
  if ! wait_for_dshub; then
    echo "ERROR: DSHub window not found. Check /tmp/dshub-tauri.log" >&2; exit 1
  fi
  refresh_win_geo
  log "Window: ${WIN_W}x${WIN_H} at (${WIN_X},${WIN_Y})"
  log ""
  start_cursor_tracker

  # ── Interactive calibration ─────────────────────────────────────────────────
  # Hover over a UI element and LEFT CLICK — position is captured automatically.
  # Reads raw /dev/input events (requires input group membership for ydotool).

  # Python snippet: blocks until a left mouse button press on any input device.
  WAIT_CLICK_PY='
import struct, glob, select, sys, os

EV_KEY, BTN_LEFT = 1, 0x110

def is_mouse(dev):
    """Only open devices that advertise pointer/mouse capability."""
    base = os.path.basename(dev)
    name_path = f"/sys/class/input/{base}/device/name"
    caps_path = f"/sys/class/input/{base}/device/capabilities/key"
    try:
        # Check capabilities bitmask for BTN_LEFT (bit 0x110 = 272)
        with open(caps_path) as f:
            caps = int(f.read().strip().replace(" ", ""), 16)
        return bool(caps & (1 << 0x110))
    except Exception:
        return False

fds = []
for dev in sorted(glob.glob("/dev/input/event*")):
    if is_mouse(dev):
        try:
            fds.append(open(dev, "rb"))
        except Exception:
            pass

if not fds:
    sys.exit(2)  # no mouse device found

try:
    while True:
        ready, _, _ = select.select(fds, [], [], 30)
        if not ready:
            sys.exit(1)  # timeout
        for f in ready:
            data = f.read(24)
            if len(data) < 24:
                continue
            _, _, typ, code, val = struct.unpack("llHHi", data)
            if typ == EV_KEY and code == BTN_LEFT and val == 1:
                sys.exit(0)
finally:
    for f in fds:
        f.close()
'

  # capture VAR LABEL AXIS — click once, store x or y relative to window
  capture() {
    local varname=$1 label=$2 axis=$3
    echo ""
    echo -e "  \033[33m>>>\033[0m $label"
    python3 -c "$WAIT_CLICK_PY" || { echo "  (timed out — skipping)"; return; }
    local pos mx my val
    pos=$(hyprctl cursorpos 2>/dev/null)
    mx=$(echo "$pos" | grep -oP '^-?[0-9]+(?=,)')
    my=$(echo "$pos" | grep -oP '(?<=, )-?[0-9]+')
    [[ "$axis" == "x" ]] && val=$((mx - WIN_X)) || val=$((my - WIN_Y))
    echo -e "  \033[32m✓\033[0m $varname = $val  (abs: ${mx}, ${my})"
    CAPTURES[$varname]=$val
  }

  # capture2 VAR_X VAR_Y LABEL — click once, store both x and y
  capture2() {
    local vx=$1 vy=$2 label=$3
    echo ""
    echo -e "  \033[33m>>>\033[0m $label"
    python3 -c "$WAIT_CLICK_PY" || { echo "  (timed out — skipping)"; return; }
    local pos mx my
    pos=$(hyprctl cursorpos 2>/dev/null)
    mx=$(echo "$pos" | grep -oP '^-?[0-9]+(?=,)')
    my=$(echo "$pos" | grep -oP '(?<=, )-?[0-9]+')
    CAPTURES[$vx]=$((mx - WIN_X))
    CAPTURES[$vy]=$((my - WIN_Y))
    echo -e "  \033[32m✓\033[0m $vx = ${CAPTURES[$vx]}   $vy = ${CAPTURES[$vy]}  (abs: ${mx}, ${my})"
  }

  section() { echo ""; echo -e "\033[36m━━━ $* ━━━\033[0m"; }

  declare -A CAPTURES
  CAPTURES[WIN_X]=$WIN_X
  CAPTURES[WIN_Y]=$WIN_Y
  CAPTURES[WIN_W]=$WIN_W
  CAPTURES[WIN_H]=$WIN_H

  echo ""
  echo -e "\033[36m[CALIBRATE]\033[0m Click each element when prompted. The cursor tracker shows live position."
  echo -e "            Window auto-detected: (${WIN_X},${WIN_Y})  ${WIN_W}x${WIN_H}"

  # ── Panel 1: Device Scanner (always start here) ─────────────────────────────
  section "DEVICE SCANNER"
  echo -e "  Click the 'Device Scanner' nav item to land here first."
  capture2 NAV_X Y_SCANNER \
    "Click the 'Device Scanner' nav item in the sidebar"
  capture2 X_SCAN_BUTTON Y_APPBAR \
    "Click the 'Scan Network' button in the toolbar"

  section "DEVICE SCANNER — after scan"
  echo -e "  The emulator should now appear in the device list."
  echo -e "  Start the emulator if not running: python3 emulator/dshub_emulator.py"
  capture2 X_CONNECT_ICON Y_DEVICE_ROW \
    "Click the Connect icon on the Python Emulator row"

  # ── Panel 2: Registers ───────────────────────────────────────────────────────
  section "REGISTERS PANEL"
  capture Y_REGISTERS "Click the 'Registers' nav item in the sidebar" y
  echo -e "  Now you are on the Registers panel (Read Only tab, connected)."
  capture X_REFRESH_ALL_BTN \
    "Click the 'Refresh All' button in the AppBar toolbar" x
  capture2 X_READWRITE_TAB Y_REG_TABS \
    "Click the 'Read/Write' tab in the tab strip"
  capture X_SYSTEM_TAB "Click the 'System' tab in the tab strip" x

  echo -e "  Switch back to Read Only or Read/Write tab so rows are visible."
  capture X_AUTORELOAD_COL \
    "Click the Auto-Refresh checkbox on the FIRST data row" x
  capture Y_REG_ROW_1 \
    "Click the Auto-Refresh checkbox on the FIRST data row" y
  capture Y_REG_ROW_2 \
    "Click the Auto-Refresh checkbox on the SECOND data row" y
  capture Y_REG_ROW_3 \
    "Click the Auto-Refresh checkbox on the THIRD data row" y

  # ── Panel 3: Status (DeviceDashboard) — Take Control ─────────────────────────
  section "STATUS PANEL — Take Control"
  capture Y_STATUS "Click the 'Status' nav item in the sidebar" y
  capture2 X_TAKE_CONTROL Y_TAKE_CONTROL \
    "Click the 'Take Control' button (top of status card)"

  # ── Panel 4: SysCommand ──────────────────────────────────────────────────────
  section "SYSCOMMAND PANEL"
  capture Y_SYSCOMMAND "Click the 'SYS_COMMAND' nav item in the sidebar" y
  capture2 X_SYSCMD_CODE_FIELD Y_SYSCMD_CODE_FIELD \
    "Click the 'Command Code' text field (left card)"
  capture2 X_SYSCMD_SEND_BTN Y_SYSCMD_SEND_BTN \
    "Click the 'Send Command' button (left card)"
  capture2 X_SYSCMD_CHIPS Y_SYSCMD_ENABLE_ALL \
    "Click the 'CMD_ENABLE_ALL_MOTORS' quick-command chip (right card, 1st chip)"

  # ── Panel 5: Plot ─────────────────────────────────────────────────────────────
  section "PLOT PANEL"
  capture Y_PLOT "Click the 'Plot' nav item in the sidebar" y
  echo -e "  Calibrate the full toolbar row (Source → Register → Add Series)."
  capture2 X_SOURCE_SELECT Y_REGISTER_SELECT \
    "Click the 'Source' dropdown (leftmost in toolbar)"
  capture2 X_REGISTER_SELECT Y_REGISTER_SELECT \
    "Click the Register/System Register dropdown (2nd in toolbar)"
  capture2 X_TARGET_PLOT_SELECT Y_REGISTER_SELECT \
    "Click the 'Target Plot' dropdown (4th in toolbar)"
  capture2 X_ADD_SERIES_BTN Y_ADD_SERIES_BTN \
    "Click the 'Add Series' button (5th in toolbar)"
  capture2 X_ADD_PLOT_BTN Y_ADD_PLOT_BTN \
    "Click the 'Add Plot' button (bottom card) — scroll down if needed"

  # ── Panel 6: Dashboard ───────────────────────────────────────────────────────
  section "DASHBOARD PANEL"
  capture Y_DASHBOARD "Click the 'Dashboard' nav item in the sidebar" y

  # ── Panel 7: Parameters ──────────────────────────────────────────────────────
  section "PARAMETERS PANEL"
  capture Y_PARAMETERS "Click the 'Parameters' nav item in the sidebar" y

  # ── Patch the script constants in-place ──────────────────────────────────────
  echo ""
  log "Patching constants in $0 …"

  SCRIPT="$0"
  for var in WIN_X WIN_Y WIN_W WIN_H \
             NAV_X \
             Y_SCANNER Y_STATUS Y_DASHBOARD Y_PLOT Y_SYSCOMMAND Y_REGISTERS Y_PARAMETERS \
             Y_APPBAR X_SCAN_BUTTON X_CONNECT_ICON Y_DEVICE_ROW \
             X_REFRESH_ALL_BTN \
             Y_REG_TABS X_READWRITE_TAB X_SYSTEM_TAB \
             X_AUTORELOAD_COL Y_REG_ROW_1 Y_REG_ROW_2 Y_REG_ROW_3 \
             X_TAKE_CONTROL Y_TAKE_CONTROL \
             X_SYSCMD_CODE_FIELD Y_SYSCMD_CODE_FIELD \
             X_SYSCMD_SEND_BTN Y_SYSCMD_SEND_BTN \
             X_SYSCMD_CHIPS Y_SYSCMD_ENABLE_ALL \
             X_SOURCE_SELECT X_REGISTER_SELECT Y_REGISTER_SELECT \
             X_TARGET_PLOT_SELECT X_ADD_SERIES_BTN Y_ADD_SERIES_BTN \
             X_ADD_PLOT_BTN Y_ADD_PLOT_BTN; do
    val="${CAPTURES[$var]}"
    [[ -z "$val" ]] && continue
    # Replace the line "VAR=<number>" with the new value
    sed -i "s|^${var}=[0-9]*\b|${var}=${val}|" "$SCRIPT"
  done

  log "Done! Constants updated. Run the full recording with:"
  log "  bash $SCRIPT"
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Start the Python emulator
# ─────────────────────────────────────────────────────────────────────────────

step "1/5 — Starting Python emulator"
python3 "$PROJECT_DIR/emulator/dshub_emulator.py" &>/tmp/dshub-emulator.log &
EMULATOR_PID=$!
sleep 2
log "Emulator PID: $EMULATOR_PID"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Launch DSHub natively under Wayland
# ─────────────────────────────────────────────────────────────────────────────

step "2/5 — Launching DSHub (native Wayland)"
( bash "$PROJECT_DIR/build.sh" run &>/tmp/dshub-tauri.log ) &
TAURI_PID=$!

log "Waiting for DSHub window (may take 30-60s for first compile)…"
if ! wait_for_dshub; then
  echo "ERROR: DSHub window not found after 120s. Check /tmp/dshub-tauri.log" >&2; exit 1
fi
refresh_win_geo
log "Window: ${WIN_W}x${WIN_H} at (${WIN_X},${WIN_Y})"
sleep 5   # let React fully hydrate

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Start wf-recorder (Wayland-native capture)
# ─────────────────────────────────────────────────────────────────────────────

step "3/5 — Starting wf-recorder"
GEOMETRY="${WIN_X},${WIN_Y} ${WIN_W}x${WIN_H}"
log "Capturing region: \"$GEOMETRY\""
wf-recorder \
  -g "$GEOMETRY" \
  -r 30 \
  -c libx264 \
  -p crf=18 \
  -f "$OUTPUT" \
  &>/tmp/dshub-wfrecorder.log &
RECORDER_PID=$!
sleep 2
log "Recording to: $OUTPUT"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Focus the DSHub window via Hyprland
# ─────────────────────────────────────────────────────────────────────────────

hyprctl dispatch focuswindow "title:DSHub" &>/dev/null || true
sleep 0.5

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Showcase sequence
# ─────────────────────────────────────────────────────────────────────────────

step "4/5 — Running showcase sequence"
start_cursor_tracker

# ── Scene 1: Navigate to Device Scanner (always start here) ─────────────────
log "  Scene 1: Ensuring we're on Device Scanner"
click_at "$NAV_X" "$Y_SCANNER" "Device Scanner nav"
sleep 1

# ── Scene 2: Scan Network ────────────────────────────────────────────────────
log "  Scene 2: Clicking 'Scan Network'"
click_at "$X_SCAN_BUTTON" "$Y_APPBAR" "Scan Network button"
sleep 4

# ── Scene 3: Connect to device ───────────────────────────────────────────────
log "  Scene 3: Connecting to Python Emulator"
click_at "$X_CONNECT_ICON" "$Y_DEVICE_ROW" "Connect icon"
sleep 2

# ── Scene 4: Registers — Refresh All + auto-reload ───────────────────────────
log "  Scene 4: Registers panel"
click_at "$NAV_X" "$Y_REGISTERS" "Registers nav"
sleep 1

log "    Clicking 'Refresh All'"
click_at "$X_REFRESH_ALL_BTN" "$Y_APPBAR" "Refresh All button"
sleep 1

log "    Adding register 1 to auto-reload"
click_at "$X_AUTORELOAD_COL" "$Y_REG_ROW_1" "Auto-reload row 1"
sleep 0.5

log "    Adding register 2 to auto-reload"
click_at "$X_AUTORELOAD_COL" "$Y_REG_ROW_2" "Auto-reload row 2"
sleep 0.5

log "    Adding register 3 to auto-reload"
click_at "$X_AUTORELOAD_COL" "$Y_REG_ROW_3" "Auto-reload row 3"
sleep 4   # show live values changing

# ── Scene 5: System Registers ────────────────────────────────────────────────
log "  Scene 5: System Registers tab"
click_at "$X_SYSTEM_TAB" "$Y_REG_TABS" "System tab"
sleep 1

log "    Clicking 'Refresh All' on system registers"
click_at "$X_REFRESH_ALL_BTN" "$Y_APPBAR" "Refresh All (system)"
sleep 1

log "    Adding system register 1 to auto-reload"
click_at "$X_AUTORELOAD_COL" "$Y_REG_ROW_1" "Auto-reload sys row 1"
sleep 0.5

log "    Adding system register 2 to auto-reload"
click_at "$X_AUTORELOAD_COL" "$Y_REG_ROW_2" "Auto-reload sys row 2"
sleep 4   # show live values changing

# ── Scene 6: Plot — Plot 1 from system register DS_PACKET_COUNT ──────────────
log "  Scene 6: Plot panel"
click_at "$NAV_X" "$Y_PLOT" "Plot nav"
sleep 1

log "    Source → System Register"
click_at "$X_SOURCE_SELECT" "$Y_REGISTER_SELECT" "Source dropdown"
sleep 0.5
ydotool type --key-delay 80 "s"   # type-ahead: jump to 'System Register'
sleep 0.3
ydotool key 28:1 28:0
sleep 0.5

log "    Select DS_PACKET_COUNT"
click_at "$X_REGISTER_SELECT" "$Y_REGISTER_SELECT" "Register dropdown"
sleep 0.5
ydotool type --key-delay 80 "DS_PACKET"
sleep 0.5
ydotool key 28:1 28:0
sleep 0.5

log "    Add series to Plot 1"
click_at "$X_ADD_SERIES_BTN" "$Y_ADD_SERIES_BTN" "Add Series button"
sleep 1

# ── Scene 7: Plot — Add Plot 2, add encoder registers ────────────────────────
log "  Scene 7: Add Plot 2"
click_at "$X_ADD_PLOT_BTN" "$Y_ADD_PLOT_BTN" "Add Plot button"
sleep 1

log "    Source → Register (for encoders)"
click_at "$X_SOURCE_SELECT" "$Y_REGISTER_SELECT" "Source dropdown"
sleep 0.5
ydotool type --key-delay 80 "r"    # type-ahead: jump back to 'Register'
sleep 0.3
ydotool key 28:1 28:0
sleep 0.5

log "    Target Plot → Plot 2"
click_at "$X_TARGET_PLOT_SELECT" "$Y_REGISTER_SELECT" "Target Plot dropdown"
sleep 0.5
ydotool key 108:1 108:0         # Arrow Down to Plot 2
sleep 0.3
ydotool key 28:1 28:0
sleep 0.5

log "    Select MOTOR_X_ENCODER and add to Plot 2"
click_at "$X_REGISTER_SELECT" "$Y_REGISTER_SELECT" "Register dropdown"
sleep 0.5
ydotool type --key-delay 80 "MOTOR_X"
sleep 0.5
ydotool key 28:1 28:0
sleep 0.3
click_at "$X_ADD_SERIES_BTN" "$Y_ADD_SERIES_BTN" "Add Series (X encoder)"
sleep 0.5

log "    Select MOTOR_Y_ENCODER and add to Plot 2"
click_at "$X_REGISTER_SELECT" "$Y_REGISTER_SELECT" "Register dropdown"
sleep 0.5
ydotool type --key-delay 80 "MOTOR_Y"
sleep 0.5
ydotool key 28:1 28:0
sleep 0.3
click_at "$X_ADD_SERIES_BTN" "$Y_ADD_SERIES_BTN" "Add Series (Y encoder)"
sleep 0.5

log "    Select MOTOR_Z_ENCODER and add to Plot 2"
click_at "$X_REGISTER_SELECT" "$Y_REGISTER_SELECT" "Register dropdown"
sleep 0.5
ydotool type --key-delay 80 "MOTOR_Z"
sleep 0.5
ydotool key 28:1 28:0
sleep 0.3
click_at "$X_ADD_SERIES_BTN" "$Y_ADD_SERIES_BTN" "Add Series (Z encoder)"
sleep 1

# ── Scene 8: Status — Take Control ───────────────────────────────────────────
log "  Scene 8: Status panel — Take Control"
click_at "$NAV_X" "$Y_STATUS" "Status nav"
sleep 1

click_at "$X_TAKE_CONTROL" "$Y_TAKE_CONTROL" "Take Control button"
sleep 1

# ── Scene 9: SysCommand — Enable All Motors + Jog XYZ ────────────────────────
log "  Scene 9: SysCommand — Enable All Motors"
click_at "$NAV_X" "$Y_SYSCOMMAND" "SysCommand nav"
sleep 1

log "    Clicking Enable All Motors quick command"
click_at "$X_SYSCMD_CHIPS" "$Y_SYSCMD_ENABLE_ALL" "Enable All Motors chip"
sleep 0.5
click_at "$X_SYSCMD_SEND_BTN" "$Y_SYSCMD_SEND_BTN" "Send Command"
sleep 1

log "    Jog X+"
click_at "$X_SYSCMD_CODE_FIELD" "$Y_SYSCMD_CODE_FIELD" "Command Code field"
sleep 0.2
ydotool key 29:1 30:1 30:0 29:0   # Ctrl+A
sleep 0.2
ydotool type --key-delay 50 "20"
sleep 0.3
click_at "$X_SYSCMD_SEND_BTN" "$Y_SYSCMD_SEND_BTN" "Send Jog X+"
sleep 0.5

log "    Jog Y+"
click_at "$X_SYSCMD_CODE_FIELD" "$Y_SYSCMD_CODE_FIELD" "Command Code field"
sleep 0.2
ydotool key 29:1 30:1 30:0 29:0   # Ctrl+A
sleep 0.2
ydotool type --key-delay 50 "22"
sleep 0.3
click_at "$X_SYSCMD_SEND_BTN" "$Y_SYSCMD_SEND_BTN" "Send Jog Y+"
sleep 0.5

log "    Jog Z+"
click_at "$X_SYSCMD_CODE_FIELD" "$Y_SYSCMD_CODE_FIELD" "Command Code field"
sleep 0.2
ydotool key 29:1 30:1 30:0 29:0   # Ctrl+A
sleep 0.2
ydotool type --key-delay 50 "24"
sleep 0.3
click_at "$X_SYSCMD_SEND_BTN" "$Y_SYSCMD_SEND_BTN" "Send Jog Z+"
sleep 1

# ── Scene 10: Plot — show all plots moving ────────────────────────────────────
log "  Scene 10: Plot panel — live charts"
click_at "$NAV_X" "$Y_PLOT" "Plot nav"
sleep 6

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Stop recording
# ─────────────────────────────────────────────────────────────────────────────

step "5/5 — Stopping recording"
kill -INT "$RECORDER_PID"
wait "$RECORDER_PID" 2>/dev/null || true
RECORDER_PID=""

DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$OUTPUT" 2>/dev/null | cut -d. -f1)
log "Done! Video saved: $OUTPUT (~${DURATION}s)"
log ""
log "Next steps:"
log "  Preview : mpv $OUTPUT"
log "  GIF     : bash $PROJECT_DIR/scripts/make_gif.sh"
log ""
log "If clicks missed: bash $PROJECT_DIR/scripts/record_showcase.sh calibrate"
log "Then update the coordinate constants at the top of this file."
