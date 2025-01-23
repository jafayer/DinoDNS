import { RRL } from './rrl';
import { DNSRequest, DNSResponse } from '../../types';
import { DefaultStore, Store } from '../storage';
import { SupportedNetworkType } from '../../common/network';

describe('RRL Handler', () => {
  let rrl: RRL;
  let req: DNSRequest;
  let res: DNSResponse;
  let next: jest.Mock;
  let store: Store;

  beforeEach(() => {
    store = new DefaultStore();
    rrl = new RRL({
      limit: 2,
      interval: 1000,
    });
    req = new DNSRequest(
      {
        questions: [{ name: 'example.com', type: 'AXFR' }],
      },
      { remoteAddress: '127.0.0.1', remotePort: 1234, type: SupportedNetworkType.UDP },
    );
    res = req.toAnswer();

    store.get = jest.fn();
    res.resolve = jest.fn();
    res.answer = jest.fn();
    res.errors.refused = jest.fn();

    next = jest.fn();
  });

  it('should call next if request count is within limit', async () => {
    await rrl.handler(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should call refused if request count exceeds limit', async () => {
    await rrl.handler(req, res, next);
    await rrl.handler(req, res, next);
    await rrl.handler(req, res, next);
    expect(res.errors.refused).toHaveBeenCalled();
  });

  it('should decrement request count after interval', async () => {
    jest.useFakeTimers();
    await rrl.handler(req, res, next);
    await rrl.handler(req, res, next);
    jest.advanceTimersByTime(1000);
    await rrl.handler(req, res, next);
    expect(next).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  it('should not decrement request count below 0', async () => {
    jest.useFakeTimers();
    await rrl.handler(req, res, next);
    jest.advanceTimersByTime(1000);
    await rrl.handler(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('should increment request count for each request', async () => {
    await rrl.handler(req, res, next);
    await rrl.handler(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('should work for a very short interval', async () => {
    jest.useFakeTimers();
    rrl = new RRL({
      limit: 2,
      interval: 1,
    });
    await rrl.handler(req, res, next);
    await rrl.handler(req, res, next);
    await rrl.handler(req, res, next);
    expect(res.errors.refused).toHaveBeenCalled();

    jest.advanceTimersByTime(1); // clear the interval
    await rrl.handler(req, res, next);
    await rrl.handler(req, res, next);
    jest.advanceTimersByTime(1); // clear the interval
    await rrl.handler(req, res, next);

    expect(res.errors.refused).toHaveBeenCalledTimes(1);
  });
});
