import { describe, expect, it } from 'vitest';

import { USERNAME_PATTERN } from './register';

describe('USERNAME_PATTERN', () => {
  it.each(['ana', 'maria_98', 'a12'])('accepts a valid username: %s', (username) => {
    expect(USERNAME_PATTERN.test(username)).toBe(true);
  });

  it.each([
    ['an', 'too short (2 chars)'],
    ['2ana', 'starts with a digit'],
    ['ana!', 'contains a disallowed character'],
  ])('rejects an invalid username: %s (%s)', (username) => {
    expect(USERNAME_PATTERN.test(username)).toBe(false);
  });
});
