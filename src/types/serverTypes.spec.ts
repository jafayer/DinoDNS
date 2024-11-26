import { PacketWrapper } from './server';
import dnsPacket from 'dns-packet';
import { RCode } from '../common/core/utils';
import { HasFlag } from '../common/core/utils';
import { RECURSION_AVAILABLE, RECURSION_DESIRED } from 'dns-packet';

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
      const num = RCode[rcode];
      console.log({
        rcode,
        num,
        last4: packetWrapper.raw.flags! & 0x000f,
      });
      packetWrapper.rcode = rcode;
      expect(packetWrapper.rcode).toBe(num);
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
});
