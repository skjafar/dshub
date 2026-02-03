#!/bin/bash

# DSHub - PM2 Deployment Script
# This script builds and deploys the DSHub application using PM2

set -e  # Exit on any error

echo "======================================"
echo "DSHub - PM2 Deployment"
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

# Check if PM2 is available (globally or locally)
PM2_CMD=""
if command -v pm2 &> /dev/null; then
    PM2_CMD="pm2"
    echo "PM2 is installed globally: $(pm2 --version)"
elif [ -f "node_modules/.bin/pm2" ]; then
    PM2_CMD="npx pm2"
    echo "PM2 is installed locally: $(npx pm2 --version)"
else
    echo "PM2 is not installed."
    echo ""
    echo "Installing PM2 as a local dev dependency..."
    npm install --save-dev pm2
    PM2_CMD="npx pm2"
    echo "PM2 installed successfully!"
    echo ""
    echo "NOTE: PM2 is installed locally to this project."
    echo "To install PM2 globally (optional), run: npm install -g pm2"
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

# Check if app is already running in PM2
if $PM2_CMD list | grep -q "dshub"; then
    echo "DSHub is already running in PM2."
    echo "Reloading application with zero downtime..."
    $PM2_CMD reload ecosystem.config.js
    echo ""
else
    echo "Starting DSHub with PM2..."
    $PM2_CMD start ecosystem.config.js
    echo ""
fi

# Save PM2 process list
echo "Saving PM2 process list..."
$PM2_CMD save
echo ""

# Display status
echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
$PM2_CMD list
echo ""
echo "Useful PM2 commands:"
if [ "$PM2_CMD" = "pm2" ]; then
    echo "  pm2 list              - Show all running processes"
    echo "  pm2 logs dshub - View application logs"
    echo "  pm2 monit             - Monitor CPU/Memory usage"
    echo "  pm2 restart dshub - Restart application"
    echo "  pm2 stop dshub    - Stop application"
    echo "  pm2 start dshub   - Start application"
    echo ""
    echo "To configure auto-start on system boot (optional):"
    echo "  pm2 startup           - Generate startup script"
    echo "  pm2 save              - Save process list"
else
    echo "  npx pm2 list              - Show all running processes"
    echo "  npx pm2 logs dshub - View application logs"
    echo "  npx pm2 monit             - Monitor CPU/Memory usage"
    echo "  npx pm2 restart dshub - Restart application"
    echo "  npx pm2 stop dshub    - Stop application"
    echo "  npx pm2 start dshub   - Start application"
    echo ""
    echo "To install PM2 globally (optional):"
    echo "  sudo npm install -g pm2"
fi
echo ""
echo "Access DSHub at: http://localhost:3001"
echo "(Server runs on port 3002, client served on port 3001)"
echo ""
