# DSHub - PM2 Deployment Guide

This guide covers deploying DSHub using PM2, a production-grade process manager for Node.js applications.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [Linux/macOS](#linuxmacos)
  - [Windows](#windows)
- [Detailed Installation](#detailed-installation)
- [PM2 Management Commands](#pm2-management-commands)
- [Monitoring and Logs](#monitoring-and-logs)
- [Updating the Application](#updating-the-application)
- [Troubleshooting](#troubleshooting)
- [Windows-Specific Notes](#windows-specific-notes)
- [Uninstalling](#uninstalling)

---

## Prerequisites

### System Requirements

- **Operating System**: Linux (Ubuntu, Debian, CentOS, etc.), Windows 10/11, or macOS
- **Node.js**: Version 16.x or higher
- **NPM**: Comes with Node.js
- **Memory**: At least 1GB RAM recommended
- **Network**: Direct network access (not behind Docker NAT) for UDP broadcast device discovery

### Installing Node.js

#### Linux

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Verify installation
node --version
npm --version
```

#### Windows

Download and install Node.js from: https://nodejs.org/

Choose the LTS (Long Term Support) version. The installer includes NPM.

After installation, verify in Command Prompt or PowerShell:
```cmd
node --version
npm --version
```

#### macOS

```bash
# Using Homebrew (recommended)
brew install node

# Or download from https://nodejs.org/

# Verify installation
node --version
npm --version
```

---

## Quick Start

### Linux/macOS

For a quick deployment, simply run:

```bash
cd /path/to/dshub
./deploy-pm2.sh
```

### Windows

For a quick deployment, run in Command Prompt or PowerShell:

```cmd
cd C:\path\to\dshub
deploy-pm2.bat
```

### What the Script Does

The deployment script will:
1. Check if PM2 is installed (globally or locally)
2. If PM2 is not found, install it locally as a dev dependency (no root/sudo required)
3. Install all dependencies
3. Build client and server
4. Start the application with PM2
5. Configure auto-start on system reboot
6. Save the PM2 process list

The application will be accessible at:
- **Client UI**: http://localhost:3001
- **Server API**: http://localhost:3002

---

## Detailed Installation

### Step 1: Navigate to Project Directory

```bash
cd /path/to/dshub
```

### Step 2: Install PM2 (Optional - Auto-installed by script)

You have two options for PM2 installation:

**Option A: Let the deployment script install PM2 locally (Recommended - No sudo required)**

The deployment script will automatically install PM2 as a local dev dependency if it's not found. This avoids permission issues.

**Option B: Install PM2 globally (Optional)**

```bash
# Linux/macOS
sudo npm install -g pm2

# Windows (run as Administrator)
npm install -g pm2
```

Verify PM2 installation:

```bash
pm2 --version
# or if installed locally:
npx pm2 --version
```

### Step 3: Install Dependencies

```bash
# Server dependencies
npm install

# Client dependencies
cd client
npm install
cd ..
```

### Step 4: Build the Application

```bash
# Build client production bundle
cd client
npm run build
cd ..

# Build TypeScript server
npm run build
```

### Step 5: Start Application with PM2

```bash
pm2 start ecosystem.config.js
```

### Step 6: Save PM2 Process List

```bash
pm2 save
```

### Step 7: Configure Auto-Start on Boot

```bash
pm2 startup
```

This command will output a command that you need to run with `sudo`. Copy and execute that command. For example:

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u your-username --hp /home/your-username
```

After running the sudo command, save the process list again:

```bash
pm2 save
```

---

## PM2 Management Commands

### View All Running Processes

```bash
pm2 list
```

### Start the Application

```bash
pm2 start dshub
# or
pm2 start ecosystem.config.js
```

### Stop the Application

```bash
pm2 stop dshub
```

### Restart the Application

```bash
pm2 restart dshub
```

### Reload with Zero Downtime

```bash
pm2 reload dshub
```

### Delete from PM2

```bash
pm2 delete dshub
```

### View Detailed Information

```bash
pm2 show dshub
```

---

## Monitoring and Logs

### Real-time Monitoring Dashboard

```bash
pm2 monit
```

This displays a live dashboard with:
- CPU usage
- Memory usage
- Log output
- Process information

Press `Ctrl+C` to exit.

### View Logs

```bash
# Tail logs in real-time
pm2 logs dshub

# View last 100 lines
pm2 logs dshub --lines 100

# View only error logs
pm2 logs dshub --err

# View only standard output
pm2 logs dshub --out

# Clear all logs
pm2 flush
```

### Log File Locations

PM2 logs are stored in:
```
./logs/pm2-error.log  - Error output
./logs/pm2-out.log    - Standard output
```

Application-specific logs (from Winston logger):
```
./logs/error.log      - Error logs
./logs/combined.log   - All logs
```

### Process Statistics

```bash
# View process metrics
pm2 describe dshub

# View process memory usage
pm2 monit
```

---

## Updating the Application

### Using the Update Script (Recommended)

**Linux/macOS:**
```bash
./update-pm2.sh
```

**Windows:**
```cmd
update-pm2.bat
```

This script:
1. Optionally pulls latest changes from git
2. Updates dependencies
3. Rebuilds client and server
4. Reloads application with zero downtime

### Manual Update Process

**Linux/macOS:**
```bash
# 1. Pull latest changes (if using git)
git pull

# 2. Update dependencies
npm install
cd client && npm install && cd ..

# 3. Rebuild
cd client && npm run build && cd ..
npm run build

# 4. Reload with zero downtime
pm2 reload dshub
```

**Windows:**
```cmd
REM 1. Pull latest changes (if using git)
git pull

REM 2. Update dependencies
npm install
cd client
npm install
cd ..

REM 3. Rebuild
cd client
npm run build
cd ..
npm run build

REM 4. Reload with zero downtime
pm2 reload dshub
```

---

## Troubleshooting

### Permission Issues During Deployment

**Problem:** When running the deployment script, you're asked to use sudo, but this creates permission issues for all generated files and folders.

**Solution:** The deployment scripts now install PM2 locally as a dev dependency instead of globally, which avoids requiring root/sudo permissions.

If you previously installed PM2 globally with sudo and have permission issues:

```bash
# Fix file ownership (replace 'youruser' with your username)
sudo chown -R youruser:youruser /path/to/dshub

# Remove global PM2 installation (optional)
sudo npm uninstall -g pm2

# Run deployment script again (it will install PM2 locally)
./deploy-pm2.sh
```

When using locally installed PM2, prefix all PM2 commands with `npx`:
```bash
npx pm2 list
npx pm2 logs dshub
npx pm2 restart dshub
```

### Application Not Starting

**Check PM2 logs:**
```bash
pm2 logs dshub --lines 50
# or if PM2 is installed locally:
npx pm2 logs dshub --lines 50
```

**Check if port is already in use:**
```bash
sudo lsof -i :3002
sudo lsof -i :3001
```

**Restart PM2 daemon:**
```bash
pm2 kill
pm2 start ecosystem.config.js
```

### UDP Device Discovery Not Working

**Ensure running with proper network access:**
- PM2 runs as your user, which should have network access
- Check firewall rules allow UDP port 2011
- Verify network interfaces are up

```bash
# Check network interfaces
ip addr

# Test UDP port
sudo netstat -ulnp | grep 2011
```

### Application Crashes Repeatedly

**Check error logs:**
```bash
pm2 logs dshub --err --lines 100
```

**Check memory usage:**
```bash
pm2 monit
```

**Increase memory limit in `ecosystem.config.js`:**
```javascript
max_memory_restart: '1G'  // Increase from 500M
```

Then reload:
```bash
pm2 reload ecosystem.config.js
```

### Auto-Start Not Working After Reboot

**Re-run startup configuration:**
```bash
pm2 startup
# Execute the command it provides with sudo
pm2 save
```

**Verify startup script:**
```bash
# For systemd
systemctl status pm2-your-username
```

### Cannot Access from Other Computers

**Check server is listening on all interfaces:**
- The server should listen on `0.0.0.0` or specific IP, not just `localhost`

**Check firewall:**
```bash
# Ubuntu/Debian
sudo ufw status
sudo ufw allow 3001
sudo ufw allow 3002

# CentOS/RHEL
sudo firewall-cmd --list-all
sudo firewall-cmd --add-port=3001/tcp --permanent
sudo firewall-cmd --add-port=3002/tcp --permanent
sudo firewall-cmd --reload
```

---

## Windows-Specific Notes

### Important: Using `call` with Batch Commands

**CRITICAL for Windows:** When running PM2 commands from batch files or Command Prompt, you must use `call` before `npm`, `npx`, or `pm2` commands to ensure they execute properly:

```cmd
REM Correct - with call
call npm install
call npx pm2 list
call pm2 start ecosystem.config.js

REM Incorrect - without call (will fail or not return properly)
npm install
npx pm2 list
pm2 start ecosystem.config.js
```

The deployment scripts automatically include `call`, so this is handled for you when using `deploy-pm2.bat` or `update-pm2.bat`.

### Auto-Start on Windows Boot

PM2's standard `pm2 startup` command is designed for Linux/macOS. For Windows, use **pm2-windows-startup**:

```cmd
npm install -g pm2-windows-startup
call pm2-startup install
```

This creates a Windows service that starts PM2 on boot.

### Windows Firewall

When you first run the application, Windows Firewall may prompt you to allow Node.js network access. You must allow this for:
- UDP broadcast (device discovery on port 2011)
- TCP connections (server on port 3002, client on port 3001)

To manually configure Windows Firewall:

```cmd
REM Allow Node.js through firewall (run as Administrator)
netsh advfirewall firewall add rule name="DSHub Server" dir=in action=allow protocol=TCP localport=3002
netsh advfirewall firewall add rule name="DSHub Client" dir=in action=allow protocol=TCP localport=3001
netsh advfirewall firewall add rule name="DSHub Discovery" dir=in action=allow protocol=UDP localport=2011
```

### Checking Port Usage on Windows

```cmd
REM Check if ports are in use
netstat -ano | findstr :3001
netstat -ano | findstr :3002
netstat -ano | findstr :2011
```

### PowerShell Execution Policy

If running scripts in PowerShell, you may need to adjust the execution policy:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Long Path Support

If you encounter "path too long" errors during npm install, enable long path support:

```cmd
REM Run as Administrator
reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f
```

Then restart your terminal.

### Running PM2 as Windows Service

For production Windows deployments, consider running PM2 as a Windows service using **pm2-windows-service**:

```cmd
npm install -g pm2-windows-service
pm2-service-install
```

This provides better integration with Windows service management.

---

## Uninstalling

### Remove Application from PM2

```bash
pm2 stop dshub
pm2 delete dshub
pm2 save
```

### Remove PM2 Startup Script

```bash
pm2 unstartup systemd
```

### Uninstall PM2 (Optional)

```bash
npm uninstall -g pm2
```

### Remove Application Files

```bash
cd /path/to/dshub
cd ..
rm -rf dshub
```

---

## Advanced Configuration

### Environment Variables

Edit `ecosystem.config.js` to add custom environment variables:

```javascript
env: {
  NODE_ENV: 'production',
  PORT: 3002,
  CUSTOM_VAR: 'value'
}
```

### Multiple Environments

```javascript
env_production: {
  NODE_ENV: 'production',
  PORT: 3002
},
env_development: {
  NODE_ENV: 'development',
  PORT: 3003
}
```

Start with specific environment:
```bash
pm2 start ecosystem.config.js --env production
pm2 start ecosystem.config.js --env development
```

### Process Limits

Edit `ecosystem.config.js`:

```javascript
{
  max_memory_restart: '1G',    // Restart if memory exceeds 1GB
  max_restarts: 10,             // Max restarts within min_uptime
  min_uptime: '10s',            // Min uptime before considering stable
  restart_delay: 4000           // Delay between restarts (ms)
}
```

---

## Comparison with Other Deployment Methods

| Feature | PM2 | Systemd | Docker |
|---------|-----|---------|--------|
| Ease of Setup | Easy | Medium | Complex |
| Monitoring | Excellent | Limited | Medium |
| Log Management | Built-in | journalctl | Docker logs |
| Zero-downtime Updates | Yes | No | Yes (with orchestration) |
| Resource Overhead | ~50MB | Minimal | ~100MB+ |
| UDP Broadcast Support | Native | Native | Requires host network |
| Auto-restart | Yes | Yes | Yes |
| Cross-platform | Yes | Linux only | Yes |

---

## Support and Resources

- **PM2 Documentation**: https://pm2.keymetrics.io/docs/usage/quick-start/
- **PM2 GitHub**: https://github.com/Unitech/pm2
- **DSHub Repository**: [Your repo URL]

---

## Summary

PM2 provides an excellent balance of ease-of-use and production-ready features for deploying DSHub:

**Advantages:**
- Simple deployment with `./deploy-pm2.sh`
- Built-in monitoring and logging
- Zero-downtime updates with `pm2 reload`
- Auto-restart on crashes
- Auto-start on system reboot
- No root/sudo required for daily operations

**Key Commands to Remember:**

**Linux/macOS:**
```bash
./deploy-pm2.sh        # Initial deployment
./update-pm2.sh        # Update application
pm2 logs dshub # View logs
pm2 monit              # Monitor resources
pm2 restart dshub # Restart application
```

**Windows:**
```cmd
deploy-pm2.bat         # Initial deployment
update-pm2.bat         # Update application
pm2 logs dshub # View logs
pm2 monit              # Monitor resources
pm2 restart dshub # Restart application
```

**Cross-Platform Compatibility:**
- DSHub works on Linux, Windows, and macOS
- PM2 provides consistent management across all platforms
- UDP broadcast device discovery works natively on all platforms
- Windows users should configure Windows Firewall for network access
- Use platform-specific deployment scripts (.sh for Linux/macOS, .bat for Windows)

Enjoy using DSHub with PM2!
