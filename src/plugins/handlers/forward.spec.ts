import { Forwarder } from './forward';
import { DNSRequest, DNSResponse } from '../../types';
import { DefaultStore, Store } from '../storage';
import { SupportedNetworkType } from '../../common/network';

describe('Forwarder', () => {
  let forwarder: Forwarder;
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    req = new DNSRequest(
      {
        questions: [{ name: 'example.com', type: 'AXFR' }],
      },
      { remoteAddress: '127.0.0.1', remotePort: 1234, type: SupportedNetworkType.UDP },
    );
    res = req.toAnswer();

    res.resolve = jest.fn();
    res.answer = jest.fn();
    res.errors.refused = jest.fn();

    next = jest.fn();
  });

  it('should forward request using UDP', async () => {
    forwarder = new Forwarder({ address: '8.8.8.8', protocol: SupportedNetworkType.UDP });
    jest.spyOn(forwarder, 'doUDPRequest').mockResolvedValue({
      answers: [{ name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '1.2.3.4' }],
    });

    await forwarder.handler(req, res, next);
    expect(forwarder.doUDPRequest).toHaveBeenCalled();
    expect(res.answer).toHaveBeenCalledWith([
      { name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '1.2.3.4' },
    ]);
    expect(next).toHaveBeenCalled();
  });

  it('should forward request using TCP', async () => {
    forwarder = new Forwarder({ address: '8.8.8.8', protocol: SupportedNetworkType.TCP });
    jest.spyOn(forwarder, 'doTCPRequest').mockResolvedValue({
      answers: [{ name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '1.2.3.4' }],
    });

    await forwarder.handler(req, res, next);
    expect(forwarder.doTCPRequest).toHaveBeenCalled();
    expect(res.answer).toHaveBeenCalledWith([
      { name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '1.2.3.4' },
    ]);
    expect(next).toHaveBeenCalled();
  });

  it('should forward request using DoH', async () => {
    forwarder = new Forwarder({ address: 'example.com/dns-query', protocol: SupportedNetworkType.HTTPS });
    jest.spyOn(forwarder, 'doDoHRequest').mockResolvedValue({
      answers: [{ name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '1.2.3.4' }],
    });

    await forwarder.handler(req, res, next);
    expect(forwarder.doDoHRequest).toHaveBeenCalled();
    expect(res.answer).toHaveBeenCalledWith([
      { name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '1.2.3.4' },
    ]);
    expect(next).toHaveBeenCalled();
  });

  it('should forward request using TLS', async () => {
    forwarder = new Forwarder({ address: '8.8.8.8', protocol: SupportedNetworkType.TLS });
    jest.spyOn(forwarder, 'doTLSQuery').mockResolvedValue({
      answers: [{ name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '1.2.3.4' }],
    });

    await forwarder.handler(req, res, next);
    expect(forwarder.doTLSQuery).toHaveBeenCalled();
    expect(res.answer).toHaveBeenCalledWith([
      { name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '1.2.3.4' },
    ]);
    expect(next).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    forwarder = new Forwarder({ address: '8.8.8.8', protocol: SupportedNetworkType.UDP });
    jest.spyOn(forwarder, 'doUDPRequest').mockRejectedValue(new Error('Network error'));

    await forwarder.handler(req, res, next);
    expect(forwarder.doUDPRequest).toHaveBeenCalled();
    expect(res.answer).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
