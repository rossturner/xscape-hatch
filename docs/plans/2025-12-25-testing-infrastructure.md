# Testing Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Vitest-based unit and integration testing to xscape-hatch Chrome extension.

**Architecture:** Unit tests use vitest-chrome to mock Chrome APIs and jsdom for DOM testing. Integration tests run real Tesseract.js OCR against example images. Tests live in `test/` directory mirroring `src/` structure.

**Tech Stack:** Vitest, vitest-chrome, jsdom, @vitest/coverage-v8

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install test dependencies**

Run:
```bash
npm install -D vitest vitest-chrome @vitest/coverage-v8 jsdom @types/jsdom
```

**Step 2: Verify installation**

Run: `npm ls vitest`
Expected: Shows vitest in dependency tree

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest testing dependencies"
```

---

## Task 2: Configure Vitest

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`

**Step 1: Add test configuration to vite.config.ts**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {},
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/types/**'],
    },
  },
});
```

**Step 2: Update package.json scripts**

Replace the `"test"` script and add new scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run test/unit",
    "test:integration": "vitest run test/integration",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Step 3: Commit**

```bash
git add vite.config.ts package.json
git commit -m "chore: configure vitest in vite.config.ts"
```

---

## Task 3: Create Test Setup File

**Files:**
- Create: `test/setup.ts`

**Step 1: Create test directory**

Run:
```bash
mkdir -p test
```

**Step 2: Create setup.ts**

```ts
import chrome from 'vitest-chrome';
import { vi, beforeEach } from 'vitest';

Object.assign(globalThis, { chrome });

beforeEach(() => {
  vi.clearAllMocks();
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.storage.local.remove.mockResolvedValue(undefined);
});
```

**Step 3: Run vitest to verify setup works**

Run: `npm test`
Expected: "No test files found" (no error about setup)

**Step 4: Commit**

```bash
git add test/setup.ts
git commit -m "chore: add vitest setup file with chrome mocks"
```

---

## Task 4: Create Mock Factories

**Files:**
- Create: `test/fixtures/mocks/chrome.ts`
- Create: `test/fixtures/mocks/dom.ts`
- Create: `test/fixtures/mocks/tesseract.ts`

**Step 1: Create directories**

Run:
```bash
mkdir -p test/fixtures/mocks
```

**Step 2: Create chrome.ts**

```ts
import chrome from 'vitest-chrome';

export function mockCacheHit(handle: string, exists: boolean, displayName: string | null = null) {
  const key = `bsky:${handle}`;
  chrome.storage.local.get.mockResolvedValue({
    [key]: { exists, displayName, checkedAt: Date.now() },
  });
}

export function mockCacheMiss() {
  chrome.storage.local.get.mockResolvedValue({});
}

export function mockExpiredCache(handle: string, exists: boolean, ageMs: number) {
  const key = `bsky:${handle}`;
  chrome.storage.local.get.mockResolvedValue({
    [key]: { exists, displayName: null, checkedAt: Date.now() - ageMs },
  });
}
```

**Step 3: Create dom.ts**

```ts
export function createMockArticle(textContent: string, images: string[] = []): HTMLElement {
  const article = document.createElement('article');
  const textDiv = document.createElement('div');
  textDiv.textContent = textContent;
  article.appendChild(textDiv);

  images.forEach((src) => {
    const img = document.createElement('img');
    img.src = src;
    Object.defineProperty(img, 'width', { value: 200, writable: true });
    Object.defineProperty(img, 'height', { value: 200, writable: true });
    article.appendChild(img);
  });

  return article;
}

export function createMockHandleLink(handle: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `/${handle}`;
  link.textContent = `@${handle}`;
  return link;
}
```

**Step 4: Create tesseract.ts**

```ts
import { vi } from 'vitest';

export function createMockTesseractWorker(ocrText: string) {
  return {
    recognize: vi.fn().mockResolvedValue({
      data: { text: ocrText },
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  };
}
```

**Step 5: Commit**

```bash
git add test/fixtures/mocks/
git commit -m "chore: add test mock factories for chrome, dom, tesseract"
```

---

## Task 5: Unit Tests for Constants (Regex Patterns)

**Files:**
- Create: `test/unit/shared/constants.test.ts`

**Step 1: Create directory**

Run:
```bash
mkdir -p test/unit/shared
```

**Step 2: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { BLUESKY_HANDLE_REGEX } from '../../../src/shared/constants';

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
```

**Step 3: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add test/unit/shared/constants.test.ts
git commit -m "test: add unit tests for BLUESKY_HANDLE_REGEX"
```

---

## Task 6: Unit Tests for Cache Module

**Files:**
- Create: `test/unit/background/cache.test.ts`

**Step 1: Create directory**

Run:
```bash
mkdir -p test/unit/background
```

**Step 2: Write tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import chrome from 'vitest-chrome';
import { getCachedHandle, setCachedHandle, pruneCache } from '../../../src/background/cache';
import { CACHE } from '../../../src/shared/constants';

describe('cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCachedHandle', () => {
    it('returns null on cache miss', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      const result = await getCachedHandle('user.bsky.social');
      expect(result).toBeNull();
    });

    it('returns entry on cache hit', async () => {
      const entry = { exists: true, displayName: 'User', checkedAt: Date.now() };
      chrome.storage.local.get.mockResolvedValue({ 'bsky:user.bsky.social': entry });

      const result = await getCachedHandle('user.bsky.social');
      expect(result).toEqual(entry);
    });

    it('returns null and removes entry if TTL expired for existing handle', async () => {
      const expiredTime = Date.now() - CACHE.existsTTL - 1000;
      const entry = { exists: true, displayName: null, checkedAt: expiredTime };
      chrome.storage.local.get.mockResolvedValue({ 'bsky:user.bsky.social': entry });
      chrome.storage.local.remove.mockResolvedValue(undefined);

      const result = await getCachedHandle('user.bsky.social');
      expect(result).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('bsky:user.bsky.social');
    });

    it('returns null and removes entry if TTL expired for non-existing handle', async () => {
      const expiredTime = Date.now() - CACHE.notExistsTTL - 1000;
      const entry = { exists: false, displayName: null, checkedAt: expiredTime };
      chrome.storage.local.get.mockResolvedValue({ 'bsky:fake.bsky.social': entry });
      chrome.storage.local.remove.mockResolvedValue(undefined);

      const result = await getCachedHandle('fake.bsky.social');
      expect(result).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('bsky:fake.bsky.social');
    });
  });

  describe('setCachedHandle', () => {
    it('stores entry with correct key and structure', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      const beforeSet = Date.now();

      await setCachedHandle('user.bsky.social', true, 'Display Name');

      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
      const call = chrome.storage.local.set.mock.calls[0][0];
      expect(call['bsky:user.bsky.social']).toMatchObject({
        exists: true,
        displayName: 'Display Name',
      });
      expect(call['bsky:user.bsky.social'].checkedAt).toBeGreaterThanOrEqual(beforeSet);
    });

    it('stores non-existing handle', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);

      await setCachedHandle('fake.bsky.social', false);

      const call = chrome.storage.local.set.mock.calls[0][0];
      expect(call['bsky:fake.bsky.social']).toMatchObject({
        exists: false,
        displayName: null,
      });
    });
  });

  describe('pruneCache', () => {
    it('removes oldest entries when over limit', async () => {
      const entries: Record<string, unknown> = {};
      for (let i = 0; i < 10; i++) {
        entries[`bsky:user${i}.bsky.social`] = {
          exists: true,
          displayName: null,
          checkedAt: i * 1000,
        };
      }
      chrome.storage.local.get.mockResolvedValue(entries);
      chrome.storage.local.remove.mockResolvedValue(undefined);

      await pruneCache(5);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        'bsky:user0.bsky.social',
        'bsky:user1.bsky.social',
        'bsky:user2.bsky.social',
        'bsky:user3.bsky.social',
        'bsky:user4.bsky.social',
      ]);
    });

    it('does nothing when under limit', async () => {
      const entries = {
        'bsky:user1.bsky.social': { exists: true, displayName: null, checkedAt: 1000 },
        'bsky:user2.bsky.social': { exists: true, displayName: null, checkedAt: 2000 },
      };
      chrome.storage.local.get.mockResolvedValue(entries);

      await pruneCache(5);

      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    });
  });
});
```

**Step 3: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add test/unit/background/cache.test.ts
git commit -m "test: add unit tests for cache module"
```

---

## Task 7: Unit Tests for Bluesky API Module

**Files:**
- Create: `test/unit/background/bluesky-api.test.ts`

**Step 1: Write tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyBlueskyProfile } from '../../../src/background/bluesky-api';

describe('verifyBlueskyProfile', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns exists:true with displayName for valid profile', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ displayName: 'Test User' }),
    });

    const result = await verifyBlueskyProfile('test.bsky.social');

    expect(result).toEqual({ exists: true, displayName: 'Test User' });
    expect(fetch).toHaveBeenCalledWith(
      'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=test.bsky.social'
    );
  });

  it('returns exists:true with null displayName when not provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await verifyBlueskyProfile('nodisplay.bsky.social');

    expect(result).toEqual({ exists: true, displayName: null });
  });

  it('returns exists:false for 400 response (handle not found)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });

    const result = await verifyBlueskyProfile('nonexistent.bsky.social');

    expect(result).toEqual({ exists: false, displayName: null });
  });

  it('returns null for other error status codes', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await verifyBlueskyProfile('error.bsky.social');

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await verifyBlueskyProfile('network-error.bsky.social');

    expect(result).toBeNull();
  });

  it('encodes special characters in handle', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ displayName: 'Test' }),
    });

    await verifyBlueskyProfile('user+test.bsky.social');

    expect(fetch).toHaveBeenCalledWith(
      'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=user%2Btest.bsky.social'
    );
  });
});
```

**Step 2: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add test/unit/background/bluesky-api.test.ts
git commit -m "test: add unit tests for bluesky-api module"
```

---

## Task 8: Unit Tests for Badge Injector Module

**Files:**
- Create: `test/unit/content/badge-injector.test.ts`

**Step 1: Create directory**

Run:
```bash
mkdir -p test/unit/content
```

**Step 2: Write tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBadge,
  updateBadgeState,
  badgeExistsFor,
  injectBadge,
} from '../../../src/content/badge-injector';

describe('badge-injector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('createBadge', () => {
    it('creates anchor element with correct class', () => {
      const badge = createBadge('user.bsky.social');
      expect(badge.tagName).toBe('A');
      expect(badge.className).toBe('xscape-hatch-badge');
    });

    it('sets correct href to bsky profile', () => {
      const badge = createBadge('user.bsky.social');
      expect(badge.href).toBe('https://bsky.app/profile/user.bsky.social');
    });

    it('opens in new tab', () => {
      const badge = createBadge('user.bsky.social');
      expect(badge.target).toBe('_blank');
      expect(badge.rel).toBe('noopener noreferrer');
    });

    it('sets data attributes', () => {
      const badge = createBadge('user.bsky.social');
      expect(badge.hasAttribute('data-xscape-hatch')).toBe(true);
      expect(badge.getAttribute('data-handle')).toBe('user.bsky.social');
      expect(badge.getAttribute('data-verified')).toBe('pending');
    });

    it('contains SVG and handle text', () => {
      const badge = createBadge('user.bsky.social');
      expect(badge.querySelector('svg')).not.toBeNull();
      expect(badge.querySelector('span')?.textContent).toBe('@user.bsky.social');
    });
  });

  describe('updateBadgeState', () => {
    it('sets data-verified to true when exists', () => {
      const badge = createBadge('user.bsky.social');
      document.body.appendChild(badge);

      updateBadgeState('user.bsky.social', true);

      expect(badge.getAttribute('data-verified')).toBe('true');
    });

    it('removes badge when handle does not exist', () => {
      const badge = createBadge('fake.bsky.social');
      document.body.appendChild(badge);

      updateBadgeState('fake.bsky.social', false);

      expect(document.querySelector('.xscape-hatch-badge')).toBeNull();
    });

    it('updates multiple badges for same handle', () => {
      const badge1 = createBadge('user.bsky.social');
      const badge2 = createBadge('user.bsky.social');
      document.body.appendChild(badge1);
      document.body.appendChild(badge2);

      updateBadgeState('user.bsky.social', true);

      expect(badge1.getAttribute('data-verified')).toBe('true');
      expect(badge2.getAttribute('data-verified')).toBe('true');
    });
  });

  describe('badgeExistsFor', () => {
    it('returns false when no badge exists', () => {
      const container = document.createElement('div');
      expect(badgeExistsFor('user.bsky.social', container)).toBe(false);
    });

    it('returns true when badge exists in container', () => {
      const container = document.createElement('div');
      const badge = createBadge('user.bsky.social');
      container.appendChild(badge);

      expect(badgeExistsFor('user.bsky.social', container)).toBe(true);
    });

    it('returns false for different handle', () => {
      const container = document.createElement('div');
      const badge = createBadge('other.bsky.social');
      container.appendChild(badge);

      expect(badgeExistsFor('user.bsky.social', container)).toBe(false);
    });
  });

  describe('injectBadge', () => {
    it('inserts badge before target element', () => {
      const parent = document.createElement('div');
      const target = document.createElement('span');
      target.textContent = 'target';
      parent.appendChild(target);
      document.body.appendChild(parent);

      const badge = createBadge('user.bsky.social');
      injectBadge(badge, target);

      expect(parent.children[0]).toBe(badge);
      expect(parent.children[1]).toBe(target);
    });

    it('does nothing if target has no parent', () => {
      const target = document.createElement('span');
      const badge = createBadge('user.bsky.social');

      injectBadge(badge, target);

      expect(badge.parentElement).toBeNull();
    });
  });
});
```

**Step 3: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add test/unit/content/badge-injector.test.ts
git commit -m "test: add unit tests for badge-injector module"
```

---

## Task 9: Unit Tests for DOM Observer (Handle Extraction)

**Files:**
- Modify: `src/content/dom-observer.ts` (export helper functions for testing)
- Create: `test/unit/content/dom-observer.test.ts`

**Step 1: Export helper functions from dom-observer.ts**

Add `export` keyword to the helper functions at the bottom of the file:

```ts
export function extractHandlesFromArticle(article: HTMLElement): string[] {
  // ... existing code
}

export function extractImagesFromArticle(article: HTMLElement): string[] {
  // ... existing code
}

export function findHandleElements(article: HTMLElement): HandleElement[] {
  // ... existing code
}
```

**Step 2: Write tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractHandlesFromArticle,
  extractImagesFromArticle,
  findHandleElements,
} from '../../../src/content/dom-observer';

describe('dom-observer helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('extractHandlesFromArticle', () => {
    it('extracts bluesky handle from text content', () => {
      const article = document.createElement('article');
      article.textContent = 'Follow me on user.bsky.social';

      const handles = extractHandlesFromArticle(article);

      expect(handles).toEqual(['user.bsky.social']);
    });

    it('extracts multiple handles', () => {
      const article = document.createElement('article');
      article.textContent = 'alice.bsky.social and bob.bsky.social are cool';

      const handles = extractHandlesFromArticle(article);

      expect(handles).toContain('alice.bsky.social');
      expect(handles).toContain('bob.bsky.social');
    });

    it('deduplicates handles', () => {
      const article = document.createElement('article');
      article.textContent = 'user.bsky.social mentioned user.bsky.social twice';

      const handles = extractHandlesFromArticle(article);

      expect(handles).toEqual(['user.bsky.social']);
    });

    it('lowercases handles', () => {
      const article = document.createElement('article');
      article.textContent = 'USER.BSKY.SOCIAL';

      const handles = extractHandlesFromArticle(article);

      expect(handles).toEqual(['user.bsky.social']);
    });

    it('returns empty array when no handles', () => {
      const article = document.createElement('article');
      article.textContent = 'No bluesky handles here';

      const handles = extractHandlesFromArticle(article);

      expect(handles).toEqual([]);
    });
  });

  describe('extractImagesFromArticle', () => {
    it('extracts images larger than 100x100', () => {
      const article = document.createElement('article');
      const img = document.createElement('img');
      img.src = 'https://example.com/image.jpg';
      Object.defineProperty(img, 'width', { value: 200 });
      Object.defineProperty(img, 'height', { value: 200 });
      article.appendChild(img);

      const images = extractImagesFromArticle(article);

      expect(images).toEqual(['https://example.com/image.jpg']);
    });

    it('filters out small images', () => {
      const article = document.createElement('article');
      const img = document.createElement('img');
      img.src = 'https://example.com/small.jpg';
      Object.defineProperty(img, 'width', { value: 50 });
      Object.defineProperty(img, 'height', { value: 50 });
      article.appendChild(img);

      const images = extractImagesFromArticle(article);

      expect(images).toEqual([]);
    });

    it('filters out avatar images by data-testid', () => {
      const article = document.createElement('article');
      const avatarContainer = document.createElement('div');
      avatarContainer.setAttribute('data-testid', 'Tweet-User-Avatar');
      const img = document.createElement('img');
      img.src = 'https://example.com/avatar.jpg';
      Object.defineProperty(img, 'width', { value: 200 });
      Object.defineProperty(img, 'height', { value: 200 });
      avatarContainer.appendChild(img);
      article.appendChild(avatarContainer);

      const images = extractImagesFromArticle(article);

      expect(images).toEqual([]);
    });

    it('filters out profile_images URLs', () => {
      const article = document.createElement('article');
      const img = document.createElement('img');
      img.src = 'https://pbs.twimg.com/profile_images/123/avatar.jpg';
      Object.defineProperty(img, 'width', { value: 200 });
      Object.defineProperty(img, 'height', { value: 200 });
      article.appendChild(img);

      const images = extractImagesFromArticle(article);

      expect(images).toEqual([]);
    });
  });

  describe('findHandleElements', () => {
    it('finds Twitter handle links', () => {
      const article = document.createElement('article');
      const link = document.createElement('a');
      link.href = '/testuser';
      link.textContent = '@testuser';
      article.appendChild(link);

      const elements = findHandleElements(article);

      expect(elements).toHaveLength(1);
      expect(elements[0].twitterHandle).toBe('testuser');
      expect(elements[0].inferredBluesky).toBe('testuser.bsky.social');
    });

    it('ignores links without @ prefix', () => {
      const article = document.createElement('article');
      const link = document.createElement('a');
      link.href = '/testuser';
      link.textContent = 'testuser';
      article.appendChild(link);

      const elements = findHandleElements(article);

      expect(elements).toHaveLength(0);
    });

    it('ignores handles longer than 15 characters', () => {
      const article = document.createElement('article');
      const link = document.createElement('a');
      link.href = '/verylongusername123';
      link.textContent = '@verylongusername123';
      article.appendChild(link);

      const elements = findHandleElements(article);

      expect(elements).toHaveLength(0);
    });

    it('lowercases inferred bluesky handle', () => {
      const article = document.createElement('article');
      const link = document.createElement('a');
      link.href = '/TestUser';
      link.textContent = '@TestUser';
      article.appendChild(link);

      const elements = findHandleElements(article);

      expect(elements[0].inferredBluesky).toBe('testuser.bsky.social');
    });
  });
});
```

**Step 3: Run tests**

Run: `npm run test:unit`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/content/dom-observer.ts test/unit/content/dom-observer.test.ts
git commit -m "test: add unit tests for dom-observer helpers"
```

---

## Task 10: Integration Test for OCR Pipeline

**Files:**
- Create: `test/integration/ocr-pipeline.test.ts`

**Step 1: Create directory**

Run:
```bash
mkdir -p test/integration
```

**Step 2: Write integration test**

```ts
import { describe, it, expect } from 'vitest';
import Tesseract from 'tesseract.js';
import * as path from 'path';
import * as fs from 'fs';

const BLUESKY_HANDLE_REGEX = /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi;

function extractHandlesFromText(text: string): string[] {
  const handles = new Set<string>();
  const matches = text.matchAll(BLUESKY_HANDLE_REGEX);
  for (const match of matches) {
    handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
}

describe('OCR Pipeline Integration', () => {
  const TEST_CASES = [
    { file: 'G894uCFb0AA1cqD.jpg', expected: ['momoameo.bsky.social'] },
    { file: 'G8_tqvob0AIuUUD.jpg', expected: ['tanishiii.bsky.social'] },
    { file: 'G9Axyuhb0AA66Px.jpg', expected: ['sasa-ekakiman.bsky.social'] },
    { file: 'GF68_dwawAAi43w.jpg', expected: ['yeni1871.bsky.social'] },
  ];

  const imagesDir = path.resolve(__dirname, '../../example_images');

  it.each(TEST_CASES)(
    'extracts handle from $file',
    async ({ file, expected }) => {
      const imagePath = path.join(imagesDir, file);

      if (!fs.existsSync(imagePath)) {
        console.warn(`Skipping test: ${imagePath} not found`);
        return;
      }

      const worker = await Tesseract.createWorker('eng');
      const {
        data: { text },
      } = await worker.recognize(imagePath);
      await worker.terminate();

      const handles = extractHandlesFromText(text);

      for (const handle of expected) {
        expect(handles).toContain(handle);
      }
    },
    { timeout: 30000 }
  );
});
```

**Step 3: Run integration tests**

Run: `npm run test:integration`
Expected: All tests PASS (may take 30-60 seconds for OCR)

**Step 4: Commit**

```bash
git add test/integration/ocr-pipeline.test.ts
git commit -m "test: add OCR pipeline integration tests"
```

---

## Task 11: Verify Full Test Suite

**Files:**
- None (verification only)

**Step 1: Run all tests**

Run: `npm test`
Expected: All unit and integration tests PASS

**Step 2: Run with coverage**

Run: `npm run test:coverage`
Expected: Coverage report generated, shows coverage for src/ files

**Step 3: Final commit with any cleanup**

```bash
git add -A
git commit -m "test: complete testing infrastructure setup"
```

---

## Summary

After completing all tasks, the project will have:

- **Vitest** configured with jsdom and vitest-chrome
- **6 unit test files** covering constants, cache, bluesky-api, badge-injector, dom-observer
- **1 integration test file** for OCR pipeline with real Tesseract.js
- **Mock factories** for chrome APIs, DOM elements, and Tesseract
- **npm scripts** for running unit tests, integration tests, and coverage

Run `npm test` for quick feedback, `npm run test:integration` for OCR tests.
