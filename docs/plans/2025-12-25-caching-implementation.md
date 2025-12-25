# Caching Strategy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement three independent caches (API, OCR, Mapping) so detection methods run independently and failed inferred lookups don't block OCR.

**Architecture:** Replace current dual-cache system (handle cache + mapping cache) with three specialized caches. API cache dedupes Bluesky API calls, OCR cache dedupes image processing, Mapping cache stores verified Twitter→Bluesky links only. All mappings verified before creation.

**Tech Stack:** TypeScript, Chrome Extension APIs (storage.local), Vitest for testing

---

### Task 1: Update Types for New Cache Structures

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Write test for new types**

Types don't need runtime tests, but we'll verify the structure compiles. First, update the types file.

**Step 2: Update types file**

Add the new cache entry types and update `TwitterBlueskyMapping` to remove `verified` field:

```typescript
// Add after CacheEntry interface (line 17)

export interface ApiCacheEntry {
  exists: boolean;
  displayName: string | null;
  checkedAt: number;
}

export interface OcrCacheEntry {
  handles: string[];
  processedAt: number;
}

// Replace TwitterBlueskyMapping (lines 33-40) with:
export interface TwitterBlueskyMapping {
  twitterHandle: string;
  blueskyHandle: string;
  displayName: string | null;
  source: 'text' | 'image' | 'inferred';
  discoveredAt: number;
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: May have errors in files still using `verified` - that's expected, we'll fix them

**Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: update types for new cache architecture"
```

---

### Task 2: Update Constants for New Cache Prefixes

**Files:**
- Modify: `src/shared/constants.ts`
- Test: `test/unit/shared/constants.test.ts`

**Step 1: Update constants**

Replace the `CACHE` and `MAPPING_CACHE` constants with new structure:

```typescript
// Replace CACHE (lines 16-20) with:
export const API_CACHE = {
  prefix: 'xscape:api:',
  ttl: 24 * 60 * 60 * 1000, // 24 hours
  maxEntries: 1000,
} as const;

export const OCR_CACHE = {
  prefix: 'xscape:ocr:',
  ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxEntries: 500,
} as const;

// Replace MAPPING_CACHE (lines 22-25) with:
export const MAPPING_CACHE = {
  prefix: 'xscape:mapping:',
  ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxEntries: 1000,
} as const;
```

**Step 2: Update constants test**

The existing test file tests BLUESKY_HANDLE_REGEX. Add tests for new constants:

```typescript
// Add to test/unit/shared/constants.test.ts

describe('cache constants', () => {
  it('API_CACHE has correct structure', () => {
    expect(API_CACHE.prefix).toBe('xscape:api:');
    expect(API_CACHE.ttl).toBe(24 * 60 * 60 * 1000);
    expect(API_CACHE.maxEntries).toBe(1000);
  });

  it('OCR_CACHE has correct structure', () => {
    expect(OCR_CACHE.prefix).toBe('xscape:ocr:');
    expect(OCR_CACHE.ttl).toBe(7 * 24 * 60 * 60 * 1000);
    expect(OCR_CACHE.maxEntries).toBe(500);
  });

  it('MAPPING_CACHE has correct structure', () => {
    expect(MAPPING_CACHE.prefix).toBe('xscape:mapping:');
    expect(MAPPING_CACHE.ttl).toBe(7 * 24 * 60 * 60 * 1000);
    expect(MAPPING_CACHE.maxEntries).toBe(1000);
  });
});
```

**Step 3: Run test**

Run: `npm run test:unit -- test/unit/shared/constants.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/shared/constants.ts test/unit/shared/constants.test.ts
git commit -m "refactor: update cache constants with new prefixes and TTLs"
```

---

### Task 3: Create API Cache Module

**Files:**
- Create: `src/shared/api-cache.ts`
- Create: `test/unit/shared/api-cache.test.ts`

**Step 1: Write failing tests**

