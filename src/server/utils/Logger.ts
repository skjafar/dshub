import winston from 'winston';
import { LogEntry } from '../../shared/types';

export class Logger {
  private static instance: Logger;
  private logger: winston.Logger;
  private logCallbacks: Array<(entry: LogEntry) => void> = [];

  private constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'devicemon-web' },
      transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
      ],
    });

    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public info(message: string): void {
    this.logger.info(message);
    this.notifyCallbacks('info', message);
  }

  public warning(message: string): void {
    this.logger.warn(message);
    this.notifyCallbacks('warning', message);
  }

  public error(message: string, error?: Error): void {
    this.logger.error(message, error);
    this.notifyCallbacks('error', message);
  }

  public success(message: string): void {
    this.logger.info(`✓ ${message}`);
    this.notifyCallbacks('success', message);
  }

  public onLogEntry(callback: (entry: LogEntry) => void): void {
    this.logCallbacks.push(callback);
  }

  private notifyCallbacks(level: LogEntry['level'], message: string): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now()
    };
    
    this.logCallbacks.forEach(callback => {
      try {
        callback(entry);
      } catch (error) {
        this.logger.error('Error in log callback:', error);
      }
    });
  }
}