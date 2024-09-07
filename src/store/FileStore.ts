import { ZoneStore } from "./ZoneStore";
import { DNSRecord } from "../types/dns";
import fs from 'fs';

/**
 * Used for serving records from RFC 1035 zone files.
 */
export class FileStore implements ZoneStore {
    private directory: string;
    private shouldIndex: boolean;
    private index: Map<string, string> = new Map();
    private fileNameScheme: string = "db.{zone}";

    constructor(directory: string, shouldIndex: boolean = true) {
        this.directory = directory;
        this.shouldIndex = shouldIndex;

        if (shouldIndex) {
            this.indexFiles();
        }
    }

    get(zone: string, rType: string): Promise<DNSRecord[] | null> {
        const fileName = this.index.get(zone);
        if (!fileName) {
            return Promise.resolve(null);
        }

        const file = fs.readFileSync(`${this.directory}/${fileName}`, 'utf-8');
        const lines = file.split('\n');
        const records = lines
            .filter(line => line.startsWith(rType))
            .map(line => {
                const parts = line.split('\t');
                return {
                    data: parts[4]
                };
            });

        return Promise.resolve(records);
    }

    set(zone: string, rType: string, data: object): Promise<void> {
        throw new Error("Method not implemented.");
    }

    append(zone: string, rType: string, data: DNSRecord): Promise<void> {
        throw new Error("Method not implemented.");
    }

    delete(zone: string, rType?: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    /**
     * To improve performance, indexFiles determines the location of all zone files in the directory. 
     */
    private indexFiles() {
        const files = fs.readdirSync(this.directory);
        for (const file of files) {
            const zone = file.replace(/^db\./, '');
            this.index.set(zone, file);
        }
    }
}