```typescript
// test/unit/shared/api-cache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getApiCache, setApiCache, isApiCacheStale } from '../../../src/shared/api-cache';
import { API_CACHE } from '../../../src/shared/constants';

describe('api-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getApiCache', () => {
    it('returns null on cache miss', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      const result = await getApiCache('user.bsky.social');
      expect(result).toBeNull();
    });

    it('returns entry on cache hit', async () => {
      const entry = { exists: true, displayName: 'User', checkedAt: Date.now() };
      chrome.storage.local.get.mockResolvedValue({ 'xscape:api:user.bsky.social': entry });
      const result = await getApiCache('user.bsky.social');
      expect(result).toEqual(entry);
    });

    it('returns null for stale entry', async () => {
      const staleTime = Date.now() - API_CACHE.ttl - 1000;
      const entry = { exists: true, displayName: null, checkedAt: staleTime };
      chrome.storage.local.get.mockResolvedValue({ 'xscape:api:user.bsky.social': entry });
      const result = await getApiCache('user.bsky.social');
      expect(result).toBeNull();
    });
  });

  describe('setApiCache', () => {
    it('stores entry with correct key', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      await setApiCache('user.bsky.social', { exists: true, displayName: 'User', checkedAt: Date.now() });
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'xscape:api:user.bsky.social': expect.objectContaining({ exists: true, displayName: 'User' }),
        })
      );
    });
  });

  describe('isApiCacheStale', () => {
    it('returns false for fresh entry', () => {
      const entry = { exists: true, displayName: null, checkedAt: Date.now() };
      expect(isApiCacheStale(entry)).toBe(false);
    });

    it('returns true for stale entry', () => {
      const entry = { exists: true, displayName: null, checkedAt: Date.now() - API_CACHE.ttl - 1000 };
      expect(isApiCacheStale(entry)).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- test/unit/shared/api-cache.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write implementation**

```typescript
// src/shared/api-cache.ts
import { API_CACHE } from './constants';
import type { ApiCacheEntry } from '../types';

export function isApiCacheStale(entry: ApiCacheEntry): boolean {
  return Date.now() - entry.checkedAt > API_CACHE.ttl;
}

export async function getApiCache(blueskyHandle: string): Promise<ApiCacheEntry | null> {
  const key = API_CACHE.prefix + blueskyHandle.toLowerCase();
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as ApiCacheEntry | undefined;

  if (!entry) return null;
  if (isApiCacheStale(entry)) return null;

  return entry;
}

