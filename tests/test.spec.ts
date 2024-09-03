import { one } from '../src';

describe('if these are wrong, the universe is broken', () => {
  test('Tautologies', () => {
    expect(1).toBe(1);
    expect(1).not.toBe(2);
    expect(1).not.toBe(0);
    expect('hi').toBe('hi');
    expect([]).toHaveLength(0);
    expect(one).toBe(1);
  });
});
