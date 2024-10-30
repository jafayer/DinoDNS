import type { Serializer } from '../serializer';
import type { DNSResponse } from '../server';

export interface NetworkHandler<T> {
  (data: T, connection: Connection): Promise<DNSResponse>;
}
/**
 * Network defines the interaction layer between the server and the network.
 * It is responsible for parsing incoming requests and serializing outgoing responses.
 *
 * The network interface is extensible to any network protocol, such as TCP, UDP, or HTTP.
 *
 * Network should define basic methods to handle
 */
export interface Network<T> {
  address: string;
  port: number;
  networkType: SupportedNetworkType;

  serializer: Serializer<T>;
  listen(address?: string, port?: number, callback?: () => void): void;
  close(): void;
  handler?: NetworkHandler<T>;

  on(event: string, listener: () => void): void;
  off(event: string, listener: () => void): void;
}

export enum SupportedNetworkType {
  UDP = 'udp',
  TCP = 'tcp',
  HTTP = 'http',
}

export interface Connection {
  remoteAddress: string;
  remotePort: number;
  type: SupportedNetworkType;
}
