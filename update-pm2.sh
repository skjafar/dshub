#!/bin/bash

# DeviceMon Web - PM2 Update Script
# This script updates the running application with zero downtime

set -e  # Exit on any error

echo "======================================"
echo "DeviceMon Web - Update with PM2"
echo "======================================"
echo ""

# Detect PM2 command (global or local via npx)
PM2_CMD=""
if command -v pm2 &> /dev/null; then
    PM2_CMD="pm2"
elif [ -f "node_modules/.bin/pm2" ]; then
    PM2_CMD="npx pm2"
else
    echo "ERROR: PM2 is not installed."
    echo "Please run './deploy-pm2.sh' first to deploy the application."
    exit 1
fi

# Check if PM2 is running the app
if ! $PM2_CMD list | grep -q "devicemon-web"; then
    echo "ERROR: DeviceMon is not running in PM2."
    echo "Please run './deploy-pm2.sh' first to deploy the application."
    exit 1
fi

# Optional: Pull latest changes from git
if [ -d ".git" ]; then
    echo "Git repository detected. Do you want to pull latest changes? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Pulling latest changes from git..."
        git pull
        echo ""
    fi
fi

# Install/update server dependencies
echo "Updating server dependencies..."
npm install
echo ""

# Install/update client dependencies
echo "Updating client dependencies..."
cd client
npm install
cd ..
echo ""

# Build client
echo "Building client production bundle with Vite..."
cd client
npm run build || {
    echo "ERROR: Client build failed."
    echo "Check the error messages above for details."
    cd ..
    exit 1
}
cd ..
echo ""

# Build server
echo "Building TypeScript server..."
npm run build
echo ""

# Reload application with zero downtime
echo "Reloading application with zero downtime..."
$PM2_CMD reload ecosystem.config.js
echo ""

# Display status
echo "======================================"
echo "Update Complete!"
echo "======================================"
echo ""
$PM2_CMD list
echo ""
$PM2_CMD logs devicemon-web --lines 20 --nostream
echo ""
echo "Application has been updated and reloaded successfully."
if [ "$PM2_CMD" = "pm2" ]; then
    echo "Run 'pm2 logs devicemon-web' to monitor the application."
else
    echo "Run 'npx pm2 logs devicemon-web' to monitor the application."
fi
echo ""
