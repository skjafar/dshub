import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { DeviceScanner } from './services/DeviceScanner';
import { DeviceCommunicator } from './services/DeviceCommunicator';
import { Logger } from './utils/Logger';
import { ServerToClientEvents, ClientToServerEvents, InterfaceType, ControlInterfaceState, DEFAULT_TCP_PORT, DEFAULT_UDP_PORT } from '../shared/types';

// Server-wide registry of active device connections keyed by "ip:port".
// Prevents multiple browser tabs from connecting to the same device endpoint.
const activeConnections = new Set<string>();

function deviceKey(ip: string, interfaceType: InterfaceType): string {
  const port = interfaceType === InterfaceType.TCP ? DEFAULT_TCP_PORT : DEFAULT_UDP_PORT;
  return `${ip}:${port}`;
}

const app = express();
const server = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST']
  }
});

const logger = Logger.getInstance();
const deviceScanner = new DeviceScanner();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP for development
}));
app.use(cors());
app.use(express.json());

// Serve static files in production
const clientBuildPath = path.join(__dirname, '../../client/build');
const isProduction = process.env.NODE_ENV === 'production' || !process.env.NODE_ENV;

logger.info(`Client build path: ${clientBuildPath}`);
logger.info(`Is production mode: ${isProduction}`);

if (isProduction) {
  logger.info('Setting up static file serving...');
  app.use(express.static(clientBuildPath));
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  const deviceCommunicator = new DeviceCommunicator();

  // Helper to wrap handlers with error handling
  const wrapHandler = <T extends any[]>(eventName: string, handler: (...args: T) => void) => {
    return (...args: T) => {
      try {
        handler(...args);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error in ${eventName} handler: ${errorMessage}`);
        socket.emit('logEntry', {
          level: 'error',
          category: 'connection',
          message: `${eventName} failed: ${errorMessage}`,
          timestamp: Date.now()
        });
      }
    };
  };

  // Device scanning
  socket.on('startScan', wrapHandler('startScan', () => {
    logger.info('Starting device scan');
    deviceScanner.startScan((device) => {
      socket.emit('deviceDiscovered', device);
    }, () => {
      socket.emit('scanComplete');
    });
  }));

  // Track the key claimed by this socket so it can be released on disconnect
  let claimedKey: string | null = null;

  // Device connection
  socket.on('connectDevice', wrapHandler('connectDevice', (ip, interfaceType, deviceName) => {
    const key = deviceKey(ip, interfaceType);

    if (activeConnections.has(key)) {
      logger.error(`Connection refused: ${key} is already in use by another session`);
      socket.emit('connectionStatus', {
        ip,
        port: interfaceType === InterfaceType.TCP ? DEFAULT_TCP_PORT : DEFAULT_UDP_PORT,
        interface: interfaceType,
        connected: false,
        controlState: ControlInterfaceState.UNDECIDED,
        ...(deviceName ? { deviceName } : {}),
      });
      socket.emit('logEntry', {
        level: 'error',
        category: 'connection',
        message: `Connection refused: ${key} is already connected in another tab`,
        timestamp: Date.now(),
      });
      return;
    }

    activeConnections.add(key);
    claimedKey = key;

    const displayName = deviceName ? `${deviceName} (${ip})` : ip;
    logger.info(`Connecting to device: ${displayName} via ${interfaceType}`);
    deviceCommunicator.connect(ip, interfaceType, (status) => {
      if (deviceName) {
        status.deviceName = deviceName;
      }
      // If the communicator reports disconnection, release the registry slot
      if (!status.connected && claimedKey) {
        activeConnections.delete(claimedKey);
        claimedKey = null;
      }
      socket.emit('connectionStatus', status);
    }, (register) => {
      socket.emit('registerUpdate', register);
    }, (parameter) => {
      socket.emit('parameterUpdate', parameter);
    }, (logEntry) => {
      socket.emit('logEntry', logEntry);
    });
  }));

  socket.on('disconnectDevice', wrapHandler('disconnectDevice', () => {
    logger.info('Disconnecting device');
    if (claimedKey) {
      activeConnections.delete(claimedKey);
      claimedKey = null;
    }
    deviceCommunicator.disconnect();
  }));

  socket.on('takeControl', wrapHandler('takeControl', () => {
    logger.info('Taking device control');
    deviceCommunicator.takeControl();
  }));

  // Register operations
  socket.on('readRegister', wrapHandler('readRegister', (data) => {
    const { address, name } = typeof data === 'object' ? data : { address: data, name: '' };
    deviceCommunicator.readRegister(address, name || '');
  }));

  socket.on('writeRegister', wrapHandler('writeRegister', (address, value) => {
    deviceCommunicator.writeRegister(address, value);
  }));

  // Parameter operations
  socket.on('readParameter', wrapHandler('readParameter', (data) => {
    const { address, name } = typeof data === 'object' ? data : { address: data, name: '' };
    deviceCommunicator.readParameter(address, name || '');
  }));

  socket.on('writeParameter', wrapHandler('writeParameter', (address, value) => {
    deviceCommunicator.writeParameter(address, value);
  }));

  // Plotting
  socket.on('startPlotting', wrapHandler('startPlotting', (data) => {
    const { registerName, pollInterval, address } = typeof data === 'object' ? data : { registerName: data, pollInterval: 50, address: 0 };
    console.log(`[Server] startPlotting received: registerName=${registerName}, pollInterval=${pollInterval}ms, address=${address}`);
    deviceCommunicator.startPlotting(registerName, pollInterval, address, (seriesName, point) => {
      socket.emit('plotData', seriesName, point);
    });
  }));

  socket.on('stopPlotting', wrapHandler('stopPlotting', (registerName) => {
    deviceCommunicator.stopPlotting(registerName);
  }));

  // Commands
  socket.on('sendCommand', wrapHandler('sendCommand', (command, value) => {
    deviceCommunicator.sendCommand(command, value);
  }));

  // Log settings
  socket.on('updateLogSettings', wrapHandler('updateLogSettings', (settings) => {
    logger.info('Received log settings update from client');
    deviceCommunicator.updateLogSettings(settings);
  }));

  // Forward log entries to client
  // Store cleanup function to prevent memory leak
  const removeLogCallback = logger.onLogEntry((entry) => {
    socket.emit('logEntry', entry);
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
    if (claimedKey) {
      activeConnections.delete(claimedKey);
      claimedKey = null;
    }
    deviceCommunicator.disconnect();
    removeLogCallback();
  });
});

// Catch-all handler for SPA routing - MUST come after Socket.IO setup
if (isProduction) {
  app.get('*', (_, res) => {
    logger.info('Serving index.html for SPA routing');
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3002;

server.listen(PORT, () => {
  logger.info(`DSHub server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});