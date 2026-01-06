# DeviceMon Web

A modern, professional web application for monitoring and controlling embedded devices via TCP/UDP protocols. Built with React, TypeScript, and Node.js.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.7.3-blue.svg)

## Features

- 🔍 **Auto-Discovery** - UDP broadcast scan finds devices automatically
- 🌐 **Dual Protocol** - Connect via TCP or UDP with seamless switching
- 📊 **Real-Time Plotting** - Live charting with configurable poll intervals
- 📝 **Register/Parameter Management** - Read/write operations with validation
- 🎨 **Modern UI** - Material-UI design with dark/light themes
- 📱 **Responsive** - Works on desktop, tablet, and mobile
- 🔒 **Type-Safe** - Full TypeScript coverage
- ⚡ **Fast** - Vite-powered builds (5s vs 2-5min with CRA)

## Quick Start

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Python 3.6+ (for emulator only)

### Installation

#### Arch Linux (AUR)

```bash
# Using yay
yay -S devicemon-web

# Using paru
paru -S devicemon-web

# Start the service
sudo systemctl start devicemon-web
sudo systemctl enable devicemon-web

# Open in browser
xdg-open http://localhost:3002
```

See [aur/README.md](aur/README.md) for complete Arch Linux installation guide.

#### From Source

```bash
# Clone the repository
git clone <repository-url>
cd devicemon-web

# Install dependencies
npm install
cd client && npm install && cd ..
```

### Testing Without Hardware

Use the included Python emulator to test without physical devices:

```bash
# Terminal 1: Start emulator
cd emulator
./run_emulator.sh        # Linux/macOS
# or
run_emulator.bat         # Windows

# Terminal 2: Start application
cd ..
npm run dev              # Start both client and server
```

Open http://localhost:3000 and click "Scan for Devices"

### Development

```bash
# Start development servers (client + server)
npm run dev

# Or start individually
npm run dev:server       # Server only (port 3002)
npm run dev:client       # Client only (port 3000)
```

### Production Deployment

#### Option 1: PM2 (Recommended)

```bash
# Automated deployment
./deploy-pm2.sh          # Linux/macOS
# or
deploy-pm2.bat           # Windows

# Manual PM2 commands
npm run build            # Build both client and server
npx pm2 start ecosystem.config.js
```

#### Option 2: Systemd

```bash
npm run build
npm start                # Production server on port 3002
```

See [DEPLOYMENT-PM2.md](DEPLOYMENT-PM2.md) for detailed deployment instructions.

## Project Structure

```
devicemon-web/
├── client/              # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── contexts/    # React contexts
│   │   ├── maps/        # Register/parameter maps
│   │   ├── types/       # TypeScript types
│   │   └── utils/       # Utilities
│   ├── public/          # Static assets
│   └── build/           # Production build output
├── src/                 # Node.js backend
│   ├── server/          # Express + Socket.IO server
│   │   ├── services/    # Device scanner & communicator
│   │   └── utils/       # Logger and utilities
│   └── shared/          # Shared types between client/server
├── emulator/            # Python board emulator
│   ├── devicemon_emulator.py
│   └── README.md
├── dist/                # Compiled server
└── ecosystem.config.js  # PM2 configuration
```

## Core Components

### Frontend (Client)

| Component | Description |
|-----------|-------------|
| **DeviceMonContext** | Global state management for device connection and data |
| **SettingsContext** | User preferences, themes, and map profiles |
| **DiscoveryPanel** | UDP device scanning with auto-discovery |
| **RegisterPanel** | Read/write individual registers |
| **ParameterPanel** | Device parameter configuration |
| **PlotterPanel** | Single register real-time plotting |
| **MultiPlotPanel** | Multiple register plotting on single chart |
| **MapProfilesPanel** | Custom register/parameter map management |
| **ActivityLogPanel** | Comprehensive operation logging |

### Backend (Server)

| Service | Description |
|---------|-------------|
| **DeviceScanner** | UDP broadcast discovery protocol handler |
| **DeviceCommunicator** | TCP/UDP data communication with packet queuing |
| **Logger** | Categorized logging with configurable filtering |
| **Socket.IO Server** | Real-time WebSocket communication with clients |

### Emulator

| Feature | Description |
|---------|-------------|
| **Discovery Service** | Responds to UDP broadcast scans on port 2011 |
| **TCP/UDP Data** | Full protocol implementation (ports 2009/2011) |
| **Register Map** | 4 registers including auto-incrementing 1Hz counter |
| **Parameter Map** | 26 parameters including network settings |
| **Pure Python** | Zero external dependencies, cross-platform |

