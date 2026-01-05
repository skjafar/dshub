#!/bin/bash

# DeviceMon Web - PM2 Update Script
# This script updates the running application with zero downtime

set -e  # Exit on any error

echo "======================================"
echo "DeviceMon Web - Update with PM2"
echo "======================================"
echo ""

# Check if PM2 is running the app
if ! pm2 list | grep -q "devicemon-web"; then
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
echo "Building client production bundle..."
cd client
npm run build
cd ..
echo ""

# Build server
echo "Building TypeScript server..."
npm run build
echo ""

# Reload application with zero downtime
echo "Reloading application with zero downtime..."
pm2 reload ecosystem.config.js
echo ""

# Display status
echo "======================================"
echo "Update Complete!"
echo "======================================"
echo ""
pm2 list
echo ""
pm2 logs devicemon-web --lines 20 --nostream
echo ""
echo "Application has been updated and reloaded successfully."
echo "Run 'pm2 logs devicemon-web' to monitor the application."
echo ""
