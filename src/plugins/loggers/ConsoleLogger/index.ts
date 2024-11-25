import { Logger, LogLevel } from '../logger';
import { DNSRequest, DNSResponse, NextFunction } from '../../../types/server';

export type ConsoleLoggerProps = {
  logRequests?: boolean;
  logResponses?: boolean;
  replacer?: LogReplacer;
};

export class ConsoleLogger implements Logger {
  public logRequests: boolean;
  public logResponses: boolean;
  public replacer: LogReplacer;

  constructor({
    logRequests = true,
    logResponses = true,
    replacer = new DefaultReplacer({ format: DEFAULT_LOG_FORMAT }),
  }: ConsoleLoggerProps = {}) {
    this.logRequests = logRequests;
    this.logResponses = logResponses;
    this.replacer = replacer;

    this.handler = this.handler.bind(this);
  }

  register(res: DNSResponse): void {
    res.once('done', () => {
      this.log(LogLevel.INFO, this.replacer.replace(res));
    });
  }
  handler(req: DNSRequest, res: DNSResponse, next: NextFunction): void {
    if (this.logRequests) {
      this.log(LogLevel.INFO, this.replacer.replace(req));
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

export interface LogReplacer {
  replace(req: DNSRequest | DNSResponse): string;
}

export const DEFAULT_LOG_FORMAT = `{remote}:{port}-> - {operation} {id} "{type} {class} {name} {proto}" {rcode} {rflags} {duration}s`;

/**
 * Replacer is a class that replaces placeholders in a string with values from a DNSRequest or DNSResponse.
 * The replacerMap is a map of keys to functions that take a DNSRequest or DNSResponse and return a string.
 * 
 * The default log format replaces the following keys:
 *  - remote: The remote address of the connection
 *  - port: The remote port of the connection
 *  - operation: The operation being performed (query or response)
 *  - id: The ID of the packet
 *  - type: The rrtype of the question
 *  - class: The rrclass of the question
 *  - name: The name of the question
 *  - proto: The protocol being used (UDP, TCP, DoH, etc.)
 *  - rcode: The response code of the packet
 *  - rflags: The flags of the packet, comma-separated
 *  - duration: The duration of the request in seconds (only available for responses)
 * 
 * You may customize this format by providing a different format string to the constructor.
 * If you use keys not in the replacerMap, you will need to provide a custom replacer function for that key
 * or it will not be replaced.
 * 
 * You may also provide any custom class that satisifes the replacer interface's replace method.
 */
export class DefaultReplacer implements LogReplacer {
  public format: string;
  public replacerMap: { [key: string]: Function } = {
    remote: (req: DNSRequest | DNSResponse) => req.connection.remoteAddress,
    port: (req: DNSRequest | DNSResponse) => req.connection.remotePort,
    id: (req: DNSRequest | DNSResponse) => req.packet.id,
    type: (req: DNSRequest | DNSResponse) => req.packet.questions![0].type,
    class: (req: DNSRequest | DNSResponse) => req.packet.questions![0].class,
    name: (req: DNSRequest | DNSResponse) => req.packet.questions![0].name,
    proto: (req: DNSRequest | DNSResponse) => req.connection.type,
    rcode: (req: DNSRequest | DNSResponse) => (req instanceof DNSRequest ? '--' : req.packet.rcode),
    rflags: (req: DNSRequest | DNSResponse) => req.packet.flagsArray.join(','),
    duration: (req: DNSRequest | DNSResponse) =>
      req.metadata.ts.requestTimeNs && req.metadata.ts.responseTimeNs
        ? (Number(req.metadata.ts.responseTimeNs) - Number(req.metadata.ts.requestTimeNs)) / 1e9 // convert to seconds
        : '--',
    operation: (req: DNSRequest | DNSResponse) => req.packet.type,
  };
  constructor({ format = DEFAULT_LOG_FORMAT }: { format: string }) {
    this.format = format;
  }

  public replace(req: DNSRequest | DNSResponse): string {
    let result = this.format;
    for (const key in this.replacerMap) {
      result = result.replace(`{${key}}`, this.default(key, req));
    }
    return result;
  }

  default(key: string, req: DNSRequest | DNSResponse): string {
    try {
      const value = this.replacerMap[key](req);
      if (value === undefined || value === null) {
        return '--';
      }
      return value;
    } catch (e) {
      return '--';
    }
  }
}
