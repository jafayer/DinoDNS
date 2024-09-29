import { resolveWildcards, domainToRegexp } from './domainToRegexp';

describe('resolveWildcards', () => {
  test('replaces single wildcard', () => {
    expect(resolveWildcards('sub', '*.example.com')).toBe('sub.example.com');
  });

  test('no wildcard present', () => {
    expect(resolveWildcards('sub', 'example.com')).toBe('example.com');
  });

  test('replaces leftmost wildcard if more than one are present', () => {
    expect(resolveWildcards('second.sub', '*.example.*.com')).toBe('second.sub.example.*.com');
  });

  test('empty wildcard replacement', () => {
    expect(resolveWildcards('', '*.example.com')).toBe('example.com');
  });

  test('replaces leftmost adjacent wildcard in input string', () => {
    expect(resolveWildcards('sub', '*.*.example.com')).toBe('sub.*.example.com');
  });

  test('does not attempt to replace a wildcard located anywhere other than the leftmost part of the string', () => {
    expect(resolveWildcards('sub', 'example.*.com')).toBe('example.*.com');
  });

  test('does not attempt to replace a wildcard at the end of the string', () => {
    expect(resolveWildcards('sub', 'example.com.*')).toBe('example.com.*');
  });

  test('wildcard with numeric values', () => {
    expect(resolveWildcards('123', '*.example.com')).toBe('123.example.com');
  });
});

// describe('domainToRegexp', () => {
//   test('converts domain with no wildcard', () => {
//     const handler = domainToRegexp('example.com');
//     expect(handler.regexp.test('example.com')).toBe(true);
//     expect(handler.regexp.test('sub.example.com')).toBe(false);
//   });

//   test('converts domain with single wildcard', () => {
//     const handler = domainToRegexp('*.example.com');
//     expect(handler.regexp.test('sub.example.com')).toBe(true);
//     expect(handler.regexp.test('example.com')).toBe(false);
//   });

//   test('converts domain with multiple records', () => {
//     const handler = domainToRegexp('example.com/A|MX');
//     expect(handlfer.regexp.test('example.com/A')).toBe(true);
//     expect(handler.regexp.test('example.com/MX')).toBe(true);
//     expect(handler.regexp.test('example.com/TXT')).toBe(false);
//   });
// });