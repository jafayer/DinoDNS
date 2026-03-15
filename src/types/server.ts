import type { Packet, Answer, Question } from '../types/dns';
import { Connection } from '../common/network';
import { CombineFlags, RCode } from '../common/core/utils';
import { SupportedAnswer, SupportedQuestion } from '../types/dns';
import { TypedEventEmitter } from '../common/core/events';
import {
  AUTHENTIC_DATA,
  AUTHORITATIVE_ANSWER,
  CHECKING_DISABLED,
  RECURSION_AVAILABLE,
  RECURSION_DESIRED,
  TRUNCATED_RESPONSE,
  parseQuestions,
  QR_MASK,
} from '../common/network/dns';
import { HasFlag } from '../common/core/utils';

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
 * The packet wrapper class solves several problems with raw DNS packet objects.
 *
 * **Zero-copy parsing**: When the wrapper is created from a raw wire-format
 * `Buffer` (e.g. when an incoming query arrives over UDP/TCP), header fields
 * such as `id` and `flags` are read directly from fixed buffer offsets without
 * allocating any intermediate JS objects.  The question section is parsed
 * lazily the first time `.questions` is accessed and the result is cached.
 *
 * **Read-only view**: The wrapper can be frozen after the response has been
 * sent so that any later mutation attempt throws a `ModifiedAfterSentError`.
 *
 * **Normalised API**: Optional properties of the raw packet (questions,
 * answers, …) are always exposed as non-nullable arrays so callers do not
 * need to handle `undefined`.
 */
export class PacketWrapper {
  /**
   * Primary wire-format buffer.  Present when the wrapper was created from
   * a raw incoming buffer.  Used as the zero-copy source for header reads.
   */
  private _buf: Buffer | null = null;

  // ── cached parsed fields (null = not yet read / not yet set) ──────────────
  private _id: number | null = null;
  private _type: 'query' | 'response' | null = null;
  private _flags: number | null = null;
  private _questions: SupportedQuestion[] | null = null;
  private _answers: SupportedAnswer[] = [];
  private _authorities: Answer[] = [];
  private _additionals: Answer[] = [];

  /** A flag to indicate whether the packet has been sent and is therefore frozen */
  frozen: boolean = false;

  /**
   * Create a new packet wrapper.
   *
   * @param source Either a plain `Packet` JS object (legacy /
   *   programmatically constructed) or a raw wire-format `Buffer` for
   *   zero-copy access.
   */
  constructor(source: Packet | Buffer) {
    if (Buffer.isBuffer(source)) {
      // Zero-copy path: keep the raw buffer; parse header fields on demand.
      this._buf = source;
    } else {
      // JS-object path: copy all fields out of the plain object.
      this._id = source.id ?? 0;
      this._type = source.type ?? 'query';
      this._flags = source.flags ?? 0;
      this._questions = (source.questions as SupportedQuestion[]) ?? [];
      this._answers = (source.answers as SupportedAnswer[]) ?? [];
      this._authorities = source.authorities ?? [];
      this._additionals = source.additionals ?? [];
    }
  }

  // ── header fields ──────────────────────────────────────────────────────────

  get id(): number {
    if (this._id !== null) return this._id;
    if (this._buf) return this._buf.readUInt16BE(0);
    return 0;
  }

  get type(): 'query' | 'response' {
    if (this._type !== null) return this._type;
    if (this._buf) return this._buf.readUInt16BE(2) & QR_MASK ? 'response' : 'query';
    return 'query';
  }

  set type(type: 'query' | 'response') {
    if (this.frozen) throw new ModifiedAfterSentError();
    this._type = type;
  }

  get flags(): number {
    if (this._flags !== null) return this._flags;
    if (this._buf) return this._buf.readUInt16BE(2);
    return 0;
  }

  get flagsArray(): string[] {
    const flags = this.flags;
    return [
      HasFlag(flags, 0x7fff) ? 'qr' : '',
      HasFlag(flags, AUTHORITATIVE_ANSWER) ? 'aa' : '',
      HasFlag(flags, TRUNCATED_RESPONSE) ? 'tc' : '',
      HasFlag(flags, RECURSION_DESIRED) ? 'rd' : '',
      HasFlag(flags, RECURSION_AVAILABLE) ? 'ra' : '',
      HasFlag(flags, AUTHENTIC_DATA) ? 'ad' : '',
      HasFlag(flags, CHECKING_DISABLED) ? 'cd' : '',
    ].filter(Boolean);
  }

