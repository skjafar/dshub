#!/usr/bin/env bash
# Renders native scenes against the emulator and saves screenshots.
# Usage: tests/native-smoke.sh [OUTPUT_DIR] [SCENE...]
# With no scenes, all of them run. OUTPUT_DIR (default target/native-smoke)
# is recognised by containing a slash.
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --locked --features native-smoke --target-dir target/native-smoke-build
python3 - "$@" <<'PY'
import os, subprocess, sys, tempfile, time
from pathlib import Path
if sys.platform != 'linux':
    raise SystemExit('This rendering harness currently isolates application storage on Linux only.')
SCENES = ['registers', 'parameters', 'system', 'commands', 'inspector', 'log', 'plot', 'editor', 'dashboard', 'cnc', 'cnc-edit', 'review', 'native-window', 'workspace', 'profiles', 'preferences', 'guide', 'light']
out = Path('target/native-smoke')
scenes = []
for arg in sys.argv[1:]:
    if '/' in arg:
        out = Path(arg)
    elif arg in SCENES:
        scenes.append(arg)
    else:
        raise SystemExit(f'Unknown scene {arg!r}. Scenes: {" ".join(SCENES)}')
scenes = scenes or SCENES
out = out.resolve()
out.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='dshub-smoke-state-') as state:
    emulator = subprocess.Popen(['python3', '-u', 'emulator/dshub_emulator.py', '--local'], stdout=subprocess.DEVNULL)
    try:
        time.sleep(.8)
        for scene in scenes:
            (out / f'{scene}.png').unlink(missing_ok=True)
            env = os.environ.copy()
            env.update(DSHUB_SCREENSHOT=str(out / f'{scene}.png'), DSHUB_SMOKE_SCENE=scene, XDG_DATA_HOME=state, XDG_CONFIG_HOME=state)
            result = subprocess.run(['target/native-smoke-build/debug/dshub'], env=env, capture_output=True, text=True, timeout=20)
            if result.returncode or f'SMOKE_SCENE:{scene}' not in result.stdout or not (out / f'{scene}.png').exists():
                raise RuntimeError(f'{scene}: exit {result.returncode}\n{result.stdout}\n{result.stderr}')
            print(f'PASS {scene}', flush=True)
    finally:
        emulator.terminate()
        emulator.wait(timeout=5)
print(f'Screenshots: {out}')
PY
