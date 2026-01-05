#!/bin/bash

# DeviceMon Web - PM2 Deployment Script
# This script builds and deploys the DeviceMon application using PM2

set -e  # Exit on any error

echo "======================================"
echo "DeviceMon Web - PM2 Deployment"
echo "======================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "Please install Node.js (v16 or higher) first."
    exit 1
fi

echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo ""

# Check if PM2 is installed, install if not
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing PM2 globally..."
    npm install -g pm2
    echo "PM2 installed successfully!"
else
    echo "PM2 is already installed: $(pm2 --version)"
fi
echo ""

# Create logs directory if it doesn't exist
echo "Creating logs directory..."
mkdir -p logs
echo ""

# Install server dependencies
echo "Installing server dependencies..."
npm install
echo ""

# Install client dependencies
echo "Installing client dependencies..."
cd client
npm install
cd ..
echo ""

# Build client
echo "Building client production bundle..."
cd client
npm run build
cd ..
echo ""

# Build server
echo "Building TypeScript server..."
npm run build
echo ""

# Check if app is already running in PM2
if pm2 list | grep -q "devicemon-web"; then
    echo "DeviceMon is already running in PM2."
    echo "Reloading application with zero downtime..."
    pm2 reload ecosystem.config.js
    echo ""
else
    echo "Starting DeviceMon with PM2..."
    pm2 start ecosystem.config.js
    echo ""
fi

# Save PM2 process list
echo "Saving PM2 process list..."
pm2 save
echo ""

# Configure PM2 to start on system boot
echo "Configuring PM2 startup script..."
echo "NOTE: The following command may require sudo password to configure system startup."
echo "If you don't want auto-start on boot, press Ctrl+C now."
echo ""
sleep 3

pm2 startup || echo "WARNING: Could not configure startup script. You may need to run 'pm2 startup' manually with appropriate permissions."
echo ""

# Display status
echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
pm2 list
echo ""
echo "Useful PM2 commands:"
echo "  pm2 list              - Show all running processes"
echo "  pm2 logs devicemon-web - View application logs"
echo "  pm2 monit             - Monitor CPU/Memory usage"
echo "  pm2 restart devicemon-web - Restart application"
echo "  pm2 stop devicemon-web    - Stop application"
echo "  pm2 start devicemon-web   - Start application"
echo ""
echo "Access DeviceMon at: http://localhost:3001"
echo "(Server runs on port 3002, client served on port 3001)"
echo ""
