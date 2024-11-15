import { DefaultServer, DefaultServerProps } from '../common/server';
import { Logger } from '../plugins/loggers';
import { Cache } from '../plugins/cache';
import { Store } from '../plugins/storage';
import dnsPacket from 'dns-packet';
import { registerCache } from '../common/core/utils';

export type DinoDNSProps = DefaultServerProps<dnsPacket.Packet> & {
  cache?: Cache;
  storage?: Store;
  logger?: Logger;
};

export class DinoDNS extends DefaultServer {
  public cache?: Cache;
  public storage?: Store;
  public logger?: Logger;

  constructor(props: DinoDNSProps) {
    super(props);

    const { logger, cache, storage } = props;

    if (logger) {
      this.logger = logger;
      this.use(logger.handler);
    }

    if (cache) {
      this.cache = cache;
      this.use(cache.handler);
      this.use(registerCache(cache));
    }

    if (storage) {
      this.storage = storage;
      this.use(storage.handler);
    }
  }
}
