#!/bin/bash

# DSHub Emulator Launcher
# Simple script to run the board emulator

cd "$(dirname "$0")"

echo "======================================"
echo "Starting DSHub Board Emulator"
echo "======================================"
echo ""
echo "The emulator will be discoverable at 127.0.0.1"
echo "Press Ctrl+C to stop"
echo ""

python3 dshub_emulator.py
