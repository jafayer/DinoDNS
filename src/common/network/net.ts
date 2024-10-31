import type { Serializer } from '../serializer';
import type { DNSResponse } from '../../types/server';

export interface NetworkHandler<T> {
  (data: T, connection: Connection): Promise<DNSResponse>;
}
/**
 * Network defines the interaction layer between the server and the network.
 * It is responsible for parsing incoming requests and serializing outgoing responses.
 *
 * The network interface is extensible to any network protocol, such as TCP, UDP, or HTTP.
 *
 * Network should define basic methods to handle incoming requests and send outgoing responses.
 */
export interface Network<T> {
  /** The type of network being used */
  networkType: SupportedNetworkType;

  /**
   * The serializer is responsible for encoding and decoding packets.
   * This is the piece of logic responsible for communicating directly with the wire format
   * for whatever network protocol is used by the network interface.
   */
  serializer: Serializer<T>;

  /**
   * Begin listening for incoming requests.
   *
   * The listen method should be able to effectively bootstrap the network interface
   * without accepting additional parameters. This is to support polymorphic startups
   * across a variety of network interfaces without needing to know the specifics of each.
   *
   * For example, some network interfaces may bind an array of ports, while others
   * may bind to a single port and address. The `listen` method should be able to simply call
   * without needing to know the specifics of the network interface.
   *
   * @param callback The callback to call when the network interface is ready to receive requests
   */
  listen(callback?: () => void): void;

  /**
   * Closes the network interface.
   */
  close(): void;

  /**
   * The handler is responsible for processing incoming requests and sending outgoing responses.
   */
  handler?: NetworkHandler<T>;

  /**
   * Passes the listener to the underlying network interface which may be an event emitter.
   *
   * @param event The event to subscribe to
   * @param listener The listener to call when the event is emitted
   */
  on(event: string, listener: () => void): void;

  /**
   * Removes the listener from the underlying network interface.
   *
   * @param event The event to unsubscribe from
   * @param listener The listener to remove
   */
  off(event: string, listener: () => void): void;
}

/**
 * The supported network types.
 */
export enum SupportedNetworkType {
  UDP = 'udp',
  TCP = 'tcp',
  HTTP = 'http',
}

/**
 * Connection represents a connection to a network interface.
 */
export interface Connection {
  /** The remote address of the connection */
  remoteAddress: string;

  /** The remote port of the connection */
  remotePort: number;

  /** The type of network being used */
  type: SupportedNetworkType;
}
