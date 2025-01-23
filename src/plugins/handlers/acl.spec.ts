import { ACL } from './acl';
import { DNSRequest, DNSResponse } from '../../types';
import { DefaultStore, Store } from '../storage';
import { SupportedNetworkType } from '../../common/network';

describe('ACL Handler', () => {
  let acl: ACL;
  let req: DNSRequest;
  let res: DNSResponse;
  let next: jest.Mock;

  beforeEach(() => {
    req = new DNSRequest(
      {
        questions: [{ name: 'example.com', type: 'AXFR' }],
      },
      { remoteAddress: '192.168.1.1', remotePort: 1234, type: SupportedNetworkType.UDP },
    );
    res = req.toAnswer();
    res.errors.refused = jest.fn();
    next = jest.fn();
  });

  it('should allow request if IP is in allow list', async () => {
    acl = new ACL({ ranges: ['192.168.1.0/24'], mode: 'allow' });
    await acl.handler(req, res, next);
    expect(res.errors.refused).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should block request if IP is not in allow list', async () => {
    acl = new ACL({ ranges: ['10.0.0.0/8'], mode: 'allow' });
    await acl.handler(req, res, next);
    expect(res.errors.refused).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should block request if IP is in block list', async () => {
    acl = new ACL({ ranges: ['192.168.1.0/24'], mode: 'block' });
    await acl.handler(req, res, next);
    expect(res.errors.refused).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow request if IP is not in block list', async () => {
    acl = new ACL({ ranges: ['10.0.0.0/8'], mode: 'block' });
    await acl.handler(req, res, next);
    expect(res.errors.refused).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should continue on fail if continueOnFail is true', async () => {
    acl = new ACL({ ranges: ['10.0.0.0/8'], mode: 'allow', continueOnFail: true });
    await acl.handler(req, res, next);
    expect(res.errors.refused).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should throw error for invalid IP range', () => {
    expect(() => {
      new ACL({ ranges: ['invalid-range'], mode: 'allow' });
    }).toThrow('Invalid IP range: invalid-range');
  });
});
