import { DefaultServer, DefaultServerProps } from '../common/server';
import { Logger } from '../plugins/loggers';
import dnsPacket from 'dns-packet';

type DinoDNSProps = DefaultServerProps<dnsPacket.Packet> & {
  cache?: boolean;
  storage?: boolean;
  stats?: boolean;
  logger?: Logger;
};

export class DinoDNS extends DefaultServer {
  constructor(props: DinoDNSProps) {
    super(props);

    if (props.logger) {
      this.use(props.logger.handler);
    }
    // if(props.cache){
    //     // Add cache
    // }

    // if(props.storage){
    //     // Add storage
    // }

    // if(props.stats){
    //     // Add stats
    // }

    // if(props.cache && props.storage && props.cache.cacheStored) {
    //     props.storage.on('cacheRequest', props.cache.cacheHandler)
    // }
  }
}
