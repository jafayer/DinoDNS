import { Handler } from '../../types';
import { BlockList, isIP, isIPv4, IPVersion } from 'net';

/** Configuration for the ACL plugin */
export interface ACLConfig {
  /** The list of IP ranges (CIDR notation) to allow or block */
  ranges: string[];

  /** The mode to use for the ACL */
  mode?: 'allow' | 'block';

  /** Whether to continue through the plugin chain on a ACL block */
  continueOnFail?: boolean;
}

/**
 * Access Control List.
 *
 * The ACL plugin takes a list of IP ranges (CIDR notation) and allows or blocks requests based on the list.
 */
export class ACL {
  private list: BlockList;
  private mode: ACLConfig['mode'];
  private continueOnFail: boolean;

  constructor({ ranges, mode = 'allow', continueOnFail = false }: ACLConfig) {
    this.list = new BlockList();
    this.mode = mode;
    this.continueOnFail = continueOnFail;

    for (const range of ranges) {
      const [address, mask] = range.trim().split('/').map((x) => x.trim());
      if (!isIP(address) || !mask || isNaN(parseInt(mask))) {
        throw new Error(`Invalid IP range: ${range}`);
      }

      const v: IPVersion = isIPv4(address) ? 'ipv4' : 'ipv6';

      this.list.addSubnet(address, parseInt(mask), v);
    }

    this.handler = this.handler.bind(this);
  }

  get rules() {
    return this.list.rules;
  }

  handler: Handler = async (req, res, next) => {
    const ip = req.connection.remoteAddress;
    const allowed = this.list.check(ip);

    if ((this.mode === 'allow' && !allowed) || (this.mode === 'block' && allowed)) {
      res.errors.refused();
      if (!this.continueOnFail) {
        return;
      }
    }

    next();
  };
}