## Protocol

### Discovery Protocol (UDP Port 2011)

**Request (5 bytes):**
```
[0xDEADBEEF (4B, LE)] [0x01 (1B)]
```

**Response (variable):**
```
[0xDEADBEEF (4B)] [0x02 (1B)] [BoardType (1B)] [Firmware (2B)]
[BoardID (4B)] [IP (4B)] [TCPPort (2B)] [UDPPort (2B)]
[MAC (6B)] [Reserved (2B)] [Name (null-terminated)]
```

### Data Protocol (TCP/UDP)

**Packet Format (6 bytes):**
```
[Command (1B)] [Address (1B)] [Value (4B, signed LE)]
```

**Commands:**
- `1` - Read Register
- `2` - Write Register
- `3` - Read Parameter
- `4` - Write Parameter
- `5` - Take Control

## Configuration

### Environment Variables

Create `.env` in the root directory:

```bash
# Server configuration
PORT=3002

# Build optimizations
TSC_COMPILE_ON_ERROR=true
GENERATE_SOURCEMAP=false
```

Create `client/.env`:

```bash
# Server URL (optional - auto-detects if not set)
VITE_SERVER_URL=http://localhost:3002
```

### Map Profiles

Custom register/parameter maps can be loaded from:
- `client/public/maps/registers.map`
- `client/public/maps/parameters.map`
- `client/public/maps/boardtypes.map`

Format:
```c
// C-style comments supported
uint32_t    REGISTER_NAME;      // Register definition
int32_t     SIGNED_REGISTER;
float       FLOAT_REGISTER;
hex         HEX_VALUE;
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both client and server in development mode |
| `npm run dev:client` | Start Vite dev server (port 3000) |
| `npm run dev:server` | Start Node.js server with nodemon (port 3002) |
| `npm run build` | Build both client and server for production |
| `npm run build:client` | Build client only with Vite |
| `npm run build:server` | Compile TypeScript server |
| `npm start` | Start production server |
| `npm run clean` | Remove build artifacts |

## Performance

- **Build Time**: ~5 seconds (Vite)
- **Bundle Size**: ~910 KB (all chunks)
- **Dev Server Start**: <2 seconds
- **Hot Reload**: <100ms
- **Memory Usage**: ~75 MB (client runtime)
- **Max Plot Rate**: 100 Hz

## Technology Stack

**Frontend:**
- React 19.1.1
- TypeScript 5.7.3
- Vite 6.0.7
- Material-UI 7.3.2
- Chart.js 4.5.0
- Socket.IO Client 4.8.1

**Backend:**
- Node.js 18+
- Express 4.18.2
- Socket.IO 4.7.4
- TypeScript 5.7.3
- Winston 3.11.0 (logging)

**Development:**
- PM2 6.0.14 (process manager)
- ESLint 9.17.0
- Nodemon 3.1.9

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Troubleshooting

### Build Errors

**Out of Memory:**
```bash
export NODE_OPTIONS=--max-old-space-size=4096
npm run build
```

**TypeScript Errors:**
```bash
npm run clean
npm install
npm run build
```

### Connection Issues

**Cannot discover devices:**
- Check firewall allows UDP port 2011
- Ensure device and server on same network
- Verify device firmware is running

**Cannot connect to device:**
- Click "Take Control" after connecting
- Check firewall allows TCP port 2009 or UDP port 2011
- Verify device IP address

**WebSocket connection failed:**
- Ensure server is running on port 3002
- Check `VITE_SERVER_URL` in `client/.env`
- Verify no firewall blocking WebSocket connections

### Emulator Issues

**Emulator not discovered:**
```bash
# Check if emulator is running
ps aux | grep devicemon_emulator

# Check if ports are available
netstat -tuln | grep -E '2009|2011'

# Restart emulator
cd emulator
./run_emulator.sh
```

## Documentation

- [DEPLOYMENT-PM2.md](DEPLOYMENT-PM2.md) - Production deployment with PM2
- [emulator/README.md](emulator/README.md) - Board emulator documentation
- [VITE-MIGRATION.md](VITE-MIGRATION.md) - Vite migration details
- [QUICK_START.md](QUICK_START.md) - User guide

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Acknowledgments

Built with modern web technologies for professional embedded device monitoring.

---

**Need Help?** Check the documentation in the `docs/` folder or open an issue.
