import { encode, decode, RECURSION_DESIRED } from '../src/common/network/dns';

describe('serialization', () => {
  it('should serialize and deserialize a packet', () => {
    const packet = encode({
      type: 'query',
      id: 1,
      flags: RECURSION_DESIRED,
      questions: [{ type: 'A', name: 'example.com' }],
    });

    const decoded = decode(packet);

    expect(decoded.type).toBe('query');
    expect(decoded.id).toBe(1);
    expect(decoded.flags).toBe(RECURSION_DESIRED);
    expect(decoded.questions![0].type).toBe('A');
    expect(decoded.questions![0].name).toBe('example.com');
  });
});
