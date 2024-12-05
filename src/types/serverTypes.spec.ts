import { PacketWrapper } from './server';
import dnsPacket from 'dns-packet';
import { RCode } from '../common/core/utils';
import { HasFlag } from '../common/core/utils';
import { RECURSION_AVAILABLE, RECURSION_DESIRED, AUTHORITATIVE_ANSWER, TRUNCATED_RESPONSE, AUTHENTIC_DATA, CHECKING_DISABLED } from 'dns-packet';

describe('PacketWrapper', () => {
  const defaultPacket: dnsPacket.Packet = {
    type: 'response',
    id: 1,
    flags: 0,
    questions: [],
    answers: [],
  };

  let packetWrapper: PacketWrapper;

  beforeEach(() => {
    packetWrapper = new PacketWrapper(defaultPacket);
  });

  it('should be able to get the packet id', () => {
    expect(packetWrapper.id).toBe(1);
  });

  it('should be able to get and set the packet rcode', () => {
    const rcodes: RCode[] = [
      RCode.FORMAT_ERROR,
      RCode.NO_ERROR,
      RCode.NOT_AUTH,
      RCode.NOT_IMPLEMENTED,
      RCode.NOT_ZONE,
      RCode.REFUSED,
      RCode.SERVER_FAILURE,
      RCode.YX_DOMAIN,
      RCode.YX_RR_SET,
      RCode.NX_DOMAIN,
    ];

    for (const rcode of rcodes) {
      packetWrapper.rcode = rcode;
      expect(packetWrapper.rcode).toBe(rcode);
    }
  });

  it('should not allow setting an invalid rcode', () => {
    expect(() => {
      packetWrapper.rcode = 0x000a as RCode;
    }).toThrow();
  });

  it('should be able to add a flag to the packet', () => {
    packetWrapper.addFlag(RECURSION_AVAILABLE);
    expect(HasFlag(packetWrapper.flags, RECURSION_AVAILABLE)).toBe(true);
  });

  it('should be able to remove a flag from the packet', () => {
    packetWrapper.addFlag(RECURSION_AVAILABLE);
    packetWrapper.removeFlag(RECURSION_AVAILABLE);
    expect(HasFlag(packetWrapper.flags, RECURSION_AVAILABLE)).toBe(false);
  });

  it('should be able to have multiple flags set without overwriting them', () => {
    packetWrapper.addFlag(RECURSION_AVAILABLE);
    expect(HasFlag(packetWrapper.flags, RECURSION_AVAILABLE)).toBe(true);
    packetWrapper.addFlag(RECURSION_DESIRED);
    expect(HasFlag(packetWrapper.flags, RECURSION_AVAILABLE)).toBe(true);
    expect(HasFlag(packetWrapper.flags, RECURSION_DESIRED)).toBe(true);

    packetWrapper.removeFlag(RECURSION_AVAILABLE);
    expect(HasFlag(packetWrapper.flags, RECURSION_AVAILABLE)).toBe(false);
    expect(HasFlag(packetWrapper.flags, RECURSION_DESIRED)).toBe(true);
  });

  it('should be able to set the flags directly', () => {
    packetWrapper.flags = 0x8000;
    expect(packetWrapper.flags).toBe(0x8000);
  });

  it('should be able to convert the flags to a flag array', () => {
    packetWrapper.flags = RECURSION_AVAILABLE;
    expect(packetWrapper.flagsArray).toEqual(['ra']);

    packetWrapper.flags = RECURSION_DESIRED;
    expect(packetWrapper.flagsArray).toEqual(['rd']);

    packetWrapper.flags = RECURSION_AVAILABLE | RECURSION_DESIRED;
    expect(packetWrapper.flagsArray).toEqual(['rd', 'ra']);

    packetWrapper.flags = 0;
    packetWrapper.addFlag(RECURSION_AVAILABLE);
    expect(packetWrapper.flagsArray).toEqual(['ra']);
    packetWrapper.addFlag(RECURSION_DESIRED);
    expect(packetWrapper.flagsArray).toEqual(['rd', 'ra']);
  });

  describe('flagsArray', () => {
    it('should return an empty array when no flags are set', () => {
      const packet = { flags: 0 } as dnsPacket.Packet;
      const wrapper = new PacketWrapper(packet);
      expect(wrapper.flagsArray).toEqual([]);
    });

    it('should return the correct flags when they are set', () => {
      const packet = { flags: AUTHORITATIVE_ANSWER } as dnsPacket.Packet;
      const wrapper = new PacketWrapper(packet);
      expect(wrapper.flagsArray).toEqual(['aa']);
    });

    it('should return the correct flags when multiple flags are set', () => {
      const packet = { flags: AUTHORITATIVE_ANSWER | TRUNCATED_RESPONSE | RECURSION_DESIRED } as dnsPacket.Packet;
      const wrapper = new PacketWrapper(packet);
      expect(wrapper.flagsArray).toEqual(['aa', 'tc', 'rd']);
    });

    it('should return the correct flags when all flags are set', () => {
      const packet = { flags: AUTHORITATIVE_ANSWER | TRUNCATED_RESPONSE | RECURSION_DESIRED | RECURSION_AVAILABLE | AUTHENTIC_DATA | CHECKING_DISABLED } as dnsPacket.Packet;
      const wrapper = new PacketWrapper(packet);
      expect(wrapper.flagsArray).toEqual(['aa', 'tc', 'rd', 'ra', 'ad', 'cd']);
    });

    it('should return the correct flags when the flags are set by method', () => {
      packetWrapper.flags = 0;
      packetWrapper.addFlag(AUTHORITATIVE_ANSWER);
      expect(packetWrapper.flagsArray).toEqual(['aa']);

      packetWrapper.addFlag(TRUNCATED_RESPONSE);
      expect(packetWrapper.flagsArray).toEqual(['aa', 'tc']);
    })

    it('should filter out empty strings from the flags array', () => {
      const packet = { flags: AUTHORITATIVE_ANSWER | 0x0000 } as dnsPacket.Packet;
      const wrapper = new PacketWrapper(packet);
      expect(wrapper.flagsArray).toEqual(['aa']);
    });
  });

  describe('rcode', () => {
    it('should return the correct rcode', () => {
      const packet = { flags: RCode.REFUSED } as dnsPacket.Packet;
      const wrapper = new PacketWrapper(packet);
      expect(wrapper.rcode).toBe(RCode.REFUSED);
    });

    it('should return the correct rcode when it is set by method', () => {
      packetWrapper.rcode = RCode.REFUSED;
      expect(packetWrapper.rcode).toBe(RCode.REFUSED);
    });
  });
});
