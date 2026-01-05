import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { DeviceScanner } from './services/DeviceScanner';
import { DeviceCommunicator } from './services/DeviceCommunicator';
import { Logger } from './utils/Logger';
import { ServerToClientEvents, ClientToServerEvents } from '../shared/types';

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
const deviceCommunicator = new DeviceCommunicator();

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

  // Device scanning
  socket.on('startScan', () => {
    logger.info('Starting device scan');
    deviceScanner.startScan((device) => {
      socket.emit('deviceDiscovered', device);
    }, () => {
      socket.emit('scanComplete');
    });
  });

  // Device connection
  socket.on('connectDevice', (ip, interfaceType, deviceName) => {
    const displayName = deviceName ? `${deviceName} (${ip})` : ip;
    logger.info(`Connecting to device: ${displayName} via ${interfaceType}`);
    deviceCommunicator.connect(ip, interfaceType, (status) => {
      // Add device name to connection status
      if (deviceName) {
        status.deviceName = deviceName;
      }
      socket.emit('connectionStatus', status);
    }, (register) => {
      socket.emit('registerUpdate', register);
    }, (parameter) => {
      socket.emit('parameterUpdate', parameter);
    }, (logEntry) => {
      socket.emit('logEntry', logEntry);
    });
  });

  socket.on('disconnectDevice', () => {
    logger.info('Disconnecting device');
    deviceCommunicator.disconnect();
  });

  socket.on('takeControl', () => {
    logger.info('Taking device control');
    deviceCommunicator.takeControl();
  });

  // Register operations
  socket.on('readRegister', (data) => {
    const { address, name } = typeof data === 'object' ? data : { address: data, name: undefined };
    deviceCommunicator.readRegister(address, name);
  });

  socket.on('writeRegister', (address, value) => {
    deviceCommunicator.writeRegister(address, value);
  });

  // Parameter operations
  socket.on('readParameter', (data) => {
    const { address, name } = typeof data === 'object' ? data : { address: data, name: undefined };
    deviceCommunicator.readParameter(address, name);
  });

  socket.on('writeParameter', (address, value) => {
    deviceCommunicator.writeParameter(address, value);
  });

  // Plotting
  socket.on('startPlotting', (data) => {
    const { registerName, pollInterval, address } = typeof data === 'object' ? data : { registerName: data, pollInterval: 250, address: 0 };
    deviceCommunicator.startPlotting(registerName, pollInterval, address, (seriesName, point) => {
      socket.emit('plotData', seriesName, point);
    });
  });

  socket.on('stopPlotting', (registerName) => {
    deviceCommunicator.stopPlotting(registerName);
  });

  // Commands
  socket.on('sendCommand', (command, value) => {
    deviceCommunicator.sendCommand(command, value);
  });

  // Log settings
  socket.on('updateLogSettings', (settings) => {
    logger.info('Received log settings update from client');
    deviceCommunicator.updateLogSettings(settings);
  });

  // Forward log entries to client
  logger.onLogEntry((entry) => {
    socket.emit('logEntry', entry);
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
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
  logger.info(`DeviceMon Web Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});