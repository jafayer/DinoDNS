import { RouteTrie } from "./RouteTrie";

test("RouteTrie", () => {
    const trie = new RouteTrie();
    trie.insert("example.com", () => console.log("example.com"));
    trie.insert("sub.example.com", () => console.log("sub.example.com"));
    trie.insert("*.example.org", () => console.log("*.example.org"));
    trie.insert("sub.example.org", () => console.log("sub.example.org"));


    expect(trie.search("example.com")).toHaveLength(1);
    expect(trie.search("example.net")).toBeNull();
    expect(trie.search("sub.example.com")).toHaveLength(1);
    expect(trie.search("sub.example.net")).toBeNull();
    expect(trie.search("sub.example.org")).toHaveLength(2);
    expect(trie.search("example.org")).toBeNull();
    expect(trie.search("example.net")).toBeNull();
});