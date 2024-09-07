import { ZoneStore } from "./ZoneStore";
import { DNSRecord } from "../types/dns";
import { DNSHandler, DNSResponse } from "../server/Server";
import { DNSRequest } from "../server/request";
import type { AnswerMap, ZoneData } from "../types/dnsLibTypes";

import fs from 'fs';

export type RecordMap = {
    [K in keyof Partial<ZoneData>]: ZoneData[K][];
}

export class MemoryStore implements ZoneStore {
    store: Map<string, RecordMap>;
    constructor() {
        this.store = new Map();
    }

    /**
     * Load a store from a JSON file
     * @param filePath The path to the file to load the store from
     */
    static fromJSONFile(filePath: string): MemoryStore {
        const store = new MemoryStore();
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        for (const [zone, records] of Object.entries(data)) {
            store.store.set(zone, records as RecordMap);
        }

        return store;
    }

    async get<T extends keyof ZoneData>(zone: string, rType?: T): Promise<ZoneData[T] | ZoneData[T][] | null> {
        const records = this.store.get(zone);
        if (!records) {
            return null;
        }

        if (rType) {
            const record = records[rType] as ZoneData[T] | undefined;

            if (!record) {
                return null;
            }

            return record;
        }

        return Object.values(records).flat() as ZoneData[T][];
    }

    async set<T extends keyof ZoneData>(zone: string, rType: T, data: ZoneData[T][]): Promise<void> {
        if (!this.store.has(zone)) {
            this.store.set(zone, {} as RecordMap);
        }

        this.store.get(zone)![rType] = data as RecordMap[T];
    }

    async append<T extends keyof ZoneData>(zone: string, rType: T, data: ZoneData[T]): Promise<void> {
        if (!this.store.has(zone)) {
            this.store.set(zone, {} as RecordMap);
        }

        const records = (this.store.get(zone)!)[rType] as ZoneData[T][] | undefined;
        if (!records) {
            this.store.set(zone, { ...this.store.get(zone)!, [rType]: [data] });
        } else {
            records.push(data);
        }
    }

    async delete<T extends keyof ZoneData>(zone: string, rType?: T, data?: ZoneData[T]): Promise<void> {
        if(!this.store.has(zone)) {
            return;
        }

        if (!rType) {
            this.store.delete(zone);
            return;
        }

        if (!data) {
            const records = this.store.get(zone);
            if (records) {
                delete records[rType];
                this.store.set(zone, records);
            }
            return;
        }

        const records = this.store.get(zone)![rType] as ZoneData[T][] | undefined;
        if (!records) {
            return;
        }

        // Remove the record from the list
        const index = records.indexOf(data);
        if (index !== -1) {
            records.splice(index, 1);
        }

        if (records.length === 0) {
            const newRecords = { ...this.store.get(zone)!, [rType]: records };
            this.store.set(zone, newRecords);
        }
    }

    async clear(): Promise<void> {
        this.store.clear();
    }

    async handler(req: DNSRequest, res: DNSResponse, next: Function) {
        const {questions} = req.packet;
        if (!questions || questions.length === 0) {
            next();
            return;
        }
        
        const question = questions[0];
        const {name, type} = question;
        const records = await this.get(name, type as keyof ZoneData);
        if (!records) {
            next();
            return;
        }

        for (const record of records) {
            // create Answer based on record type
            switch (type) {
                case 'A':
                    res.answer({name, type: 'A', data: record.data, ttl: 300});
                    break;
                case 'MX':
                    res.answer({name, type: 'MX', data: record, ttl: 300});
                    break;
                case 'TXT':
                    res.answer({name, type: 'TXT', data: record.data, ttl: 300});
                    break;
                case 'NS':
                    res.answer({name, type: 'NS', data: record.data, ttl: 300});
                    break;
                case 'SOA':
                    res.answer<'SOA'>({
                        type: 'SOA',
                        name,
                        data: record.data,
                    });
                    break;
                default:
                    // create a NOTIMP response
                    res.packet.flags = 0x0004;
                    res.resolve();
                    return;
        }

        next();
    }
}