export async function setApiCache(blueskyHandle: string, entry: ApiCacheEntry): Promise<void> {
  const key = API_CACHE.prefix + blueskyHandle.toLowerCase();
  await chrome.storage.local.set({ [key]: entry });
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- test/unit/shared/api-cache.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/api-cache.ts test/unit/shared/api-cache.test.ts
git commit -m "feat: add API cache module"
```

---

### Task 4: Create OCR Cache Module

**Files:**
- Create: `src/shared/ocr-cache.ts`
- Create: `test/unit/shared/ocr-cache.test.ts`

**Step 1: Write failing tests**

```typescript
// test/unit/shared/ocr-cache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOcrCache, setOcrCache, hashImageUrl } from '../../../src/shared/ocr-cache';
import { OCR_CACHE } from '../../../src/shared/constants';

describe('ocr-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashImageUrl', () => {
    it('returns consistent hash for same URL', () => {
      const url = 'https://pbs.twimg.com/media/ABC123.jpg';
      expect(hashImageUrl(url)).toBe(hashImageUrl(url));
    });

    it('returns different hash for different URLs', () => {
      const url1 = 'https://pbs.twimg.com/media/ABC123.jpg';
      const url2 = 'https://pbs.twimg.com/media/DEF456.jpg';
      expect(hashImageUrl(url1)).not.toBe(hashImageUrl(url2));
    });
  });

  describe('getOcrCache', () => {
    it('returns null on cache miss', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      const result = await getOcrCache('https://example.com/image.jpg');
      expect(result).toBeNull();
    });

    it('returns entry on cache hit', async () => {
      const url = 'https://example.com/image.jpg';
      const hash = hashImageUrl(url);
      const entry = { handles: ['user.bsky.social'], processedAt: Date.now() };
      chrome.storage.local.get.mockResolvedValue({ [`xscape:ocr:${hash}`]: entry });
      const result = await getOcrCache(url);
      expect(result).toEqual(entry);
    });

    it('returns null for stale entry', async () => {
      const url = 'https://example.com/image.jpg';
      const hash = hashImageUrl(url);
      const staleTime = Date.now() - OCR_CACHE.ttl - 1000;
      const entry = { handles: [], processedAt: staleTime };
      chrome.storage.local.get.mockResolvedValue({ [`xscape:ocr:${hash}`]: entry });
      const result = await getOcrCache(url);
      expect(result).toBeNull();
    });
  });

  describe('setOcrCache', () => {
    it('stores entry with hashed key', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      const url = 'https://example.com/image.jpg';
      await setOcrCache(url, ['user.bsky.social']);
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [`xscape:ocr:${hashImageUrl(url)}`]: expect.objectContaining({ handles: ['user.bsky.social'] }),
        })
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- test/unit/shared/ocr-cache.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write implementation**

```typescript
// src/shared/ocr-cache.ts
import { OCR_CACHE } from './constants';
import type { OcrCacheEntry } from '../types';

export function hashImageUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export async function getOcrCache(imageUrl: string): Promise<OcrCacheEntry | null> {
  const key = OCR_CACHE.prefix + hashImageUrl(imageUrl);
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as OcrCacheEntry | undefined;

  if (!entry) return null;
  if (Date.now() - entry.processedAt > OCR_CACHE.ttl) return null;

  return entry;
}

export async function setOcrCache(imageUrl: string, handles: string[]): Promise<void> {
  const key = OCR_CACHE.prefix + hashImageUrl(imageUrl);
  await chrome.storage.local.set({
    [key]: {
      handles,
      processedAt: Date.now(),
    } satisfies OcrCacheEntry,
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- test/unit/shared/ocr-cache.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/ocr-cache.ts test/unit/shared/ocr-cache.test.ts
git commit -m "feat: add OCR cache module"
```

---

### Task 5: Update Mapping Cache Module

**Files:**
- Modify: `src/shared/mapping-cache.ts`
- Modify: `test/unit/shared/mapping-cache.test.ts` (create if doesn't exist)

**Step 1: Write/update tests**

```typescript
// test/unit/shared/mapping-cache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadMappingCache,
  getMapping,
  saveMapping,
  shouldOverwriteMapping,
} from '../../../src/shared/mapping-cache';
import { MAPPING_CACHE } from '../../../src/shared/constants';

describe('mapping-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMapping', () => {
    it('returns null for unknown handle', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      await loadMappingCache();
      expect(getMapping('unknown')).toBeNull();
    });
  });

  describe('saveMapping', () => {
    it('stores mapping with correct key', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      chrome.storage.local.get.mockResolvedValue({});

      await saveMapping({
        twitterHandle: 'TestUser',
        blueskyHandle: 'testuser.bsky.social',
        displayName: 'Test User',
        source: 'text',
        discoveredAt: Date.now(),
      });

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'xscape:mapping:testuser': expect.objectContaining({
            blueskyHandle: 'testuser.bsky.social',
          }),
        })
      );
    });
  });

  describe('shouldOverwriteMapping', () => {
    const baseMapping = {
      twitterHandle: 'user',
      blueskyHandle: 'user.bsky.social',
      displayName: null,
      discoveredAt: Date.now(),
    };

    it('text overwrites inferred', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'inferred' }, 'text')).toBe(true);
    });

    it('text overwrites image', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'image' }, 'text')).toBe(true);
    });

    it('image overwrites inferred', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'inferred' }, 'image')).toBe(true);
    });

    it('inferred does not overwrite text', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'text' }, 'inferred')).toBe(false);
    });

    it('inferred does not overwrite image', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'image' }, 'inferred')).toBe(false);
    });

    it('image does not overwrite text', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'text' }, 'image')).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify current state**

Run: `npm run test:unit -- test/unit/shared/mapping-cache.test.ts`
Expected: May fail due to changed constants

**Step 3: Update implementation**

```typescript
// src/shared/mapping-cache.ts
import { MAPPING_CACHE } from './constants';
import type { TwitterBlueskyMapping } from '../types';

const memoryCache = new Map<string, TwitterBlueskyMapping>();

export async function loadMappingCache(): Promise<void> {
  memoryCache.clear();
  const storage = await chrome.storage.local.get(null);
  for (const [key, value] of Object.entries(storage)) {
    if (key.startsWith(MAPPING_CACHE.prefix)) {
      const twitterHandle = key.slice(MAPPING_CACHE.prefix.length);
      memoryCache.set(twitterHandle, value as TwitterBlueskyMapping);
    }
  }
}

export function getMapping(twitterHandle: string): TwitterBlueskyMapping | null {
  return memoryCache.get(twitterHandle.toLowerCase()) ?? null;
}

export async function saveMapping(mapping: TwitterBlueskyMapping): Promise<void> {
  const key = MAPPING_CACHE.prefix + mapping.twitterHandle.toLowerCase();
  memoryCache.set(mapping.twitterHandle.toLowerCase(), mapping);
  await chrome.storage.local.set({ [key]: mapping });
  await pruneIfNeeded();
}

async function pruneIfNeeded(): Promise<void> {
  if (memoryCache.size <= MAPPING_CACHE.maxEntries) return;

  const entries = Array.from(memoryCache.entries())
    .sort((a, b) => a[1].discoveredAt - b[1].discoveredAt);

  const toRemove = entries.slice(0, memoryCache.size - MAPPING_CACHE.maxEntries);
  const keysToRemove: string[] = [];

  for (const [handle] of toRemove) {
    memoryCache.delete(handle);
    keysToRemove.push(MAPPING_CACHE.prefix + handle);
  }

  await chrome.storage.local.remove(keysToRemove);
}

export function shouldOverwriteMapping(
  existing: TwitterBlueskyMapping,
  newSource: 'text' | 'image' | 'inferred'
): boolean {
  const priority = { text: 3, image: 2, inferred: 1 };
  return priority[newSource] > priority[existing.source];
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- test/unit/shared/mapping-cache.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/mapping-cache.ts test/unit/shared/mapping-cache.test.ts
git commit -m "refactor: update mapping cache to use new prefix and remove verified field"
```

---

### Task 6: Create lookupHandle Function

**Files:**
- Create: `src/shared/handle-lookup.ts`
- Create: `test/unit/shared/handle-lookup.test.ts`

**Step 1: Write failing tests**

```typescript
// test/unit/shared/handle-lookup.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookupHandle } from '../../../src/shared/handle-lookup';
import * as apiCache from '../../../src/shared/api-cache';

vi.mock('../../../src/shared/api-cache');

describe('lookupHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached result if available', async () => {
    const cached = { exists: true, displayName: 'User', checkedAt: Date.now() };
    vi.mocked(apiCache.getApiCache).mockResolvedValue(cached);

    const result = await lookupHandle('user.bsky.social');

    expect(result).toEqual(cached);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('calls API and caches result if not cached', async () => {
    vi.mocked(apiCache.getApiCache).mockResolvedValue(null);
    vi.mocked(apiCache.setApiCache).mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ exists: true, displayName: 'User' });

    const result = await lookupHandle('user.bsky.social');

    expect(result.exists).toBe(true);
    expect(result.displayName).toBe('User');
    expect(apiCache.setApiCache).toHaveBeenCalledWith(
      'user.bsky.social',
      expect.objectContaining({ exists: true, displayName: 'User' })
    );
  });

  it('caches non-existent handles', async () => {
    vi.mocked(apiCache.getApiCache).mockResolvedValue(null);
    vi.mocked(apiCache.setApiCache).mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ exists: false, displayName: null });

    const result = await lookupHandle('fake.bsky.social');

    expect(result.exists).toBe(false);
    expect(apiCache.setApiCache).toHaveBeenCalledWith(
      'fake.bsky.social',
      expect.objectContaining({ exists: false })
    );
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(apiCache.getApiCache).mockResolvedValue(null);
    chrome.runtime.sendMessage.mockResolvedValue({ error: true });

    const result = await lookupHandle('user.bsky.social');

    expect(result.exists).toBe(false);
    expect(apiCache.setApiCache).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- test/unit/shared/handle-lookup.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write implementation**

```typescript
// src/shared/handle-lookup.ts
import { MESSAGE_TYPES } from './constants';
import { getApiCache, setApiCache } from './api-cache';
import { log } from './debug';
import type { ApiCacheEntry, VerifyHandleResponse } from '../types';

export async function lookupHandle(blueskyHandle: string): Promise<ApiCacheEntry> {
  const cached = await getApiCache(blueskyHandle);
  if (cached) {
    log('API', `Cache hit: ${blueskyHandle} → exists=${cached.exists}`);
    return cached;
  }

  log('API', `Looking up: ${blueskyHandle}`);

  try {
    const response: VerifyHandleResponse = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.VERIFY_HANDLE,
      payload: { handle: blueskyHandle },
    });

    if (response?.error) {
      log('API', `Error looking up ${blueskyHandle}`);
      return { exists: false, displayName: null, checkedAt: Date.now() };
    }

    const entry: ApiCacheEntry = {
      exists: response.exists === true,
      displayName: response.displayName,
      checkedAt: Date.now(),
    };

    await setApiCache(blueskyHandle, entry);
    log('API', `${blueskyHandle}: ${entry.exists ? `✓ ${entry.displayName || 'exists'}` : '✗ not found'}`);

    return entry;
  } catch (error) {
    log('API', `Error looking up ${blueskyHandle}: ${error}`);
    return { exists: false, displayName: null, checkedAt: Date.now() };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- test/unit/shared/handle-lookup.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/handle-lookup.ts test/unit/shared/handle-lookup.test.ts
git commit -m "feat: add lookupHandle function with API caching"
```

---

### Task 7: Add getImageAuthor to DOM Observer

**Files:**
- Modify: `src/content/dom-observer.ts`
- Modify: `test/unit/content/dom-observer.test.ts`

**Step 1: Write failing test**

Add to existing test file:

```typescript
// Add to test/unit/content/dom-observer.test.ts

describe('getImageAuthor', () => {
  it('extracts author from image status URL', () => {
    document.body.innerHTML = `
      <article>
        <a href="/TestUser/status/123/photo/1">
          <img src="https://pbs.twimg.com/media/ABC.jpg" />
        </a>
      </article>
    `;
    const img = document.querySelector('img') as HTMLImageElement;
    expect(getImageAuthor(img)).toBe('TestUser');
  });

  it('returns null when no status URL found', () => {
    document.body.innerHTML = `
      <article>
        <img src="https://pbs.twimg.com/media/ABC.jpg" />
      </article>
    `;
    const img = document.querySelector('img') as HTMLImageElement;
    expect(getImageAuthor(img)).toBeNull();
  });

  it('extracts quoted author from quoted tweet image', () => {
    document.body.innerHTML = `
      <article>
        <a href="/QuotedUser/status/456/photo/1">
          <img src="https://pbs.twimg.com/media/DEF.jpg" />
        </a>
      </article>
    `;
    const img = document.querySelector('img') as HTMLImageElement;
    expect(getImageAuthor(img)).toBe('QuotedUser');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- test/unit/content/dom-observer.test.ts`
Expected: FAIL with "getImageAuthor is not exported"

**Step 3: Add implementation**

Add to `src/content/dom-observer.ts` after line 186:

```typescript
export function getImageAuthor(imageElement: HTMLImageElement): string | null {
  const imgLink = imageElement.closest('a[href*="/status/"]');
  const statusUrl = imgLink?.getAttribute('href');

  if (statusUrl) {
    const author = statusUrl.split('/')[1];
    if (author && author !== 'i' && author !== 'search') {
      return author;
    }
  }

  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- test/unit/content/dom-observer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/content/dom-observer.ts test/unit/content/dom-observer.test.ts
git commit -m "feat: add getImageAuthor function for quote tweet handling"
```

---

### Task 8: Update TweetData to Include Image Elements

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/content/dom-observer.ts`

**Step 1: Update TweetData type**

Change `images: string[]` to include the element for author detection:

```typescript
// In src/types/index.ts, update TweetData interface:
export interface ImageData {
  url: string;
  element: HTMLImageElement;
}

export interface TweetData {
  article: HTMLElement;
  author: TweetAuthor | null;
  blueskyHandles: string[];
  twitterHandles: HandleElement[];
  images: ImageData[];  // Changed from string[]
}
```

**Step 2: Update extractImagesFromArticle**

```typescript
// In src/content/dom-observer.ts, update extractImagesFromArticle:
export function extractImagesFromArticle(article: HTMLElement): ImageData[] {
  const images = article.querySelectorAll<HTMLImageElement>('img');
  const results: ImageData[] = [];
  images.forEach((img) => {
    if (img.src && img.width > 100 && img.height > 100) {
      const isAvatar =
        img.closest('[data-testid="Tweet-User-Avatar"]') ||
        img.src.includes('profile_images');
      if (!isAvatar) {
        results.push({ url: img.src, element: img });
      }
    }
  });
  return results;
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: Errors in content.ts where images are used - we'll fix in next task

**Step 4: Commit**

```bash
git add src/types/index.ts src/content/dom-observer.ts
git commit -m "refactor: change images to include element for author detection"
```

---

### Task 9: Rewrite Content Script with New Flow

**Files:**
- Modify: `src/content/content.ts`

**Step 1: Rewrite content.ts with new logic**

This is the main refactor. Replace the entire file:

```typescript
// src/content/content.ts
import { MESSAGE_TYPES } from '../shared/constants';
import { createDOMObserver, getImageAuthor } from './dom-observer';
import { loadMappingCache, getMapping, saveMapping, shouldOverwriteMapping } from '../shared/mapping-cache';
import { getOcrCache, setOcrCache } from '../shared/ocr-cache';
import { lookupHandle } from '../shared/handle-lookup';
import { createBadge, badgeExistsFor, injectBadge } from './badge-injector';
import { initDebug, log, exposeDebugGlobal } from '../shared/debug';
import type { TweetData, TwitterBlueskyMapping, ImageData } from '../types';

const ocrQueue: Array<{ imageUrl: string; twitterHandle: string }> = [];
let ocrProcessing = false;

async function init(): Promise<void> {
  console.log('[Xscape Hatch] Content script loaded');
  await initDebug();
  exposeDebugGlobal();
  await loadMappingCache();
  const observer = createDOMObserver(onTweetFound);
  observer.start();
  log('DOM', 'Initialized and watching for tweets');
}

async function processOCRQueue(): Promise<void> {
  if (ocrProcessing || ocrQueue.length === 0) return;

  ocrProcessing = true;
  const { imageUrl, twitterHandle } = ocrQueue.shift()!;

  log('OCR', `Processing image for @${twitterHandle} (queue: ${ocrQueue.length})`);

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.OCR_PROCESS,
      payload: { imageUrl, requestId: `ocr-${Date.now()}` },
    });

    const handles = response?.handles || [];
    await setOcrCache(imageUrl, handles);

    if (handles.length > 0) {
      log('OCR', `Found: ${handles.join(', ')}`);
      for (const blueskyHandle of handles) {
        await processDiscoveredHandle(twitterHandle, blueskyHandle, 'image');
      }
    }
  } catch (error) {
    log('OCR', `Error: ${error}`);
  }

  ocrProcessing = false;
  processOCRQueue();
}

async function queueImageForOCR(imageUrl: string, twitterHandle: string): Promise<void> {
  const cached = await getOcrCache(imageUrl);
  if (cached) {
    log('OCR', `Cache hit for image, handles: ${cached.handles.join(', ') || 'none'}`);
    for (const handle of cached.handles) {
      await processDiscoveredHandle(twitterHandle, handle, 'image');
    }
    return;
  }

  if (ocrQueue.length < 20) {
    ocrQueue.push({ imageUrl, twitterHandle });
    processOCRQueue();
  }
}

async function processDiscoveredHandle(
  twitterHandle: string,
  blueskyHandle: string,
  source: 'text' | 'image' | 'inferred'
): Promise<void> {
  const existing = getMapping(twitterHandle);
  if (existing && !shouldOverwriteMapping(existing, source)) {
    return;
  }

  const result = await lookupHandle(blueskyHandle);
  if (!result.exists) {
    log('CACHE', `@${twitterHandle} → ${blueskyHandle} (${source}) - not found on Bluesky`);
    return;
  }

  const mapping: TwitterBlueskyMapping = {
    twitterHandle: twitterHandle.toLowerCase(),
    blueskyHandle: blueskyHandle.toLowerCase(),
    displayName: result.displayName,
    source,
    discoveredAt: Date.now(),
  };

  log('CACHE', `@${twitterHandle} → ${blueskyHandle} (${source}) - verified`);
  await saveMapping(mapping);
  refreshBadgesForTwitterHandle(twitterHandle, mapping);
}

function refreshBadgesForTwitterHandle(twitterHandle: string, mapping: TwitterBlueskyMapping): void {
  const articles = document.querySelectorAll<HTMLElement>('article');

  for (const article of articles) {
    const authorLinks = article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');

    for (const link of authorLinks) {
      const href = link.getAttribute('href');
      if (!href) continue;

      const pathPart = href.slice(1).split('/')[0].split('?')[0];
      if (pathPart.toLowerCase() !== twitterHandle.toLowerCase()) continue;

      const text = link.textContent || '';
      if (!text.startsWith('@') && !link.querySelector('img[src*="profile_images"]')) {
        continue;
      }

      if (!badgeExistsFor(mapping.blueskyHandle, article)) {
        log('BADGE', `Injecting badge: @${twitterHandle} → ${mapping.blueskyHandle}`);
        const badge = createBadge(mapping.blueskyHandle);
        injectBadge(badge, link);
      }

      break;
    }
  }
}

function onTweetFound({ article, author, blueskyHandles, twitterHandles, images }: TweetData): void {
  if (!author) return;

  const existingMapping = getMapping(author.twitterHandle);

  if (existingMapping) {
    if (!badgeExistsFor(existingMapping.blueskyHandle, article)) {
      log('BADGE', `Injecting badge: @${author.twitterHandle} → ${existingMapping.blueskyHandle}`);
      const badge = createBadge(existingMapping.blueskyHandle);
      injectBadge(badge, author.authorElement);
    }
    return;
  }

  if (blueskyHandles.length > 0) {
    processDiscoveredHandle(author.twitterHandle, blueskyHandles[0], 'text');
  }

  images.forEach((imageData: ImageData) => {
    const imageAuthor = getImageAuthor(imageData.element);
    const targetAuthor = imageAuthor || author.twitterHandle;
    queueImageForOCR(imageData.url, targetAuthor);
  });

  if (blueskyHandles.length === 0) {
    const inferredHandle = `${author.twitterHandle.toLowerCase()}.bsky.social`;
    processDiscoveredHandle(author.twitterHandle, inferredHandle, 'inferred');
  }
}

init();
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Run all tests**

Run: `npm test`
Expected: PASS (some tests may need updates)

**Step 4: Commit**

```bash
git add src/content/content.ts
git commit -m "refactor: rewrite content script with new independent cache flow"
```

---

### Task 10: Update Background Cache to Use New Constants

**Files:**
- Modify: `src/background/cache.ts`

**Step 1: Update imports and constants**

The existing `cache.ts` in background uses old `CACHE` constant. Update to use `API_CACHE`:

```typescript
// src/background/cache.ts
import { API_CACHE } from '../shared/constants';
import { log } from '../shared/debug';
import type { CacheEntry } from '../types';

export async function getCachedHandle(handle: string): Promise<CacheEntry | null> {
  const key = API_CACHE.prefix + handle;
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as CacheEntry | undefined;

  if (!entry) {
    log('CACHE', `Miss: ${handle}`);
    return null;
  }

  if (Date.now() - entry.checkedAt > API_CACHE.ttl) {
    log('CACHE', `Expired: ${handle}`);
    await chrome.storage.local.remove(key);
    return null;
  }

  log('CACHE', `Hit: ${handle} → exists=${entry.exists}`);
  return entry;
}

export async function setCachedHandle(
  handle: string,
  exists: boolean,
  displayName: string | null = null
): Promise<void> {
  const key = API_CACHE.prefix + handle;
  log('CACHE', `Set: ${handle} → exists=${exists}`);
  await chrome.storage.local.set({
    [key]: {
      exists,
      displayName,
      checkedAt: Date.now(),
    } satisfies CacheEntry,
  });
}

export async function pruneCache(maxEntries = API_CACHE.maxEntries): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([key]) => key.startsWith(API_CACHE.prefix))
    .map(([key, value]) => ({ key, ...(value as CacheEntry) }))
    .sort((a, b) => a.checkedAt - b.checkedAt);

  if (entries.length > maxEntries) {
    const toRemove = entries.slice(0, entries.length - maxEntries).map((e) => e.key);
    log('CACHE', `Pruning ${toRemove.length} old entries`);
    await chrome.storage.local.remove(toRemove);
  }
}
```

**Step 2: Update cache tests**

Update `test/unit/background/cache.test.ts` to use new prefix:

```typescript
// Change all 'bsky:' prefixes to 'xscape:api:'
// e.g., 'bsky:user.bsky.social' → 'xscape:api:user.bsky.social'
```

**Step 3: Run tests**

Run: `npm run test:unit -- test/unit/background/cache.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/background/cache.ts test/unit/background/cache.test.ts
git commit -m "refactor: update background cache to use new API_CACHE constants"
```

---

### Task 11: Remove Diagnostic Logging

**Files:**
- Modify: `src/content/content.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/offscreen/offscreen.ts`
- Modify: `src/worker/ocr-worker.ts`

**Step 1: Remove console.warn diagnostic statements**

Search for `[Xscape:.*:DIAG]` and remove all those lines from:
- `content.ts` (should already be clean from Task 9)
- `service-worker.ts`
- `offscreen.ts`
- `ocr-worker.ts`

**Step 2: Run build**

Run: `npm run build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add src/background/service-worker.ts src/offscreen/offscreen.ts src/worker/ocr-worker.ts
git commit -m "chore: remove diagnostic logging"
```

---

### Task 12: Run Full Test Suite and Fix Issues

**Step 1: Run all tests**

Run: `npm test`

**Step 2: Fix any failing tests**

Address each failing test by either:
- Updating test to match new behavior
- Fixing implementation bugs

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Run lint**

Run: `npm run lint`
Expected: PASS (or fix issues)

**Step 5: Final commit**

```bash
git add -A
git commit -m "test: fix tests for new caching architecture"
```

---

### Task 13: Manual Testing

**Step 1: Build extension**

Run: `npm run build`

**Step 2: Load in Chrome**

1. Go to `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select `dist/` folder

**Step 3: Test on X.com**

1. Open X.com
2. Enable debug logging: `xscapeDebug(true)` in console
3. Scroll through timeline
4. Verify:
   - Badges appear for users with Bluesky handles in their tweets
   - OCR runs on images (check console for `[Xscape:OCR]` logs)
   - Quote tweets attribute images to correct author
   - Failed inferred lookups don't block OCR

**Step 4: Verify caches in DevTools**

1. Open DevTools → Application → Storage → Local Storage
2. Check for entries with prefixes:
   - `xscape:api:` - API responses
   - `xscape:ocr:` - Processed images
   - `xscape:mapping:` - User mappings

---

### Task 14: Final Commit and Cleanup

**Step 1: Review all changes**

Run: `git diff main --stat`

**Step 2: Create final commit if needed**

```bash
git add -A
git commit -m "feat: implement independent caching for OCR and handle verification"
```

**Step 3: Update CLAUDE.md if needed**

Add note about new cache prefixes if relevant for future development.
