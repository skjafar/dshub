import winston from 'winston';
import { LogEntry, LogCategory } from '../../shared/types';

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
      defaultMeta: { service: 'dshub' },
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

  public info(message: string, category: LogCategory = 'connection'): void {
    this.logger.info(message);
    this.notifyCallbacks('info', category, message);
  }

  public warning(message: string, category: LogCategory = 'connection'): void {
    this.logger.warn(message);
    this.notifyCallbacks('warning', category, message);
  }

  public error(message: string, category: LogCategory = 'connection', error?: Error): void {
    this.logger.error(message, error);
    this.notifyCallbacks('error', category, message);
  }

  public success(message: string, category: LogCategory = 'connection'): void {
    this.logger.info(`✓ ${message}`);
    this.notifyCallbacks('success', category, message);
  }

  /**
   * Register a callback to be notified of log entries.
   * Returns a cleanup function to remove the callback.
   * IMPORTANT: Always call the cleanup function to prevent memory leaks.
   *
   * @param callback Function to call when log entry is created
   * @returns Cleanup function that removes the callback
   */
  public onLogEntry(callback: (entry: LogEntry) => void): () => void {
    this.logCallbacks.push(callback);

    // Return cleanup function to remove this callback
    return () => {
      const index = this.logCallbacks.indexOf(callback);
      if (index > -1) {
        this.logCallbacks.splice(index, 1);
      }
    };
  }

  private notifyCallbacks(level: LogEntry['level'], category: LogCategory, message: string): void {
    const entry: LogEntry = {
      level,
      category,
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