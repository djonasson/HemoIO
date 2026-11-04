import { describe, expect, it } from 'vitest';
import { withoutKey } from './withoutKey';

describe('withoutKey', () => {
  it('replaces every copy of the key', () => {
    expect(withoutKey('Bad key sk-abc, check sk-abc', 'sk-abc')).toBe(
      'Bad key [API key], check [API key]'
    );
  });

  it('leaves a message without the key unchanged', () => {
    expect(withoutKey('Rate limited', 'sk-abc')).toBe('Rate limited');
  });

  it('leaves the message unchanged when there is no key', () => {
    expect(withoutKey('Rate limited', '')).toBe('Rate limited');
  });
});
