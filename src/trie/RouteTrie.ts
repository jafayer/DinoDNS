import type { DNSHandler } from '../server/Server';

interface Trie<T> {
  search: (word: string) => T[] | null;
  insert: (word: string, data: T) => void;
  delete: (word: string) => void;
}

type TrieData<T> = {
  cardinality: number;
  data: T;
};

interface TrieNode<T> {
  data: TrieData<T> | null;
  children: { [key: string]: TrieNode<T> } | null;
}

export class RouteTrie implements Trie<DNSHandler> {
  private root: TrieNode<DNSHandler[]>;
  private cardinality: number;

  constructor() {
    this.root = this.createNode();
    this.cardinality = 0;
  }

  static fromList(domains: [string, DNSHandler[]][]): RouteTrie {
    const trie = new RouteTrie();
    for (let [domain, data] of domains) {
      for (let handler of data) {
        trie.insert(domain, handler);
      }
    }
    return trie;
  }

  private createNode(handlers?: DNSHandler[]): TrieNode<DNSHandler[]> {
    return {
      data: handlers ? { cardinality: ++this.cardinality, data: handlers } : null,
      children: {},
    };
  }

  /**
   * Search the trie for a domain. If wildcards is true, then the search will also include wildcard matches.
   *
   * The search will return the highest-level (most general) match available. For example, if the trie contains the domains:
   *  - com
   *  - *.com
   *  - example.com
   *  - sub.example.com
   *
   * Then searching for "sub.example.com" will return the handlers for "*.com".
   *
   * @param domain The domain to search in the trie for
   * @param wildcards whether to include wildcard matches
   * @returns
   */
  search(domain: string, wildcards = true): DNSHandler[] | null {
    let node = this.root;
    let results: TrieData<DNSHandler[]>[] = [];
    let parts = this.domainIntoParts(domain);

    for (let i = 0; i < parts.length; i++) {
      let part = parts[i];
      if (!node.children) {
        break;
      }

      if (node.children['*'] && wildcards) {
        // don't push the wildcard node to the stack,
        // but do add data if it has it
        if (node.children['*'].data) {
          results.push(node.children['*'].data);
        }
      }

      if (!node.children[part]) {
        break;
      }

      node = node.children[part];
      if (node.data && i === parts.length - 1) {
        results.push(node.data);
        break;
      }
    }

    return results.length > 0
      ? results
          .sort((a, b) => a.cardinality - b.cardinality)
          .map((d) => d.data)
          .flat()
      : null;
  }

  insert(domain: string, data: DNSHandler): void {
    let node = this.root;
    for (let part of this.domainIntoParts(domain)) {
      if (!node.children) {
        node.children = {};
      }
      if (!node.children[part]) {
        node.children[part] = this.createNode();
      }
      node = node.children[part];
    }
    if (!node.data) {
      node.data = { cardinality: ++this.cardinality, data: [] };
    }
    node.data.data.push(data);
  }

  /**
   * Handle deletions by deleting the most specific part of the domain first.
   * If this removes all children of a node, and the node has no data, remove the node.
   * Do not remove the root node.
   * @param domain
   * @returns
   */
  delete(domain: string): void {
    let node = this.root;
    let parts = this.domainIntoParts(domain);
    let stack: TrieNode<DNSHandler[]>[] = [node];
    for (let part of parts) {
      if (!node.children || !node.children[part]) {
        return;
      }
      node = node.children[part];
      stack.push(node);
    }
    while (stack.length > 1) {
      let current = stack.pop()!;
      let parent = stack[stack.length - 1];
      if (current.data || Object.keys(current.children || {}).length > 0) {
        break;
      }
      delete parent.children![parts.pop()!];
    }

    return;
  }

  domainIntoParts(domain: string): string[] {
    return domain.split('.').reverse();
  }
}
