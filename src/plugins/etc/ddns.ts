import { Store } from "../storage";
import { ZoneDataMap, SupportedRecordType } from "../../types";
import { Awaitable } from "../../common/core/utils";

export interface DDNSOptions {
    /** The name of the record to periodically update */
    name: string;
    /** The type of the record to periodically update */
    type: SupportedRecordType;
    /** A callback that returns the new data for the record.
     * This can be any function that returns data from third-party service or source.
     * 
     * For example, if your dynamic DNS depends on an operation from a system call, 
     * you can use this callback to return the new data. Similarly, if you're using a
     * a third-party service such as ipify, you can use this callback to determine your public outbound IP,
     * and return the new data.
     **/
    queryCallback: () => Awaitable<Partial<ZoneDataMap>>;

    /** How often (in ms) to check for updates. Defaults to 1 minute. */
    frequency?: number;
}


/**
 * A Dynamic DNS (DDNS) plugin that periodically updates a record in the store.
 * 
 * This is unlike most other plugins in that it lacks a handler and is not designed to be used
 * in the record resolution chain. Instead, it is simply an abstraction that allows you to define
 * a "getter" callback that will be called on an interval and will update the store with the new data.
 * 
 * This getter function simply needs to return a partial ZoneDataMap object with a valid record type for the
 * record you're updating.
 * 
 * For example, if you're updating an A record, you would return an object like:
 * 
 * ```typescript
 * {
 *    A: ["127.0.0.1"]
 * }
 * ```
 */
export class DDNS {
    private interval: NodeJS.Timeout | undefined;
    private name: string;
    private type: SupportedRecordType;
    private queryCallback: () => Awaitable<Partial<ZoneDataMap>>;
    private frequency: number;

    constructor(private store: Store, options: DDNSOptions) {
        this.name = options.name;
        this.type = options.type;
        this.queryCallback = options.queryCallback.bind(this);
        this.frequency = options.frequency ?? 60000;
    }

    async handleUpdate(data: Partial<ZoneDataMap>) {
        const d = data[this.type];
        if (!d) {
            throw new Error(`No data for type ${this.type}`);
        }
        // Update the store with the new data
        await this.store.set(this.name, this.type, d);
    }

    async tick() {
        const data = await this.queryCallback();
        await this.handleUpdate(data);
    }

    cancel() {
        clearInterval(this.interval);
    }

    start() {
        this.interval = setInterval(() => this.tick(), this.frequency);
    }
}