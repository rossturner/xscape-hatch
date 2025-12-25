# Twitter-to-Bluesky Account Mapping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable UI persistence by mapping Twitter accounts to Bluesky accounts, allowing instant badge re-injection when React re-renders tweets.

**Architecture:** Content script maintains an in-memory cache of Twitter→Bluesky mappings, persisted to chrome.storage.local. DOM observer extracts tweet authors (handling retweets), checks the cache, and either injects badges immediately or scans for handles.

**Tech Stack:** TypeScript, Chrome Extension APIs (storage, runtime), MutationObserver, existing OCR worker

**Testing:** Manual testing in Chrome with the extension loaded. No automated tests (Chrome extension DOM/API mocking adds significant complexity).

---

## Task 1: Add New Types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add TwitterBlueskyMapping interface**

Add after the existing `HandleElement` interface:

```typescript
export interface TwitterBlueskyMapping {
  twitterHandle: string;
  blueskyHandle: string;
  verified: boolean;
  displayName: string | null;
  discoveredAt: number;
  source: 'text' | 'image' | 'inferred';
}
```

**Step 2: Add TweetAuthor interface**

Add after `TwitterBlueskyMapping`:

```typescript
export interface TweetAuthor {
  twitterHandle: string;
  authorElement: HTMLElement;
  isRetweet: boolean;
  retweetedBy: string | null;
}
```

**Step 3: Update TweetData interface**

Replace the existing `TweetData` interface:

```typescript
export interface TweetData {
  article: HTMLElement;
  author: TweetAuthor | null;
  blueskyHandles: string[];
  twitterHandles: HandleElement[];
  images: string[];
}
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: Errors in files that use `TweetData` (expected, will fix in later tasks)

**Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add TwitterBlueskyMapping and TweetAuthor interfaces"
```

---

## Task 2: Add Mapping Cache Constants

**Files:**
- Modify: `src/shared/constants.ts`

**Step 1: Add mapping cache constants**

Add after the existing `CACHE` constant:

```typescript
export const MAPPING_CACHE = {
  prefix: 'twitter2bsky:',
  maxEntries: 500,
} as const;
```

**Step 2: Commit**

```bash
git add src/shared/constants.ts
git commit -m "feat(constants): add mapping cache configuration"
```

---

## Task 3: Create Mapping Cache Module

**Files:**
- Create: `src/shared/mapping-cache.ts`

**Step 1: Create the mapping cache module**

Create `src/shared/mapping-cache.ts`:

```typescript
import { MAPPING_CACHE } from './constants';
import type { TwitterBlueskyMapping } from '../types';

const memoryCache = new Map<string, TwitterBlueskyMapping>();

export async function loadMappingCache(): Promise<void> {
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

export async function updateMappingVerification(
  twitterHandle: string,
  verified: boolean,
  displayName: string | null
): Promise<void> {
  const existing = getMapping(twitterHandle);
  if (existing) {
    const updated: TwitterBlueskyMapping = {
      ...existing,
      verified,
      displayName,
    };
    await saveMapping(updated);
  }
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

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (new module has no dependents yet)

**Step 3: Commit**

```bash
git add src/shared/mapping-cache.ts
git commit -m "feat(cache): add Twitter-to-Bluesky mapping cache module"
```

---

## Task 4: Add Tweet Author Extraction to DOM Observer

**Files:**
- Modify: `src/content/dom-observer.ts`

**Step 1: Add extractTweetAuthor function**

Add this function before `extractHandlesFromArticle`:

```typescript
function extractTweetAuthor(article: HTMLElement): TweetAuthor | null {
  let isRetweet = false;
  let retweetedBy: string | null = null;

  const socialContext = article.querySelector('[data-testid="socialContext"]');
  if (socialContext) {
    const text = socialContext.textContent || '';
    if (text.includes('reposted') || text.includes('Retweeted')) {
      isRetweet = true;
      const retweeterLink = socialContext.querySelector('a[href^="/"]');
      if (retweeterLink) {
        const href = retweeterLink.getAttribute('href');
        if (href) {
          retweetedBy = href.slice(1).split('/')[0].split('?')[0];
        }
      }
    }
  }

  const userLinks = article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
  for (const link of userLinks) {
    const href = link.getAttribute('href');
    if (!href) continue;

    const pathPart = href.slice(1).split('/')[0].split('?')[0];
    if (!pathPart || pathPart === 'i' || pathPart === 'search' || pathPart === 'hashtag') {
      continue;
    }

    const text = link.textContent || '';
    if (text.startsWith('@') || link.querySelector('img[src*="profile_images"]')) {
      if (isRetweet && pathPart.toLowerCase() === retweetedBy?.toLowerCase()) {
        continue;
      }

      return {
        twitterHandle: pathPart,
        authorElement: link,
        isRetweet,
        retweetedBy,
      };
    }
  }

  return null;
}
```

**Step 2: Update TweetAuthor import**

Update the import at the top of the file:

```typescript
import type { TweetData, HandleElement, TweetAuthor } from '../types';
```

**Step 3: Update processArticle to include author**

Replace the `processArticle` function:

```typescript
function processArticle(article: HTMLElement): void {
  if (processedArticles.has(article)) return;
  processedArticles.add(article);

  const author = extractTweetAuthor(article);
  const handles = extractHandlesFromArticle(article);
  const images = extractImagesFromArticle(article);
  const handleElements = findHandleElements(article);

  if (author || handles.length > 0 || images.length > 0 || handleElements.length > 0) {
    onTweetFound({
      article,
      author,
      blueskyHandles: handles,
      twitterHandles: handleElements,
      images,
    });
  }
}
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: Errors in content.ts (expected, will fix next)

