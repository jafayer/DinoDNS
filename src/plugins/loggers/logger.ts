import { Handler } from '../../types/server';

export interface Logger {
  log(level: LogLevel, message: string): void;
  handler: Handler;
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}
