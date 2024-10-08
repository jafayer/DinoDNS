import { Store } from '../Store';
import { EventEmitter } from 'events';
import { DNSRequest, DNSResponse, NextFunction } from '../../../common/server';
import { resolveWildcards } from '../../../common/core/domainToRegexp';
import { RecordType } from 'dns-packet';
import { SupportedAnswer, SupportedRecordType, ZoneData } from '../../../types/dns';
import { Trie } from '../../../common/core/trie';

interface DeserializedTrieData {
  trie: DeserializedTrie;
  data: [string, SupportedAnswer[]][];
}

interface DeserializedTrie {
  [key: string]: DeserializedTrieData;
}
/**
 * A Trie data structure for storing zone data in memory.
 *
 * The trie should be able to resolve data for a given domain by traversing the trie of
 * inverse-ordered domain segment labels.
 *
 */
export class AnswerTrie {
  private trie: Map<string, AnswerTrie> = new Map();
  /**
   * TODO: this type definition is currently imprecise.
   *
   * It does not narrow the type of the record based on the specific record type. You should not be able, for example,
   * to add a record of type 'A' with an answer that is an MxAnswer.
   */
  private data: Map<RecordType, SupportedAnswer[]> = new Map();

  private _insert(labels: string[], rType: RecordType, data: SupportedAnswer[]) {
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
      next = new AnswerTrie();
      this.trie.set(label, next);
    }

    next._insert(rest, rType, data);
  }

  add(domain: string, rType: RecordType, data: SupportedAnswer[]) {
    this._insert(this.domainToLabels(domain), rType, data);
  }

  private _getExact(labels: string[], rType?: RecordType): SupportedAnswer[] | null {
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

  private _get(labels: string[], rType?: RecordType): SupportedAnswer[] | null {
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
        return response.map((record) => {
          return {
            ...record,
            name: resolveWildcards(labels.toReversed().join('.'), record.name),
          };
        });
      }
      const response = Array.from(this.trie.get('*')!.data.values()).flat();
      return response.map((record) => {
        return {
          ...record,
          name: resolveWildcards(labels.toReversed().join('.'), record.name),
        };
      });
    }

    const [label, ...rest] = labels;
    const next = this.trie.get(label);

    if (!next) {
      return null;
    }

    return next._get(rest, rType);
  }

  get(domain: string, rType?: RecordType): SupportedAnswer[] | null {
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

  private _delete(labels: string[], rType?: RecordType, rData?: SupportedAnswer) {
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

  delete(domain: string, rType?: RecordType, rData?: SupportedAnswer) {
    this._delete(this.domainToLabels(domain), rType, rData);
  }

  append(domain: string, rType: RecordType, data: SupportedAnswer) {
    const labels = this.domainToLabels(domain);
    const [label, ...rest] = labels;
    let next = this.trie.get(label);

    if (!next) {
      next = new AnswerTrie();
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

  private domainToLabels(domain: string): string[] {
    return domain.split('.').reverse();
  }

  private serializeTrie(trie: Map<string, AnswerTrie>): object {
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

  private deserializeTrie(obj: DeserializedTrie) {
    for (const [key, value] of Object.entries(obj)) {
      const trie = new AnswerTrie();
      trie.deserializeTrie(value.trie);
      this.trie.set(key, trie);

      for (const [rType, data] of value.data) {
        trie.data.set(rType as RecordType, data);
      }
    }
  }

  static fromString(str: string): AnswerTrie {
    const obj = JSON.parse(str) as DeserializedTrie;
    const trie = new AnswerTrie();
    trie.deserializeTrie(obj);
    return trie;
  }
}

export type DefaultStoreProps = {
  shouldCache?: boolean;
};

export class DefaultStore extends EventEmitter implements Store {
  private shouldCache: boolean;
  trie: Trie<ZoneData> = new Trie();

  constructor(props?: DefaultStoreProps) {
    super();

    this.shouldCache = props?.shouldCache ?? false;
  }

  async get(zone: string): Promise<ZoneData[keyof ZoneData][] | null>;
  async get<T extends SupportedRecordType>(zone: string, rType: T): Promise<ZoneData[T][] | null>;
  async get<T extends SupportedRecordType>(zone: string, rType?: T): Promise<ZoneData[T][] | ZoneData[keyof ZoneData][] | null> {
    if (rType) {
      return this.trie.get(zone, rType) as ZoneData[T][] | null;
    }

    const results = this.trie.get(zone);
    if (!results) {
      return null;
    }

    return results as ZoneData[keyof ZoneData][];
  }

  async set<T extends SupportedRecordType>(zone: string, rType: T, data: ZoneData[T] | ZoneData[T][]): Promise<void> {
    this.trie.add(zone, rType, data);
  }

  async append<T extends SupportedRecordType>(zone: string, rType: T, data: ZoneData[T]): Promise<void> {
    this.trie.append(zone, rType, data);
  }

  async delete<T extends SupportedRecordType>(zone: string, rType?: T, rData?: ZoneData[T]): Promise<void> {
    this.trie.delete(zone, rType, rData);
  }

  async handler(req: DNSRequest, res: DNSResponse, next: NextFunction) {
    const { questions } = req.packet;
    const { name, type } = questions![0];

    const records = this.trie.get(name, type);

    const answers: SupportedAnswer[] | undefined = records?.map((record) => {
      return {
        name,
        type,
        data: record,
      } as SupportedAnswer;
    });

    if (answers && answers.length > 0) {
      res.answer(answers);
      if (this.shouldCache) {
        this.emitCacheRequest(name, type, records as ZoneData[SupportedRecordType]);
      }
    }

    next();
  }

  async emitCacheRequest<T extends SupportedRecordType>(zone: string, rType: T, records: ZoneData[T]) {
    this.emit('cacheRequest', {
      zoneName: zone,
      recordType: rType,
      records: records,
    });
  }
}
