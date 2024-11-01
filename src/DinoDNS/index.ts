import { DefaultServer, DefaultServerProps } from '../common/server';
import { Logger } from '../plugins/loggers';
import { Cache } from '../plugins/cache';
import { Store } from '../plugins/storage';
import dnsPacket from 'dns-packet';
import { registerCache } from '../common/core/utils';

export type DinoDNSProps = DefaultServerProps<dnsPacket.Packet> & {
  cache?: Cache;
  storage?: Store;
  // stats?: boolean;
  logger?: Logger;
};

export class DinoDNS extends DefaultServer {
  public cache?: Cache;
  public storage?: Store;
  // public stats?: boolean;
  public logger?: Logger;

  constructor(props: DinoDNSProps) {
    super(props);

    if (props.logger) {
      this.logger = props.logger;
      this.use(props.logger.handler);
    }

    if (props.cache) {
      this.cache = props.cache;
      this.use(props.cache.handler);
      this.use(registerCache(props.cache));
    }

    if (props.storage) {
      // Add storage
      this.storage = props.storage;
      this.use(props.storage.handler);
    }

    // if(props.stats){
    //     // Add stats
    // }
  }
}
