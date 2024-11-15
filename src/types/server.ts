import dnsPacket from 'dns-packet';
import { Connection } from '../common/network';
import { CombineFlags, RCode } from '../common/core/utils';
import { SupportedAnswer, SupportedQuestion } from '../types/dns';
import { TypedEventEmitter } from '../common/core/events';

/**
 * The NextFunction type is a callback function that is used to pass control to the next middleware.
 * It is generally bound by the router to the next handler in the stack, or the default handler if no
 * other handlers are available.
 *
 * @param err An optional error object that can be passed to the next middleware.
 */
export interface NextFunction {
  (err?: Error): void;
}

/**
 * The Handler type is a callback function used to process requests and responses in the server.
 * Handlers provide access to the request and response objects, as well as the next function in the
 * middleware stack, allowing for flexible and modular request handling.
 *
 * @example
 * ```ts
 * // A no-op handler that passes control to the next middleware.
 * (req, res, next) => {
 *  next();
 * }
 * ```
 */
export interface Handler {
  (req: DNSRequest, res: DNSResponse, next: NextFunction): void;
}

/**
 * A custom error class that is thrown when an attempt is made to modify a response
 * packet after it has been sent.
 */
export class ModifiedAfterSentError extends Error {
  constructor() {
    super('Cannot modify response after it has been sent');
  }
}

/**
 * A custom error class that is thrown when an attempt is made to send an
 * answer for an already-resolved query.
 *
 * Attempting to resolve a query with more than one answer is disallowed as there is
 * no way to handle this behavior in the DNS protocol.
 */
export class DuplicateAnswerForRequest extends Error {
  constructor() {
    super('Cannot send more than one answer for an already-resolved query');
  }
}

/**
 * The packet wrapper class is intended to solve a couple of problems with the provided `Packet type
 * from `dns-packet`.
 *
 * The first is that there's currently no way to provide a read-only view of the packet, which is
 * essential for ensuring that the packet is not modified after it has been sent.
 *
 * The second is that many of the properties of the packet are optional, which leads to some awkward
 * type assertions when using the raw packet. For example, any time you want to access the `answers`
 * property, you have to assert that it's not `undefined` or `null`, despite the fact that we can set
 * it to an empty array if it's not provided. Likewise, `questions` in practice should never be
 * undefined, though it could of course be an empty array.
 *
 * This class is not generic because it heavily relies on the structure of the `Packet` type from
 * `dns-packet`. If the `Packet` type changes, this class will need to be updated.
 */
export class PacketWrapper {
  /** The raw DNS packet */
  raw: dnsPacket.Packet;

  /** A flag to indicate whether the packet has been sent and is therefore frozen */
  frozen: boolean = false;

  /**
   * Create a new packet wrapper.
   * @param packet The raw DNS packet
   */
  constructor(packet: dnsPacket.Packet) {
    this.raw = packet;
  }

  get id(): number {
    return this.raw.id || 0;
  }

  get type(): dnsPacket.Packet['type'] {
    return this.raw.type;
  }

  set type(type: dnsPacket.Packet['type']) {
    if (this.frozen) {
      throw new ModifiedAfterSentError();
    }
    this.raw.type = type;
  }

  get flags(): number {
    return this.raw.flags || 0;
  }

  set flags(flags: number) {
    if (this.frozen) {
      throw new ModifiedAfterSentError();
    }
    this.raw.flags = flags;
  }

  get questions(): ReadonlyArray<SupportedQuestion> {
    return (this.raw.questions as ReadonlyArray<SupportedQuestion>) || [];
  }

  set questions(questions: dnsPacket.Question[]) {
    if (this.frozen) {
      throw new ModifiedAfterSentError();
    }
    this.raw.questions = questions;
  }

  get answers(): ReadonlyArray<SupportedAnswer> {
    return (this.raw.answers as ReadonlyArray<SupportedAnswer>) || [];
  }

  set answers(answers: SupportedAnswer[]) {
    if (this.frozen) {
      throw new ModifiedAfterSentError();
    }
    this.raw.answers = answers;
  }

  get additionals(): ReadonlyArray<dnsPacket.Answer> {
    return (this.raw.additionals || []) as ReadonlyArray<dnsPacket.Answer>;
  }

  set additionals(additionals: dnsPacket.Answer[]) {
    if (this.frozen) {
      throw new ModifiedAfterSentError();
    }
    this.raw.additionals = additionals;
  }

  get authorities(): ReadonlyArray<dnsPacket.Answer> {
    return (this.raw.authorities || []) as ReadonlyArray<dnsPacket.Answer>;
  }

  set authorities(authority: dnsPacket.Answer[]) {
    if (this.frozen) {
      throw new ModifiedAfterSentError();
    }
    this.raw.authorities = authority;
  }

  /**
   * Create a copy of the packet wrapper.
   * @returns A copy of the packet wrapper
   */
  copy(): PacketWrapper {
    const newRawPacket = {
      ...this.raw,
    };
    return new PacketWrapper(newRawPacket);
  }

  /**
   * Freeze the packet wrapper immutably, making it read-only.
   * This is used to prevent modifications to the packet after it has been sent.
   * Note that this method does not modify the current packet wrapper, but instead returns a new
   * frozen packet wrapper.
   *
   * @returns The frozen packet wrapper
   */
  freeze(): PacketWrapper {
    const copy = this.copy();
    copy.frozen = true;

    Object.freeze(copy);
    Object.freeze(copy.raw.type);
    Object.freeze(copy.raw.flags);
    Object.freeze(copy.raw.questions);
    Object.freeze(copy.raw.answers);
    Object.freeze(copy.raw.additionals);
    Object.freeze(copy);

    return copy;
  }
}

