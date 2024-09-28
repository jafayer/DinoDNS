import dnsPacket from 'dns-packet';
import { Connection } from '../common/network';
import { CanAnswer } from '../common/dns';
import { CombineFlags, RCode } from '../common/core/utils';
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
 * Default class representing a DNS Response.
 *
 * DNS Responses contain the serialized packet data, and data about the connection.
 */
export class DNSResponse extends EventEmitter {
  packet: dnsPacket.Packet;
  readonly connection: Connection;
  private fin: boolean = false;

  constructor(packet: dnsPacket.Packet, connection: Connection) {
    super();
    this.packet = packet;
    this.connection = connection;
  }

  done(): void {
    this.packet = this.freezePacket();
    this.emit('done', this.packet);
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

  private freezePacket() {
    return new Proxy(this.packet, {
      set: () => {
        throw new ModifiedAfterSentError();
      },
    });
  }
}

export class DNSRequest implements CanAnswer<DNSResponse> {
  packet: dnsPacket.Packet;
  connection: Connection;

  constructor(packet: dnsPacket.Packet, connection: Connection) {
    this.packet = packet;
    this.connection = connection;
  }

  toAnswer(): DNSResponse {
    const newPacket: dnsPacket.Packet = {
      ...this.packet,
      type: 'response',
    };
    return new DNSResponse(newPacket, this.connection);
  }
}
