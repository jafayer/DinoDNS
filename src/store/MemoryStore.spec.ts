import { MemoryStore } from "./MemoryStore";
import { DNSRecord, A, MX } from "../types/dns";

describe("MemoryStore", () => {
    let store: MemoryStore;

    beforeEach(() => {
        store = new MemoryStore();
    });

    it("should be able to store and retrieve data", async () => {
        const record = { data: "127.0.0.1" };
        await store.set("example.com", "A", record);
        const records = await store.get("example.com", "A");
        expect(records).toEqual([record]);
    });


    it("should be able to append data", async () => {
        const record1 = { data: "127.0.0.1" };
        const record2 = { data: "127.0.0.2" };
        await store.append("example.com", "A", record1);
        await store.append("example.com", "A", record2);
        const records = await store.get("example.com", "A");
        expect(records).toEqual([record1, record2]);
    });

    it("should be able to delete data", async () => {
        const record: A = { data: "127.0.0.1" };
        const record2: MX = { data: { preference: 10, exchange: "mail.example.com" }};
        await store.set("example.com", "A", record);
        await store.delete("example.com", "A");
        const records = await store.get("example.com", "A");
        expect(records).toBeNull();

        await store.set("example.com", "A", record);
        await store.set("example.com", "MX", record2);

        const records2 = await store.get("example.com", "A");
        expect(records2).toEqual([record]);
        const records3 = await store.get("example.com", "MX");
        expect(records3).toEqual([record2]);

        await store.delete("example.com", "A");
        const records4 = await store.get("example.com", "A");
        expect(records4).toBeNull();
        const records5 = await store.get("example.com", "MX");
        expect(records5).toEqual([record2]);
    });

});