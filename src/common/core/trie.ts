interface DeserializedTrieData<K extends keyof T, T> {
  trie: DeserializedTrie<K, T>;
  data: [K, T[K][]][];
}

interface DeserializedTrie<K extends keyof T, T> {
  [key: string]: DeserializedTrieData<K, T>;
}

export class Trie<K extends keyof T, T> {
  private trie: Map<string, Trie<K, T>> = new Map();

  private data: Map<K, T[K][]> = new Map();

  private _insert(labels: string[], rType: K, data: T[K] | T[K][]) {
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
      next = new Trie<K, T>();
      this.trie.set(label, next);
    }

    next._insert(rest, rType, data);
  }

  add(domain: string, rType: K, data: T[K] | T[K][]) {
    this._insert(this.domainToLabels(domain), rType, data);
  }

  private _getExact(labels: string[], rType?: K): T[K][] | null {
    if (labels.length === 0) {
      if (rType) {
        return this.data.get(rType) || null;
      }

      return Array.from(this.data.values()).flat();
    }

    const [label, ...rest] = labels;
    const next = this.trie.get(label);

    if (!next) {
      return null;
    }

    return next._getExact(rest, rType);
  }

  private _get(labels: string[], rType?: K): T[keyof T][] | T[K][] | null {
    if (labels.length === 0) {
      if (rType) {
        return this.data.get(rType) || null;
      }

      return Array.from(this.data.values()).flat();
    }

    if (this.trie.has('*')) {
      if (rType) {
        const response = this.trie.get('*')!.data.get(rType);
        if (!response) {
          return null;
        }
        return response;
      }
      const response = Array.from(this.trie.get('*')!.data.values()).flat();
      return response;
    }

    const [label, ...rest] = labels;
    const next = this.trie.get(label);

    if (!next) {
      return null;
    }

    return next._get(rest, rType);
  }

  get(domain: string, rType?: K): T[keyof T][] | T[K][] | null {
    // first try to get the exact match
    const exact = this._getExact(this.domainToLabels(domain), rType);
    if (exact) {
      return exact;
    }

    const result = this._get(this.domainToLabels(domain), rType);
    if (!result || result.length === 0) {
      return null;
    }

    return result;
  }

  private _has(labels: string[]): boolean {
    if (labels.length === 0) {
      return this.data.size > 0;
    }

    const [label, ...rest] = labels;
    const next = this.trie.get(label);

    if (!next) {
      return false;
    }

    return next._has(rest);
  }

  has(domain: string): boolean {
    return this._has(this.domainToLabels(domain));
  }

  private _delete(labels: string[], rType?: K, rData?: T[K]) {
    if (labels.length === 0) {
      if (rType) {
        if (!rData) {
          this.data.delete(rType);
          return;
        }

        const current = this.data.get(rType) || [];
        const filtered = current.filter((record) => {
          return JSON.stringify(record) !== JSON.stringify(rData);
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

  delete(domain: string, rType?: K, rData?: T[K]) {
    this._delete(this.domainToLabels(domain), rType, rData);
  }

  append(domain: string, rType: K, data: T[K]) {
    const labels = this.domainToLabels(domain);
    const [label, ...rest] = labels;
    let next = this.trie.get(label);

    if (!next) {
      next = new Trie<K, T>();
      this.trie.set(label, next);
    }

    if (rest.length === 0) {
      const current = next.data.get(rType) || [];
      next.data.set(rType, current.concat(data));
    } else {
      next.append(rest.join('.'), rType, data);
    }
  }

  private _resolve(labels: string[]): string {
    if (labels.length === 0) {
      return '';
    }

    const [label, ...rest] = labels;
    const next = this.trie.get(label);

    if (!next) {
      return '';
    }

    if (next.trie.has('*')) {
      return '*.' + label;
    }

    const resolved = next._resolve(rest);
    if (resolved === '') {
      return label;
    }

    return resolved + '.' + label;
  }

  resolve(domain: string): string {
    return this._resolve(this.domainToLabels(domain));
  }

  private serializeTrie(trie: Map<string, Trie<K, T>>): object {
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

  private deserializeTrie(obj: DeserializedTrie<K, T>) {
    for (const [key, value] of Object.entries(obj)) {
      const trie = new Trie<K, T>();
      trie.deserializeTrie(value.trie);
      this.trie.set(key, trie);

      for (const [rType, data] of value.data) {
        this.data.set(rType, data);
      }
    }
  }

  static fromString<K extends keyof T, T>(str: string): Trie<K, T> {
    const obj = JSON.parse(str) as DeserializedTrie<K, T>;
    const trie = new Trie<K, T>();
    trie.deserializeTrie(obj);
    return trie;
  }

  private domainToLabels(domain: string): string[] {
    return domain.split('.').reverse();
  }
}
