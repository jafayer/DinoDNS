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

  private _getExact<K extends keyof T>(labels: string[], rType?: K): T[K][] | T[keyof T][] | null {
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

  private _get<K extends keyof T>(labels: string[], rType?: K): T[keyof T][] | T[K][] | null {
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

  get<K extends keyof T>(domain: string, rType?: K): T[keyof T][] | T[K][] | null {
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

  private _delete<K extends keyof T>(labels: string[], rType?: K, rData?: T[K]) {
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
