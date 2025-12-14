import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
  CRITICAL = 4
}

export class Logger {
  private moduleName: string;
  private static fileStream: fs.WriteStream | null = null;
  private static currentLogLevel: LogLevel = LogLevel.INFO;

  constructor(moduleName: string) {
    this.moduleName = moduleName;
  }

  static setupLogging(numClients: number, cycles: number): string {
    const logsDir = 'logs';

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '_');
    const logFile = path.join(logsDir, `load_test_${numClients}clients_${cycles}cycles_${timestamp}.log`);

    Logger.fileStream = fs.createWriteStream(logFile, { flags: 'a' });

    return logFile;
  }

  static closeLogging(): void {
    if (Logger.fileStream) {
      Logger.fileStream.end();
      Logger.fileStream = null;
    }
  }

  static setLevel(level: LogLevel): void {
    Logger.currentLogLevel = level;
  }

  private log(level: LogLevel, levelName: string, message: string): void {
    if (level < Logger.currentLogLevel) {
      return;
    }

    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    const formattedMessage = `${timestamp} - ${this.moduleName} - ${levelName} - ${message}`;

    console.error(formattedMessage);

    if (Logger.fileStream) {
      Logger.fileStream.write(formattedMessage + '\n');
    }
  }

  debug(message: string): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message);
  }

  info(message: string): void {
    this.log(LogLevel.INFO, 'INFO', message);
  }

  warning(message: string): void {
    this.log(LogLevel.WARNING, 'WARNING', message);
  }

  error(message: string): void {
    this.log(LogLevel.ERROR, 'ERROR', message);
  }

  critical(message: string): void {
    this.log(LogLevel.CRITICAL, 'CRITICAL', message);
  }
}

export function getLogger(moduleName: string): Logger {
  return new Logger(moduleName);
}