import dnsPacket from 'dns-packet';
import { Connection } from '../network';
import { CanAnswer } from '../serializer';
import { CombineFlags, RCode } from '../core/utils';
import { EventEmitter } from 'events';

export interface NextFunction {
  (err?: Error): void;
}

export interface Handler {
  (req: DNSRequest, res: DNSResponse, next: NextFunction): void;
}

export class ModifiedAfterSentError extends Error {
  constructor() {
    super('Cannot modify response after it has been sent');
  }
}

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
class PacketWrapper {
  raw: dnsPacket.Packet;
  frozen: boolean = false;

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

  get questions(): ReadonlyArray<dnsPacket.Question> {
    return this.raw.questions || [];
  }

  set questions(questions: dnsPacket.Question[]) {
    if (this.frozen) {
      throw new ModifiedAfterSentError();
    }
    this.raw.questions = questions;
  }

  get answers(): ReadonlyArray<dnsPacket.Answer> {
    return this.raw.answers || [];
  }

  set answers(answers: dnsPacket.Answer[]) {
    if (this.frozen) {
      throw new ModifiedAfterSentError();
    }
    this.raw.answers = answers || [];
  }

  get additionals(): ReadonlyArray<dnsPacket.Answer> {
    return this.raw.additionals || [];
  }

  set additionals(additionals: dnsPacket.Answer[]) {
    if (this.frozen) {
      throw new ModifiedAfterSentError();
    }
    this.raw.additionals = additionals || [];
  }

  copy(): PacketWrapper {
    return new PacketWrapper({ ...this.raw });
  }

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
 * Default class representing a DNS Response.
 *
 * DNS Responses contain the serialized packet data, and data about the connection.
 */
export class DNSResponse extends EventEmitter {
  packet: PacketWrapper;
  readonly connection: Connection;
  private fin: boolean = false;

  constructor(packet: dnsPacket.Packet, connection: Connection) {
    super();
    this.packet = new PacketWrapper(packet);
    this.connection = connection;
  }

  done(): void {
    this.packet = this.packet.freeze();
    this.emit('done', { ...this.packet.raw });
    this.fin = true;
  }

  get finished() {
    return this.fin;
  }

  answer(answer: dnsPacket.Answer | dnsPacket.Answer[]): void {
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

  resolve(): void {
    if (this.fin) {
      throw new DuplicateAnswerForRequest();
    }

    this.done();
  }

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
}

export class DNSRequest implements CanAnswer<DNSResponse> {
  readonly packet: PacketWrapper;
  connection: Connection;

  constructor(packet: dnsPacket.Packet, connection: Connection) {
    this.packet = new PacketWrapper(packet);
    this.connection = connection;
  }

  toAnswer(): DNSResponse {
    const newPacket: dnsPacket.Packet = {
      ...this.packet.raw,
      type: 'response',
    };
    return new DNSResponse(newPacket, this.connection);
  }
}
