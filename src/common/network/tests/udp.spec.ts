import { UDPSerializer } from '../udp';
import dnsPacket from 'dns-packet';
import { TRUNCATED_RESPONSE } from 'dns-packet';

describe('UDPSerializer', () => {
  const queryPacket = Buffer.from(
    '\x00\x01\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x07example\x03com\x00\x00\x01\x00\x01',
  );
  let udpSerializer: UDPSerializer;

  beforeEach(() => {
    udpSerializer = new UDPSerializer();
  });

  it('Should be able to parse incoming queries', () => {
    const query = udpSerializer.decode(queryPacket);

    expect(query.id).toBe(1);
    expect(query.questions!.length).toBe(1);
    expect(query.questions![0].name).toBe('example.com');
    expect(query.questions![0].type).toBe('A');
    expect(query.questions![0].class).toBe('IN');
  });

  it('Should be able to serialize queries', () => {
    const query: dnsPacket.Packet = {
      id: 1,
      questions: [
        {
          name: 'example.com',
          type: 'A',
          class: 'IN',
        },
      ],
    };
    const packet = udpSerializer.encode(query);

    expect(packet).toEqual(queryPacket);
  });

  it('should truncate responses that are too large', () => {
    const answer = {
      name: 'example.com',
      type: 'A',
      class: 'IN',
      ttl: 300,
      data: '127.0.0.1',
    };

    const packet: dnsPacket.Packet = {
      id: 1,
      flags: 0,
      questions: [
        {
          name: 'example.com',
          type: 'A',
          class: 'IN',
        },
      ],
      answers: Array(1000).fill(answer),
    };

    expect(packet.answers!.length).toBe(1000);

    expect(dnsPacket.encodingLength(packet)).toBeGreaterThan(512);

    const response = udpSerializer.encode(packet);

    expect(response.length).toBeLessThan(512);

    packet.answers = Array(1000).fill(answer);

    // get the flags from the buffer using an offset
    const flags = response.readUInt16BE(2);

    // check if the truncated flag is set
    expect(flags & TRUNCATED_RESPONSE).toBe(TRUNCATED_RESPONSE);

    const decoded = udpSerializer.decode(response) as dnsPacket.DecodedPacket;

    expect(decoded.flag_tc).toBe(true);
  });
});