  get rcode(): keyof typeof RCode {
    return RCode[this.flags & 0x000f] as keyof typeof RCode;
  }

  set rcode(rcode: RCode) {
    if (this.frozen) throw new ModifiedAfterSentError();

    if (!Object.values(RCode).includes(rcode)) {
      throw new Error('Invalid rcode');
    }

    // Clear the last 4 bits (rcode) and set the new rcode
    this._flags = CombineFlags([this.flags & 0xfff0, rcode]);
  }

  set flags(flags: number) {
    if (this.frozen) throw new ModifiedAfterSentError();
    this._flags = flags;
  }

  addFlag(flag: number) {
    if (this.frozen) throw new ModifiedAfterSentError();
    this._flags = this.flags | flag;
  }

  removeFlag(flag: number) {
    if (this.frozen) throw new ModifiedAfterSentError();
    this._flags = this.flags & ~flag;
  }

  // ── section arrays ─────────────────────────────────────────────────────────

  get questions(): ReadonlyArray<SupportedQuestion> {
    if (this._questions !== null) return this._questions;
    if (this._buf) {
      // Lazy zero-copy parse: read questions directly from the buffer.
      this._questions = parseQuestions(this._buf) as SupportedQuestion[];
    } else {
      // No buffer available and no cached questions – normalise to empty array.
      this._questions = [];
    }
    return this._questions;
  }

  set questions(questions: Question[]) {
    if (this.frozen) throw new ModifiedAfterSentError();
    this._questions = questions as SupportedQuestion[];
  }

  get answers(): ReadonlyArray<SupportedAnswer> {
    return this._answers;
  }

  set answers(answers: SupportedAnswer[]) {
    if (this.frozen) throw new ModifiedAfterSentError();
    this._answers = answers;
  }

  get additionals(): ReadonlyArray<Answer> {
    return this._additionals;
  }

  set additionals(additionals: Answer[]) {
    if (this.frozen) throw new ModifiedAfterSentError();
    this._additionals = additionals;
  }

  get authorities(): ReadonlyArray<Answer> {
    return this._authorities;
  }

  set authorities(authority: Answer[]) {
    if (this.frozen) throw new ModifiedAfterSentError();
    this._authorities = authority;
  }

  // ── legacy compatibility ───────────────────────────────────────────────────

  /**
   * Return the packet as a plain `Packet` JS object.
   *
   * This getter is provided for backward compatibility.  The returned object
   * is reconstructed from the internal state on every call, so consumers that
   * need to pass it to encoders should prefer calling the encoder directly
   * with the `PacketWrapper` instance via `encode(wrapper.raw)`.
   */
  get raw(): Packet {
    return {
      id: this.id,
      type: this.type,
      flags: this.flags,
      questions: this.questions as Question[],
      answers: this.answers as Answer[],
      authorities: this.authorities as Answer[],
      additionals: this.additionals as Answer[],
    };
  }

  // ── utilities ──────────────────────────────────────────────────────────────

  /**
   * Create a copy of the packet wrapper.
   * @returns A copy of the packet wrapper
   */
  copy(): PacketWrapper {
    // Copy by building a plain object from current state (materialises lazy fields)
    return new PacketWrapper(this.raw);
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

  constructor(packet: Packet | Buffer, connection: Connection, metadata?: MessageMetadata) {
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
    formatError: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.FORMAT_ERROR]);
      this.done();
    },
    serverFailure: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.SERVER_FAILURE]);
      this.done();
    },
    nxDomain: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.NX_DOMAIN]);
      this.done();
    },
    notImplemented: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.NOT_IMPLEMENTED]);
      this.done();
    },
    refused: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.REFUSED]);
      this.done();
    },
    yxDomain: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.YX_DOMAIN]);
      this.done();
    },
    yxRRSet: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.YX_RR_SET]);
      this.done();
    },
    notAuth: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.NOT_AUTH]);
      this.done();
    },
    notZone: () => {
      const flags = this.packet.flags || 0;
      this.packet.flags = CombineFlags([flags, RCode.NOT_ZONE]);
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

  constructor(packet: Packet | Buffer, connection: Connection) {
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
    const newPacket: Packet = {
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
