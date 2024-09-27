import { UDPSerializer } from "./udp";
import dnsPacket from "dns-packet";

describe("UDPSerializer", () => {
  let queryPacket = Buffer.from('\x00\x01\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x07example\x03com\x00\x00\x01\x00\x01')
  let udpSerializer: UDPSerializer;

  beforeEach(() => {
    udpSerializer = new UDPSerializer();
  })

  it('Should be able to parse incoming queries', () => {
    const query = udpSerializer.decode(queryPacket);

    expect(query.id).toBe(1);
    expect(query.questions!.length).toBe(1);
    expect(query.questions![0].name).toBe('example.com');
    expect(query.questions![0].type).toBe('A');
    expect(query.questions![0].class).toBe('IN');
  })

  it('Should be able to serialize queries', () => {
    const query: dnsPacket.Packet = {
      id: 1,
      questions: [
        {
          name: 'example.com',
          type: 'A',
          class: 'IN'
        }
      ],
      
    }
    const packet = udpSerializer.encode(query);

    expect(packet).toEqual(queryPacket);
  });
});
