/**
 * Deprecated for now.
 *
 * this is a trie implementation that can store data for each domain.
 *
 * This is deprecated largely because it turns out not to be more efficient than a simple flat map-based
 * implementation. This is due mostly to how wildcard matches must work according to RFC 1034.
 *
 * Matches must be done from the most specific to the least specific, meaning that storing
 * labels as connected nodes in a trie makes it difficult to achieve better performance than a flat map
 * since the trie will always need to traverse the entire tree to the leaf node anyway.
 *
 * That is, if com -> * exists, as well as com -> example -> test, and a user searches for test.example.com,
 * we would need to search for com -> example -> test anyway, and could not simply stop and return the wildcard
 * match at com -> *.
 *
 * In practice, if we modified the _get method to return an array of all matches, and then selected the last
 * match in the array, we could achieve this result without multiple searches. However, this still doesn't
 * perform better for exact matches (which are O(1) in a flat map vs O(m) for m labels in a domain) in a trie.
 *
 * This code may still be useful so we're not getting rid of it, but it'll be deprecated for now.
 */
import { isEqual } from 'lodash';

interface DeserializedTrieData<T> {
  trie: DeserializedTrie<T>;
  data: [keyof T, T[keyof T][]][];
}

interface DeserializedTrie<T> {
  [key: string]: DeserializedTrieData<T>;
}

type TypedMap<K extends keyof T, T> = Map<K, T[K][]>;

export class Trie<T> {
  private trie: Map<string, Trie<T>> = new Map();

  private data: TypedMap<keyof T, T> = new Map();

  private _insert<K extends keyof T>(labels: string[], rType: K, data: T[K] | T[K][]) {
    if (!Array.isArray(data)) {
      data = [data];
    }

    if (labels.length === 0) {
      this.data.set(rType, data);
      return;
    }

    const [label, ...rest] = labels;
    const isWildcard = label === '*';

    if (isWildcard) {
      // if the label is a wildcard, we should clear the labels array
      labels = [];
    }

    let next = this.trie.get(label);

    if (!next) {
      next = new Trie<T>();
      this.trie.set(label, next);
    }

    next._insert(rest, rType, data);
  }

  add<K extends keyof T>(domain: string, rType: K, data: T[K] | T[K][]) {
    this._insert(this.domainToLabels(domain), rType, data);
  }

  private _get<K extends keyof T>(labels: string[], rType?: K, wildcard: boolean = true): T[keyof T][] | T[K][] | null {
    if (labels.length === 0) {
      if (rType) {
        return this.data.get(rType) || null;
      }

      return Array.from(this.data.values()).flat();
    }

    const [label, ...rest] = labels;
    const next = this.trie.get(label);

    if (next) {
      const result = next._get(rest, rType, wildcard);
      if (result) {
        return result;
      }
    }

    if (!wildcard) {
      return null;
    }

    const wildcardNext = this.trie.get('*');
    if (wildcardNext) {
      const result = wildcardNext._get(rest, rType, wildcard);
      if (result) {
        return result;
      }
    }

    return null;
  }

  get<K extends keyof T>(domain: string, rType?: K, wildcard: boolean = true): T[keyof T][] | T[K][] | null {
    // first try to get the exact match
    let labels = this.domainToLabels(domain);
    const exact = this._get(labels, rType, wildcard);
    if (exact) {
      return exact;
    }

    if (!wildcard) {
      return null;
    }

    while (labels.length > 0) {
      const result = this._get(labels, rType);
      if (result) {
        return result;
      }
      labels = labels.toSpliced(-1);
    }

    return null;
  }

  private _delete<K extends keyof T>(labels: string[], rType?: K, rData?: T[K]) {
    if (labels.length === 0) {
      if (rType) {
        if (!rData) {
          this.data.delete(rType);
          return;
        }

        const current = this.data.get(rType) || [];
        const filtered = current.filter((record) => {
          return !isEqual(record, rData);
        });

        if (filtered.length === 0) {
          this.data.delete(rType);
        } else {
          this.data.set(rType, filtered);
        }

        // if no data is left, remove the record type
        if (this.data.size === 0) {
          this.trie.clear();
        }
      } else {
        this.data.clear();
      }
      return;
    }

    const [label, ...rest] = labels;
    const next = this.trie.get(label);

    if (!next) {
      return;
    }

    next._delete(rest, rType, rData);
  }

  delete<K extends keyof T>(domain: string, rType?: K, rData?: T[K]) {
    this._delete(this.domainToLabels(domain), rType, rData);
  }

  append<K extends keyof T>(domain: string, rType: K, data: T[K]) {
    const labels = this.domainToLabels(domain);
    const [label, ...rest] = labels;
    let next = this.trie.get(label);

    if (!next) {
      next = new Trie<T>();
      this.trie.set(label, next);
    }

    if (rest.length === 0) {
      const current = next.data.get(rType) || [];
      next.data.set(rType, current.concat(data));
    } else {
      next.append(rest.join('.'), rType, data);
    }
  }

  resolve(domain: string): string | null {
    let labels = this.domainToLabels(domain);

    const result = this._get(labels, undefined, false);
    if (result) {
      return labels.reverse().join('.');
    }

    while (labels.length > 0) {
      labels = labels.toSpliced(-1);

      const wildcardResult = this._get([...labels, '*'], undefined, false);
      if (wildcardResult) {
        return [...labels, '*'].reverse().join('.');
      }
    }

    return null;
  }

  private serializeTrie(trie: Map<string, Trie<T>>): object {
    const obj: { [key: string]: object } = {};
    for (const [key, value] of trie) {
      obj[key] = {
        data: Array.from(value.data.entries()),
        trie: this.serializeTrie(value.trie),
      };
    }
    return obj;
  }

  toString() {
    const obj = this.serializeTrie(this.trie);
    return JSON.stringify(obj);
  }

  private deserializeTrie(obj: DeserializedTrie<T>) {
    for (const [key, value] of Object.entries(obj)) {
      const trie = new Trie<T>();
      trie.deserializeTrie(value.trie);
      this.trie.set(key, trie);

      for (const [rType, data] of value.data) {
        this.data.set(rType, data);
      }
    }
  }

  static fromString<T>(str: string): Trie<T> {
    const obj = JSON.parse(str) as DeserializedTrie<T>;
    const trie = new Trie<T>();
    trie.deserializeTrie(obj);
    return trie;
  }

  private domainToLabels(domain: string): string[] {
    return domain.split('.').reverse();
  }
}