**Step 5: Commit**

```bash
git add src/content/dom-observer.ts
git commit -m "feat(dom-observer): add tweet author extraction with retweet detection"
```

---

## Task 5: Integrate Mapping Cache into Content Script

**Files:**
- Modify: `src/content/content.ts`

**Step 1: Add mapping cache imports**

Update imports at the top:

```typescript
import './styles.css';
import { MESSAGE_TYPES } from '../shared/constants';
import { createDOMObserver } from './dom-observer';
import {
  loadMappingCache,
  getMapping,
  saveMapping,
  updateMappingVerification,
  shouldOverwriteMapping,
} from '../shared/mapping-cache';
import {
  createBadge,
  updateBadgeState,
  badgeExistsFor,
  injectBadge,
} from './badge-injector';
import type {
  TweetData,
  WorkerOutgoingMessage,
  VerifyHandleResponse,
  TwitterBlueskyMapping,
} from '../types';
```

**Step 2: Replace the entire content script logic**

Replace everything after the imports:

```typescript
const processedImages = new Set<string>();
const pendingVerifications = new Set<string>();
let ocrWorker: Worker | null = null;
let ocrReady = false;
const ocrQueue: Array<{ imageUrl: string; twitterHandle: string }> = [];

async function init(): Promise<void> {
  await loadMappingCache();
  const observer = createDOMObserver(onTweetFound);
  observer.start();
  initOCRWorker();
}

function initOCRWorker(): void {
  const workerUrl = chrome.runtime.getURL('src/worker/ocr-worker.js');
  ocrWorker = new Worker(workerUrl, { type: 'module' });

  ocrWorker.onmessage = (e: MessageEvent<WorkerOutgoingMessage>) => {
    const message = e.data;

    if (message.type === 'ready') {
      ocrReady = true;
      processOCRQueue();
      return;
    }

    if (message.type === 'result' && message.id) {
      const twitterHandle = message.id;
      message.payload.handles.forEach((blueskyHandle) => {
        handleBlueskyDiscovered(twitterHandle, blueskyHandle, 'image');
      });
      processOCRQueue();
    }
  };

  ocrWorker.postMessage({ type: 'init' });
}

function processOCRQueue(): void {
  if (!ocrReady || ocrQueue.length === 0) return;

  const { imageUrl, twitterHandle } = ocrQueue.shift()!;
  ocrWorker?.postMessage({
    type: 'process',
    id: twitterHandle,
    payload: { imageUrl },
  });
}

function queueImageForOCR(imageUrl: string, twitterHandle: string): void {
  if (processedImages.has(imageUrl)) return;
  processedImages.add(imageUrl);

  if (processedImages.size > 1000) {
    const first = processedImages.values().next().value;
    if (first) processedImages.delete(first);
  }

  if (ocrQueue.length < 20) {
    ocrQueue.push({ imageUrl, twitterHandle });
    processOCRQueue();
  }
}

async function handleBlueskyDiscovered(
  twitterHandle: string,
  blueskyHandle: string,
  source: 'text' | 'image' | 'inferred'
): Promise<void> {
  const existing = getMapping(twitterHandle);

  if (existing) {
    if (!shouldOverwriteMapping(existing, source)) {
      return;
    }
  }

  const mapping: TwitterBlueskyMapping = {
    twitterHandle: twitterHandle.toLowerCase(),
    blueskyHandle: blueskyHandle.toLowerCase(),
    verified: false,
    displayName: null,
    discoveredAt: Date.now(),
    source,
  };

  await saveMapping(mapping);
  await verifyAndUpdateBadges(twitterHandle);
}

async function verifyAndUpdateBadges(twitterHandle: string): Promise<void> {
  const mapping = getMapping(twitterHandle);
  if (!mapping) return;

  if (mapping.verified) {
    refreshBadgesForTwitterHandle(twitterHandle, mapping);
    return;
  }

  if (pendingVerifications.has(mapping.blueskyHandle)) {
    return;
  }

  pendingVerifications.add(mapping.blueskyHandle);

  try {
    const result: VerifyHandleResponse = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.VERIFY_HANDLE,
      payload: { handle: mapping.blueskyHandle },
    });

    if (result && !result.error) {
      await updateMappingVerification(
        twitterHandle,
        result.exists === true,
        result.displayName
      );

      const updatedMapping = getMapping(twitterHandle);
      if (updatedMapping) {
        refreshBadgesForTwitterHandle(twitterHandle, updatedMapping);
      }
    }
  } catch (error) {
    console.error('Xscape Hatch: verification error', error);
  } finally {
    pendingVerifications.delete(mapping.blueskyHandle);
  }
}

function refreshBadgesForTwitterHandle(
  twitterHandle: string,
  mapping: TwitterBlueskyMapping
): void {
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

      if (badgeExistsFor(mapping.blueskyHandle, article)) {
        updateBadgeState(mapping.blueskyHandle, mapping.verified && mapping.displayName !== null);
      } else if (mapping.verified) {
        const badge = createBadge(mapping.blueskyHandle);
        injectBadge(badge, link);
        updateBadgeState(mapping.blueskyHandle, true);
      }

      break;
    }
  }
}

function onTweetFound({ article, author, blueskyHandles, twitterHandles, images }: TweetData): void {
  if (!author) {
    blueskyHandles.forEach((handle) => {
      twitterHandles.forEach(({ element, twitterHandle }) => {
        handleBlueskyDiscovered(twitterHandle, handle, 'text');
      });
    });

    twitterHandles.forEach(({ twitterHandle, inferredBluesky }) => {
      handleBlueskyDiscovered(twitterHandle, inferredBluesky, 'inferred');
    });

    return;
  }

  const existingMapping = getMapping(author.twitterHandle);

  if (existingMapping?.verified) {
    if (!badgeExistsFor(existingMapping.blueskyHandle, article)) {
      const badge = createBadge(existingMapping.blueskyHandle);
      injectBadge(badge, author.authorElement);
      updateBadgeState(existingMapping.blueskyHandle, true);
    }
    return;
  }

  if (existingMapping && !existingMapping.verified) {
    if (!badgeExistsFor(existingMapping.blueskyHandle, article)) {
      const badge = createBadge(existingMapping.blueskyHandle);
      injectBadge(badge, author.authorElement);
    }
    verifyAndUpdateBadges(author.twitterHandle);
    return;
  }

  if (blueskyHandles.length > 0) {
    handleBlueskyDiscovered(author.twitterHandle, blueskyHandles[0], 'text');
    return;
  }

  images.forEach((imageUrl) => {
    queueImageForOCR(imageUrl, author.twitterHandle);
  });

  twitterHandles.forEach(({ twitterHandle, inferredBluesky }) => {
    if (twitterHandle.toLowerCase() === author.twitterHandle.toLowerCase()) {
      handleBlueskyDiscovered(author.twitterHandle, inferredBluesky, 'inferred');
    }
  });
}

init();
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/content/content.ts
git commit -m "feat(content): integrate mapping cache for UI persistence"
```

---

## Task 6: Manual Testing

**Step 1: Load the extension in Chrome**

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/` folder

**Step 2: Test on X.com**

1. Navigate to x.com and log in
2. Find a tweet from a user with a known Bluesky account
3. Verify badge appears next to their handle
4. Scroll away so the tweet leaves viewport
5. Scroll back - badge should reappear immediately (from cache)

**Step 3: Test retweets**

1. Find a retweet
2. Verify the badge appears for the original author, not the retweeter

**Step 4: Test cache persistence**

1. Note a user with a verified badge
2. Reload the page
3. Badge should appear immediately without re-verification

**Step 5: Inspect storage**

Open DevTools → Application → Local Storage → extension ID
Verify entries with `twitter2bsky:` prefix exist

**Step 6: Commit any fixes discovered during testing**

If issues found, fix and commit with descriptive message.

---

## Task 7: Final Cleanup and Documentation

**Step 1: Run lint**

Run: `npm run lint`
Fix any issues reported.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Update CLAUDE.md if needed**

If the architecture section needs updates, modify it to reflect the new mapping cache layer.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: cleanup and documentation updates"
```
