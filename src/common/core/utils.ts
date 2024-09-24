export type Awaitable<T> = T | Promise<T>;

export enum RCode {
  NO_ERROR = 0x0000,
  FORMAT_ERROR = 0x0001,
  SERVER_FAILURE = 0x0002,
  NX_DOMAIN = 0x0003,
  NOT_IMPLEMENTED = 0x0004,
  REFUSED = 0x0005,
  YX_DOMAIN = 0x0006,
  YX_RR_SET = 0x0007,
  NOT_AUTH = 0x0008,
  NOT_ZONE = 0x0009,
}
/**
 * Per the [dns-packet docs](https://www.npmjs.com/package/dns-packet)
 *
 * > To use more than one flag bitwise-or them together
 *   `packet.RECURSION_DESIRED | packet.RECURSION_AVAILABLE`
 * > And to check for a flag use bitwise-and
 *   `message.flags & packet.RECURSION_DESIRED`
 * @param flags number[]
 * @returns number
 */
export function CombineFlags(flags: number[]): number {
  return flags.reduce((acc, flag) => acc | flag, 0);
}

/**
 * Checks for the presence of a flag in a set of flags.
 * @param flags
 * @param flag
 * @returns
 */
export function HasFlag(flags: number, flag: number): boolean {
    return (flags & flag) === flag;
}

export function getPacketFlags(buffer: Buffer): number {
    return buffer.readUInt16BE(2);
}

export function overrideId(buffer: Buffer, id: number): Buffer {
    const bufferCopy = Buffer.from(buffer);
    bufferCopy.writeUint16BE(id, 0);
    return bufferCopy;
}

export function overrideFlags(buffer: Buffer, flags: number): Buffer {
    const bufferCopy = Buffer.from(buffer);
    bufferCopy.writeUInt16BE(flags, 2);
    return bufferCopy;
}
