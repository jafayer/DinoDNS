import { Logger, LogLevel } from '../logger';
import { DNSRequest, DNSResponse, NextFunction } from '../../../types/server';

export class ConsoleLogger implements Logger {
  constructor(
    private logRequests: boolean = true,
    private logResponses: boolean = true,
  ) {}

  register(res: DNSResponse): void {
    res.once('done', () => {
      if (res.packet.answers.length > 0) {
        console.log(
          `[ANSWER] ${res.packet.answers[0].name} ${res.packet.answers[0].type} ${JSON.stringify(res.packet.answers[0].data)} (took ${Number(res.metadata.ts.responseTimeNs! - res.metadata.ts.requestTimeNs!) / 1000}µs)`,
        );
      }
    });
  }
  handler(req: DNSRequest, res: DNSResponse, next: NextFunction): void {
    if (this.logRequests) {
      console.log(
        `[QUESTION] ${req.packet.questions![0].name} ${req.packet.questions![0].type} ${req.connection.remoteAddress}`,
      );
    }

    if (this.logResponses) {
      this.register(res);
    }

    next();
  }

  log(level: LogLevel, message: string): void {
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(this.format(level, message));
        break;
      case LogLevel.INFO:
        console.info(this.format(level, message));
        break;
      case LogLevel.WARN:
        console.warn(this.format(level, message));
        break;
      case LogLevel.ERROR:
        console.error(this.format(level, message));
        break;
      default:
        console.log(this.format(level, message));
    }
  }

  error(message: string): void {
    this.log(LogLevel.ERROR, message);
  }

  warn(message: string): void {
    this.log(LogLevel.WARN, message);
  }

  debug(message: string): void {
    this.log(LogLevel.DEBUG, message);
  }

  info(message: string): void {
    this.log(LogLevel.INFO, message);
  }

  private format(level: LogLevel, message: string): string {
    return `[${level}] ${message}`;
  }
}
