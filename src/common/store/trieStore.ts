import { Store } from "./Store";
import { Answer, RecordType } from "dns-packet";
import { EventEmitter } from "events";
import { DNSRequest, DNSResponse, NextFunction, Handler } from "../../server";

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
    private data: Map<RecordType, Answer[]> = new Map();

    private _insert(labels: string[], rType: RecordType, data: Answer[]) {

        if(labels.length === 0) {
            this.data.set(rType, data);
            return;
        }
        
        const [label, ...rest] = labels;
        const isWildcard = label === '*';
        
        if(isWildcard) {
            // if the label is a wildcard, we should clear the labels array
            labels = [];
        }
        
        let next = this.trie.get(label);
        
        if(!next) {
            next = new AnswerTrie();
            this.trie.set(label, next);
        }

        next._insert(rest, rType, data);
    }

    add(domain: string, rType: RecordType, data: Answer[]) {
        this._insert(this.domainToLabels(domain), rType, data);
    }


    private _get(labels: string[], rType?: RecordType): Answer[] | null {
        if(labels.length === 0) {
            if(rType) {
                return this.data.get(rType) || null;
            }
            
            return Array.from(this.data.values()).flat();
        }
        
        const matchesWildcard = this.trie.has('*');
        if(this.trie.has('*')) {
            if(rType) {
                return this.trie.get('*')!.data.get(rType) || null;
            }
            return Array.from(this.trie.get('*')!.data.values()).flat();
        }

        const [label, ...rest] = labels;
        const next = this.trie.get(label);

        if(!next) {
            return null;
        }

        return next._get(rest, rType);
    }

    get(domain: string, rType?: RecordType): Answer[] | null {
        const result = this._get(this.domainToLabels(domain), rType);
        if(!result || result.length === 0) {
            return null;
        }

        return result;
    }

    private _has(labels: string[]): boolean {
        if(labels.length === 0) {
            return this.data.size > 0;
        }

        const [label, ...rest] = labels;
        const next = this.trie.get(label);

        if(!next) {
            return false;
        }

        return next._has(rest);
    }

    has(domain: string): boolean {
        return this._has(this.domainToLabels(domain));
    }

    private _delete(labels: string[], rType?: RecordType, rData?: Answer) {
        if(labels.length === 0) {
            if(rType) {

                if(!rData) {
                    this.data.delete(rType);
                    return;
                }

                const current = this.data.get(rType) || [];
                const filtered = current.filter((record) => {
                    return JSON.stringify(record) !== JSON.stringify(rData);
                });

                if(filtered.length === 0) {
                    this.data.delete(rType);
                } else {
                    this.data.set(rType, filtered);
                }

                // if no data is left, remove the record type
                if(this.data.size === 0) {
                    this.trie.clear();
                }
            } else {
                this.data.clear();
            }
            return;
        }

        const [label, ...rest] = labels;
        const next = this.trie.get(label);

        if(!next) {
            return;
        }

        next._delete(rest, rType, rData);
    }

    delete(domain: string, rType?: RecordType, rData?: Answer) {
        this._delete(this.domainToLabels(domain), rType, rData);
    }

    append(domain: string, rType: RecordType, data: Answer) {
        const labels = this.domainToLabels(domain);
        const [label, ...rest] = labels;
        let next = this.trie.get(label);

        if(!next) {
            next = new AnswerTrie();
            this.trie.set(label, next);
        }

        if(rest.length === 0) {
            let current = next.data.get(rType) || [];
            next.data.set(rType, current.concat(data));
        } else {
            next.append(rest.join('.'), rType, data);
        }
    }

    private _resolve(labels: string[]): string {
        if(labels.length === 0) {
            return '';
        }

        const [label, ...rest] = labels;
        const next = this.trie.get(label);

        if(!next) {
            return '';
        }

        if(next.trie.has('*')) {
            return '*.' + label;
        }

        const resolved = next._resolve(rest);
        if(resolved === '') {
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
        const obj: {[key: string]: object} = {};
        for(const [key, value] of trie) {
            obj[key] = {
                data: Array.from(value.data.entries()),
                trie: this.serializeTrie(value.trie)
            }
        }
        return obj;
    }

    toString() {
        const obj = this.serializeTrie(this.trie);
        return JSON.stringify(obj);
    }

    private deserializeTrie(obj: object) {
        for(const [key, value] of Object.entries(obj)) {
            const trie = new AnswerTrie();
            trie.deserializeTrie(value.trie);
            this.trie.set(key, trie);

            for(const [rType, data] of value.data) {
                trie.data.set(rType as RecordType, data);
            }
        }
    }

    static fromString(str: string): AnswerTrie {
        const obj = JSON.parse(str);
        const trie = new AnswerTrie();
        trie.deserializeTrie(obj);
        return trie;
    }
}

/**
 * A simple in-memory store for storing DNS records.
 */
export class TrieStore extends EventEmitter implements Store {
    trie: AnswerTrie = new AnswerTrie();

    async get(zone: string, rType?: RecordType): Promise<Answer | Answer[] | null> {
        return this.trie.get(zone, rType);
    }

    async set(zone: string, rType: RecordType, data: Answer | Answer[]): Promise<void> {
        this.trie.add(zone, rType, Array.isArray(data) ? data : [data]);
    }

    async append(zone: string, rType: RecordType, data: Answer): Promise<void> {
        this.trie.append(zone, rType, data);
    }

    async delete(zone: string, rType?: RecordType, rData?: Answer): Promise<void> {
        this.trie.delete(zone, rType, rData);
    }

    handler: Handler = async (req: DNSRequest, res: DNSResponse, next: NextFunction) => {
        const { questions } = req.packet;
        const { name, type } = questions![0];

        const records = this.trie.get(name, type);

        if(records && records.length > 0) {
            res.answer(records);

            this.emit('cacheRequest', {
                zoneName: this.trie.resolve(name),
                recordType: type,
                records: records
            });
        }

        next();
    }
}