/**
 * The timings object that is included in the metadata for requests and responses.
 */
export interface Timings {
  /** The time of the request in milliseconds */
  requestTimeMs?: number;
  /** The time of the request in nanoseconds */
  requestTimeNs?: bigint;
  /** The time of the response in milliseconds */
  responseTimeMs?: number;
  /** The time of the response in nanoseconds */
  responseTimeNs?: bigint;
}

/**
 * The metadata object that is attached to every request and response.
 * It contains data about the request or response, such as high-resolution timing information.
 */
export interface MessageMetadata {
  ts: Timings;
}

export interface DNSResponseEvents {
  answer: DNSResponse;
  done: DNSResponse;
}

/**
 * Default class representing a DNS Response.
 *
 * DNS Responses contain the serialized packet data, and data about the connection.
 */
export class DNSResponse extends TypedEventEmitter<DNSResponseEvents> {
  /** The packet wrapper containing the raw DNS packet */
  packet: PacketWrapper;

  /** The connection object representing the client connection */
  readonly connection: Connection;

  /** A flag to indicate whether the response has been sent */
  private fin: boolean = false;

  /** The metadata object for the response */
  metadata: MessageMetadata;

  /** Any extra data that can be attached to the response.
   * Handlers should use this object to attach any extra metadata if desired */
  extra: object | undefined;

  constructor(packet: dnsPacket.Packet, connection: Connection, metadata?: MessageMetadata) {
    super();
    this.packet = new PacketWrapper(packet);
    this.connection = connection;

    this.metadata = metadata || {
      ts: {},
    };
  }

  /**
   * Send the response as-is without any modifications and mark the response as finished.
   *
   * This method should not be called by any handlers, as it is intended to be used internally
   * by the server to send responses.
   *
   * For an end-user facing method to accomplish the same effect, see {@link DNSResponse.resolve}
   */
  protected done(): void {
    this.packet = this.packet.freeze();
    this.fin = true;
    this.emit('answer', this);
  }

  get finished() {
    return this.fin;
  }

  /**
   * Send an answer or answers in the response. This method overrides any data
   * that was previously set in the answers section of the DNS packet with the provided answer.
   *
   * @param answer The answer or answers to send in the response.
   *
   * @see [Docs](https://dinodns.dev/core-library/requests_and_responses#resanswer)
   */
  answer(answer: SupportedAnswer | SupportedAnswer[]): void {
    if (this.fin) {
      throw new DuplicateAnswerForRequest();
    }

    if (Array.isArray(answer)) {
      this.packet.answers = answer;
    } else {
      this.packet.answers = [answer];
    }

    this.done();
  }

  /**
   * Resolve the response with the data that has been set in the packet. This method
   * should be called whenever the server has made direct modifications to the packet
   * and wants to send the response to the client directly as-is.
   *
   * @see [Docs](https://dinodns.dev/core-library/requests_and_responses#resresolve)
   */
  resolve(): void {
    if (this.fin) {
      throw new DuplicateAnswerForRequest();
    }

    this.done();
  }

  /**
   * Helper object that contains a set of common error responses that can be sent to the client.
   *
   * Calling any of these errors will set the appropriate RCode in the DNS packet and send the response.
   *
   * @see [Docs](https://dinodns.dev/core-library/requests_and_responses/#error-responses)
   */
  errors = {
    nxDomain: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.NX_DOMAIN]);
      this.done();
    },
    serverFailure: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.SERVER_FAILURE]);
      this.done();
    },
    refused: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.FORMAT_ERROR]);
      this.done();
    },
    notImplemented: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.NOT_IMPLEMENTED]);
      this.done();
    },
  };

  /**
   * Return an object representing the data contained in the response.
   *
   * @returns The data object containing the packet, connection, and metadata.
   */
  data() {
    return {
      packet: this.packet.raw,
      connection: this.connection,
      metadata: this.metadata,
      ...(this.extra ? { extra: this.extra } : {}),
    };
  }
}

/**
 * A trait that defines an object (typically a request object)
 * that can be converted to a DNS answer object.
 */
export interface CanAnswer<T> {
  toAnswer(): T;
}

/**
 * Default class representing a DNS Request.
 *
 * DNS Requests contain the serialized packet data, and data about the connection.
 *
 */
export class DNSRequest implements CanAnswer<DNSResponse> {
  readonly packet: PacketWrapper;

  /** The connection object representing the client connection */
  connection: Connection;

  /** The metadata object for the response */
  metadata: MessageMetadata;

  /** Any extra data that can be attached to the request.
   * Handlers should use this object to attach any extra metadata if desired */
  extra: object | undefined;

  constructor(packet: dnsPacket.Packet, connection: Connection) {
    this.packet = new PacketWrapper(packet);
    this.connection = connection;

    this.metadata = {
      ts: {
        requestTimeMs: Date.now(),
        requestTimeNs: process.hrtime.bigint(),
      },
    };
  }

  /**
   * Return a new DNSResponse object that contains a DNS packet response equivalent to the request.
   *
   * @returns A DNSResponse object that can be used to send a response to the client.
   */
  toAnswer(): DNSResponse {
    const newPacket: dnsPacket.Packet = {
      ...this.packet.raw,
      type: 'response',
    };
    return new DNSResponse(newPacket, this.connection, this.metadata);
  }

  /**
   * Return an object representing the data contained in the request.
   *
   * @returns The data object containing the packet, connection, and metadata.
   */
  data() {
    return {
      packet: this.packet.raw,
      connection: this.connection,
      metadata: this.metadata,
      ...(this.extra ? { extra: this.extra } : {}),
    };
  }
}
