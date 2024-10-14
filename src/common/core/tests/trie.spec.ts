import { Trie } from '../trie';

type Record = {
  Key: string;
  Key2: string;
};
describe('Generic Trie tests', () => {
  let trie: Trie<Record>;

  beforeEach(() => {
    trie = new Trie<Record>();
  });

  it('should add data', () => {
    trie.add('example.com', 'Key', ['Value']);
    expect(trie.get('example.com', 'Key')).toEqual(['Value']);
  });

  it('should be able to get data of a specific type', () => {
    trie.add('example.com', 'Key', ['Value']);

    expect(trie.get('example.com', 'Key')).toEqual(['Value']);
  });

  it('should be able to get data of all types', () => {
    trie.add('example.com', 'Key', ['Value']);
    trie.add('example.com', 'Key2', ['Value2']);

    expect(trie.get('example.com')).toEqual(['Value', 'Value2']);
  });

  it('Should be able to get wildcard data', () => {
    trie.add('*.example.com', 'Key', ['Value']);

    expect(trie.get('sub.example.com', 'Key')).toEqual(['Value']);
  });

  it('should be able to ignore wildcard when getting exact', () => {
    trie.add('*.example.com', 'Key', ['Value']);
    trie.add('example.com', 'Key', ['Value2']);

    expect(trie.get('sub.example.com', 'Key')).toEqual(['Value']);
    expect(trie.get('sub.example.com', 'Key', false)).toEqual(null);
  });

  it('Should be able to get specific data even with wildcard data', () => {
    trie.add('*.example.com', 'Key', ['Value']);
    trie.add('test.example.com', 'Key', ['Value2']);
    trie.add('test.test.example.com', 'Key', ['Value3']);

    expect(trie.get('test.example.com', 'Key')).toEqual(['Value2']);
    expect(trie.get('example.com', 'Key')).toEqual(null);
    expect(trie.get('sub.example.com', 'Key')).toEqual(['Value']);
    expect(trie.get('test.test.example.com', 'Key')).toEqual(['Value3']);
  });

  it('should be able to get data even with multiple wildcards', () => {
    trie.add('*.example.com', 'Key', ['Value']);
    trie.add('*.sub.example.com', 'Key', ['Value2']);

    expect(trie.get('sub.example.com', 'Key')).toEqual(['Value']);
    expect(trie.get('sub.sub.example.com', 'Key')).toEqual(['Value2']);
  });

  it('should add and get data with multiple records', () => {
    trie.add('example.com', 'Key', ['Value']);
    expect(trie.get('example.com', 'Key')).toEqual(['Value']);
  });

  it('should append data', () => {
    trie.add('example.com', 'Key', ['Value']);
    trie.append('example.com', 'Key', 'Value2');
    expect(trie.get('example.com', 'Key')).toEqual(['Value', 'Value2']);
  });

  it('should delete data', () => {
    trie.add('example.com', 'Key', ['Value']);
    trie.delete('example.com', 'Key', 'Value');
    expect(trie.get('example.com', 'Key')).toEqual(null);
  });

  it('should delete a specific value', () => {
    trie.add('example.com', 'Key', ['Value', 'Value2']);
    trie.delete('example.com', 'Key', 'Value');
    expect(trie.get('example.com', 'Key')).toEqual(['Value2']);
  });

  it('should delete all data', () => {
    trie.add('example.com', 'Key', ['Value', 'Value2']);
    trie.delete('example.com', 'Key');
    expect(trie.get('example.com', 'Key')).toEqual(null);

    trie.add('example.com', 'Key', ['Value', 'Value2']);
    trie.delete('example.com');
    expect(trie.get('example.com', 'Key')).toEqual(null);
  });

  it('should resolve a domain', () => {
    trie.add('example.com', 'Key', ['Value']);
    expect(trie.resolve('example.com')).toEqual('example.com');
  });

  it('should resolve a domain with a wildcard', () => {
    trie.add('*.example.com', 'Key', ['Value']);
    expect(trie.resolve('sub.example.com')).toEqual('*.example.com');
  });

  it('should resolve a domain with multiple wildcards', () => {
    trie.add('*.example.com', 'Key', ['Value']);
    expect(trie.resolve('sub.sub.example.com')).toEqual('*.example.com');

    trie.add('*.sub.example.com', 'Key', ['Value']);
    expect(trie.resolve('sub.sub.example.com')).toEqual('*.sub.example.com');
  });

  it('should resolve a domain with multiple wildcards and exact', () => {
    trie.add('*.example.com', 'Key', ['Value']);
    trie.add('sub.example.com', 'Key', ['Value2']);
    expect(trie.resolve('sub.example.com')).toEqual('sub.example.com');

    trie.add('*.sub.example.com', 'Key', ['Value']);
    expect(trie.resolve('sub.sub.example.com')).toEqual('*.sub.example.com');

    trie.add('test.sub.example.com', 'Key', ['Value']);
    expect(trie.resolve('test.sub.example.com')).toEqual('test.sub.example.com');
  });

  it('should not resolve a domain that does not exist', () => {
    trie.add('example.com', 'Key', ['Value']);
    expect(trie.resolve('sub.example.com')).toEqual(null);
  });
});
