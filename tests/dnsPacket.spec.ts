import dnsPacket from 'dns-packet';


describe('serialization', () => {
    it('should serialize and deserialize a packet', () => {
        const packet = dnsPacket.encode({
            type: 'query',
            id: 1,
            flags: dnsPacket.RECURSION_DESIRED,
            questions: [
                { type: 'A', name: 'example.com' }
            ]
        });
        
        const decoded = dnsPacket.decode(packet);
    
        expect(decoded.type).toBe('query');
        expect(decoded.id).toBe(1);
        expect(decoded.flags).toBe(dnsPacket.RECURSION_DESIRED);
        expect(decoded.questions![0].type).toBe('A');
        expect(decoded.questions![0].name).toBe('example.com');
    });
});