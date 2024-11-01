/**
 * Generic serializer for encoding and decoding DNS messages.
 *
 * Serializers expect networks to pass them a `Buffer` instance, and decode to an internal type T
 * that should match the internal data structure used within the server.
 */
export interface Serializer<T> {
  encode(packet: T): Buffer;
  decode(buffer: Buffer): T;
}
