import { describe, it, expect } from 'vitest';
import {
  BLUESKY_HANDLE_REGEX,
  API_CACHE,
  OCR_CACHE,
  MAPPING_CACHE,
} from '../../../src/shared/constants';

describe('BLUESKY_HANDLE_REGEX', () => {
  function extractHandles(text: string): string[] {
    const regex = new RegExp(BLUESKY_HANDLE_REGEX.source, BLUESKY_HANDLE_REGEX.flags);
    const handles: string[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      handles.push(match[1].toLowerCase());
    }
    return handles;
  }

  describe('valid handles', () => {
    it('matches simple handle', () => {
      expect(extractHandles('user.bsky.social')).toEqual(['user.bsky.social']);
    });

    it('matches handle with @ prefix', () => {
      expect(extractHandles('@user.bsky.social')).toEqual(['user.bsky.social']);
    });

    it('matches handle with hyphen', () => {
      expect(extractHandles('user-name.bsky.social')).toEqual(['user-name.bsky.social']);
    });

    it('matches handle with underscore', () => {
      expect(extractHandles('user_name.bsky.social')).toEqual(['user_name.bsky.social']);
    });

    it('matches handle with numbers', () => {
      expect(extractHandles('user123.bsky.social')).toEqual(['user123.bsky.social']);
    });

    it('matches multiple handles in text', () => {
      const text = 'Follow me @alice.bsky.social and @bob.bsky.social';
      expect(extractHandles(text)).toEqual(['alice.bsky.social', 'bob.bsky.social']);
    });

    it('matches handle in sentence', () => {
      const text = 'My bluesky is momoameo.bsky.social check it out';
      expect(extractHandles(text)).toEqual(['momoameo.bsky.social']);
    });
  });

  describe('invalid handles', () => {
    it('does not match .bsky.com', () => {
      expect(extractHandles('user.bsky.com')).toEqual([]);
    });

    it('does not match other domains', () => {
      expect(extractHandles('user.twitter.com')).toEqual([]);
    });

    it('does not match plain @username', () => {
      expect(extractHandles('@twitteruser')).toEqual([]);
    });
  });
});

describe('cache constants', () => {
  it('API_CACHE has correct structure', () => {
    expect(API_CACHE.prefix).toBe('xscape:api:');
    expect(API_CACHE.ttl).toBe(24 * 60 * 60 * 1000);
    expect(API_CACHE.maxEntries).toBe(10000);
  });

  it('OCR_CACHE has correct structure', () => {
    expect(OCR_CACHE.prefix).toBe('xscape:ocr:');
    expect(OCR_CACHE.ttl).toBe(7 * 24 * 60 * 60 * 1000);
    expect(OCR_CACHE.maxEntries).toBe(10000);
  });

  it('MAPPING_CACHE has correct structure', () => {
    expect(MAPPING_CACHE.prefix).toBe('xscape:mapping:');
    expect(MAPPING_CACHE.maxEntries).toBe(20000);
  });
});
