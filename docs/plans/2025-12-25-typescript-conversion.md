# TypeScript Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the entire Xscape Hatch Chrome extension from JavaScript to TypeScript with strict type checking.

**Architecture:** Rename all `.js` files to `.ts`, add type annotations, install TypeScript tooling. Vite/CRXJS already supports TypeScript natively—no bundler config changes needed beyond renaming `vite.config.js`.

**Tech Stack:** TypeScript 5.x, @types/chrome, @typescript-eslint, tesseract.js (npm)

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install TypeScript and type definitions**

Run:
```bash
npm install -D typescript @types/chrome @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

**Step 2: Install tesseract.js as dependency**

Run:
```bash
npm install tesseract.js
```

**Step 3: Add typecheck script to package.json**

Add to `scripts` section:
```json
"typecheck": "tsc --noEmit"
```

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add TypeScript and related dependencies"
```

---

## Task 2: Create tsconfig.json

**Files:**
- Create: `tsconfig.json`

**Step 1: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["./src/shared/*"],
      "@content/*": ["./src/content/*"],
      "@background/*": ["./src/background/*"],
      "@worker/*": ["./src/worker/*"],
      "@types/*": ["./src/types/*"]
    }
  },
  "include": ["src/**/*", "vite.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 2: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add tsconfig.json with strict mode"
```

---

## Task 3: Create ESLint Configuration

**Files:**
- Create: `eslint.config.js`

**Step 1: Create eslint.config.js**

```javascript
import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
```

**Step 2: Verify ESLint can run (will fail on .js files, that's ok)**

Run:
```bash
npm run lint 2>&1 || echo "Expected to fail - no .ts files yet"
```

**Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore: add ESLint config for TypeScript"
```

---

## Task 4: Create Type Definitions

**Files:**
- Create: `src/types/index.ts`

**Step 1: Create src/types directory**

Run:
```bash
mkdir -p src/types
```

**Step 2: Create src/types/index.ts**

```typescript
export interface VerifyHandleMessage {
  type: 'VERIFY_HANDLE';
  payload: { handle: string };
}

export interface VerifyHandleResponse {
  handle: string;
  exists: boolean | null;
  displayName: string | null;
  error?: boolean;
}

export interface CacheEntry {
  exists: boolean;
  displayName: string | null;
  checkedAt: number;
}

export interface TweetData {
  article: HTMLElement;
  blueskyHandles: string[];
  twitterHandles: HandleElement[];
  images: string[];
}

export interface HandleElement {
  element: HTMLAnchorElement;
  twitterHandle: string;
  inferredBluesky: string;
}

export type WorkerIncomingMessage =
  | { type: 'init'; id?: string }
  | { type: 'process'; id?: string; payload: { imageUrl: string } }
  | { type: 'terminate' };

export type WorkerOutgoingMessage =
  | { type: 'ready'; id?: string }
  | { type: 'result'; id?: string; payload: { imageUrl: string; handles: string[] } };
```

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add TypeScript type definitions"
```

---

## Task 5: Convert vite.config.js to TypeScript

**Files:**
- Rename: `vite.config.js` → `vite.config.ts`

**Step 1: Rename file**

Run:
```bash
mv vite.config.js vite.config.ts
```

**Step 2: Update vite.config.ts content**

```typescript
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
});
```

**Step 3: Run typecheck to verify**

Run:
```bash
npm run typecheck 2>&1 || echo "Expected errors - source files not converted yet"
```

**Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "chore: convert vite.config to TypeScript"
```

---

## Task 6: Convert src/shared/constants.js

**Files:**
- Rename: `src/shared/constants.js` → `src/shared/constants.ts`

**Step 1: Rename file**

Run:
```bash
mv src/shared/constants.js src/shared/constants.ts
```

**Step 2: Update src/shared/constants.ts**

```typescript
export const BLUESKY_HANDLE_REGEX = /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi;

export const TWITTER_HANDLE_REGEX = /@([a-zA-Z0-9_]{1,15})/g;

export const SELECTORS = {
  article: 'article',
  tweetText: '[data-testid="tweetText"]',
  userNameFallback: 'a[href^="/"]',
} as const;

export const BLUESKY_API = {
  profileUrl: 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile',
  webProfileUrl: 'https://bsky.app/profile',
} as const;

export const CACHE = {
  prefix: 'bsky:',
  existsTTL: 7 * 24 * 60 * 60 * 1000,
  notExistsTTL: 24 * 60 * 60 * 1000,
} as const;

export const BADGE_ATTR = 'data-xscape-hatch';

export const MESSAGE_TYPES = {
  VERIFY_HANDLE: 'VERIFY_HANDLE',
  HANDLE_VERIFIED: 'HANDLE_VERIFIED',
  OCR_INIT: 'OCR_INIT',
  OCR_READY: 'OCR_READY',
  OCR_PROCESS: 'OCR_PROCESS',
  OCR_RESULT: 'OCR_RESULT',
} as const;
```

**Step 3: Commit**

```bash
git add src/shared/constants.ts
git commit -m "feat: convert constants.js to TypeScript"
```

---

## Task 7: Convert src/shared/messaging.js

**Files:**
- Rename: `src/shared/messaging.js` → `src/shared/messaging.ts`

**Step 1: Rename file**

Run:
```bash
mv src/shared/messaging.js src/shared/messaging.ts
```

**Step 2: Update src/shared/messaging.ts**

```typescript
export function sendToBackground<T, R>(type: string, payload: T): Promise<R> {
  return chrome.runtime.sendMessage({ type, payload });
}

export function onMessage(
  callback: (
    message: { type: string; payload: unknown },
    sender: chrome.runtime.MessageSender
  ) => Promise<unknown> | void
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = callback(message, sender);
    if (result instanceof Promise) {
      result.then(sendResponse);
      return true;
    }
    return false;
  });
}
```

**Step 3: Commit**

```bash
git add src/shared/messaging.ts
git commit -m "feat: convert messaging.js to TypeScript"
```

---

## Task 8: Convert src/background/bluesky-api.js

**Files:**
- Rename: `src/background/bluesky-api.js` → `src/background/bluesky-api.ts`

**Step 1: Rename file**

Run:
```bash
mv src/background/bluesky-api.js src/background/bluesky-api.ts
```

**Step 2: Update src/background/bluesky-api.ts**

```typescript
import { BLUESKY_API } from '../shared/constants';

interface BlueskyProfileResponse {
  displayName?: string;
}

interface VerificationResult {
  exists: boolean;
  displayName: string | null;
}

export async function verifyBlueskyProfile(
  handle: string
): Promise<VerificationResult | null> {
  try {
    const url = `${BLUESKY_API.profileUrl}?actor=${encodeURIComponent(handle)}`;
    const response = await fetch(url);

    if (response.ok) {
      const data: BlueskyProfileResponse = await response.json();
      return {
        exists: true,
        displayName: data.displayName || null,
      };
    }

    if (response.status === 400) {
      return { exists: false, displayName: null };
    }

    return null;
  } catch (error) {
    console.error('Xscape Hatch: API error', error);
    return null;
  }
}
```

**Step 3: Commit**

```bash
git add src/background/bluesky-api.ts
git commit -m "feat: convert bluesky-api.js to TypeScript"
```

---

## Task 9: Convert src/background/cache.js

**Files:**
- Rename: `src/background/cache.js` → `src/background/cache.ts`

**Step 1: Rename file**

Run:
```bash
mv src/background/cache.js src/background/cache.ts
```

**Step 2: Update src/background/cache.ts**

```typescript
import { CACHE } from '../shared/constants';
import type { CacheEntry } from '../types';

export async function getCachedHandle(handle: string): Promise<CacheEntry | null> {
  const key = CACHE.prefix + handle;
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as CacheEntry | undefined;

  if (!entry) return null;

  const ttl = entry.exists ? CACHE.existsTTL : CACHE.notExistsTTL;
  if (Date.now() - entry.checkedAt > ttl) {
    await chrome.storage.local.remove(key);
    return null;
  }

  return entry;
}

export async function setCachedHandle(
  handle: string,
  exists: boolean,
  displayName: string | null = null
): Promise<void> {
  const key = CACHE.prefix + handle;
  await chrome.storage.local.set({
    [key]: {
      exists,
      displayName,
      checkedAt: Date.now(),
    } satisfies CacheEntry,
  });
}

export async function pruneCache(maxEntries = 50000): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([key]) => key.startsWith(CACHE.prefix))
    .map(([key, value]) => ({ key, ...(value as CacheEntry) }))
    .sort((a, b) => a.checkedAt - b.checkedAt);

  if (entries.length > maxEntries) {
    const toRemove = entries.slice(0, entries.length - maxEntries).map((e) => e.key);
    await chrome.storage.local.remove(toRemove);
  }
}
```

**Step 3: Commit**

```bash
git add src/background/cache.ts
git commit -m "feat: convert cache.js to TypeScript"
```

---

## Task 10: Convert src/background/service-worker.js

**Files:**
- Rename: `src/background/service-worker.js` → `src/background/service-worker.ts`

**Step 1: Rename file**

Run:
```bash
mv src/background/service-worker.js src/background/service-worker.ts
```

**Step 2: Update src/background/service-worker.ts**

```typescript
import { MESSAGE_TYPES } from '../shared/constants';
import { getCachedHandle, setCachedHandle, pruneCache } from './cache';
import { verifyBlueskyProfile } from './bluesky-api';
import type { VerifyHandleResponse } from '../types';

interface IncomingMessage {
  type: string;
  payload: { handle: string };
}

const pendingVerifications = new Map<string, Promise<VerifyHandleResponse>>();

chrome.runtime.onMessage.addListener(
  (message: IncomingMessage, sender, sendResponse) => {
    if (message.type === MESSAGE_TYPES.VERIFY_HANDLE) {
      handleVerification(message.payload.handle, sender.tab?.id).then(sendResponse);
      return true;
    }
    return false;
  }
);

async function handleVerification(
  handle: string,
  _tabId?: number
): Promise<VerifyHandleResponse> {
  const cached = await getCachedHandle(handle);
  if (cached !== null) {
    return { handle, exists: cached.exists, displayName: cached.displayName };
  }

  if (pendingVerifications.has(handle)) {
    return pendingVerifications.get(handle)!;
  }

  const verificationPromise = (async (): Promise<VerifyHandleResponse> => {
    const result = await verifyBlueskyProfile(handle);

    if (result !== null) {
      await setCachedHandle(handle, result.exists, result.displayName);
      pendingVerifications.delete(handle);
      return { handle, exists: result.exists, displayName: result.displayName };
    }

    pendingVerifications.delete(handle);
    return { handle, exists: null, displayName: null, error: true };
  })();

  pendingVerifications.set(handle, verificationPromise);
  return verificationPromise;
}

chrome.runtime.onInstalled.addListener(() => {
  pruneCache();
});
```

**Step 3: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat: convert service-worker.js to TypeScript"
```

---

## Task 11: Convert src/content/badge-injector.js

**Files:**
- Rename: `src/content/badge-injector.js` → `src/content/badge-injector.ts`

**Step 1: Rename file**

Run:
```bash
mv src/content/badge-injector.js src/content/badge-injector.ts
```

**Step 2: Update src/content/badge-injector.ts**

```typescript
import { BADGE_ATTR, BLUESKY_API } from '../shared/constants';

const BUTTERFLY_SVG = `<svg viewBox="0 0 568 501" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
<path d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.733-.017-2.875-1.169.506-3.631 7.733-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.89-129.52 80.986-149.071-65.72 11.185-139.6-7.295-159.875-79.748C9.945 203.659 0 75.291 0 57.946 0-28.906 76.135-1.612 123.121 33.664Z"/>
</svg>`;

export function createBadge(handle: string): HTMLAnchorElement {
  const badge = document.createElement('a');
  badge.className = 'xscape-hatch-badge';
  badge.href = `${BLUESKY_API.webProfileUrl}/${handle}`;
  badge.target = '_blank';
  badge.rel = 'noopener noreferrer';
  badge.setAttribute(BADGE_ATTR, '');
  badge.setAttribute('data-handle', handle);
  badge.setAttribute('data-verified', 'pending');
  badge.innerHTML = `${BUTTERFLY_SVG}<span>@${handle}</span>`;
  return badge;
}

export function updateBadgeState(handle: string, exists: boolean): void {
  const badges = document.querySelectorAll<HTMLAnchorElement>(
    `.xscape-hatch-badge[data-handle="${handle}"]`
  );
  badges.forEach((badge) => {
    if (exists) {
      badge.setAttribute('data-verified', 'true');
    } else {
      badge.remove();
    }
  });
}

export function badgeExistsFor(handle: string, container: Element): boolean {
  return (
    container.querySelector(`.xscape-hatch-badge[data-handle="${handle}"]`) !== null
  );
}

export function injectBadge(badge: HTMLAnchorElement, targetElement: Element): void {
  const parent = targetElement.parentElement;
  if (parent) {
    parent.insertBefore(badge, targetElement);
  }
}
```

**Step 3: Commit**

```bash
git add src/content/badge-injector.ts
git commit -m "feat: convert badge-injector.js to TypeScript"
```

---

## Task 12: Convert src/content/dom-observer.js

**Files:**
- Rename: `src/content/dom-observer.js` → `src/content/dom-observer.ts`

**Step 1: Rename file**

Run:
```bash
mv src/content/dom-observer.js src/content/dom-observer.ts
```

**Step 2: Update src/content/dom-observer.ts**

```typescript
import {
  SELECTORS,
  BLUESKY_HANDLE_REGEX,
  BADGE_ATTR,
} from '../shared/constants';
import type { TweetData, HandleElement } from '../types';

export interface DOMObserver {
  start: () => void;
  stop: () => void;
}

export function createDOMObserver(
  onTweetFound: (data: TweetData) => void
): DOMObserver {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const processedArticles = new WeakSet<HTMLElement>();

  function processArticle(article: HTMLElement): void {
    if (processedArticles.has(article)) return;
    processedArticles.add(article);

    const handles = extractHandlesFromArticle(article);
    const images = extractImagesFromArticle(article);
    const handleElements = findHandleElements(article);

    if (handles.length > 0 || images.length > 0 || handleElements.length > 0) {
      onTweetFound({
        article,
        blueskyHandles: handles,
        twitterHandles: handleElements,
        images,
      });
    }
  }

  function scanPage(): void {
    const articles = document.querySelectorAll<HTMLElement>(SELECTORS.article);
    articles.forEach(processArticle);
  }

  function handleMutations(mutations: MutationRecord[]): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              if (element.matches?.(SELECTORS.article)) {
                processArticle(element);
              }
              element
                .querySelectorAll?.<HTMLElement>(SELECTORS.article)
                .forEach(processArticle);
            }
          });
        }
      }
    }, 100);
  }

  const observer = new MutationObserver(handleMutations);

  return {
    start(): void {
      scanPage();
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    },
    stop(): void {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  };
}

function extractHandlesFromArticle(article: HTMLElement): string[] {
  const text = article.textContent || '';
  const matches = text.matchAll(BLUESKY_HANDLE_REGEX);
  const handles = new Set<string>();
  for (const match of matches) {
    handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
}

function extractImagesFromArticle(article: HTMLElement): string[] {
  const images = article.querySelectorAll<HTMLImageElement>('img');
  const urls: string[] = [];
  images.forEach((img) => {
    if (img.src && img.width > 100 && img.height > 100) {
      const isAvatar =
        img.closest('[data-testid="Tweet-User-Avatar"]') ||
        img.src.includes('profile_images');
      if (!isAvatar) {
        urls.push(img.src);
      }
    }
  });
  return urls;
}

function findHandleElements(article: HTMLElement): HandleElement[] {
  const results: HandleElement[] = [];
  const links = article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');

  links.forEach((link) => {
    const text = link.textContent || '';
    const match = text.match(/^@([a-zA-Z0-9_]{1,15})$/);
    if (match && !link.closest(`[${BADGE_ATTR}]`)) {
      results.push({
        element: link,
        twitterHandle: match[1],
        inferredBluesky: `${match[1].toLowerCase()}.bsky.social`,
      });
    }
  });

  return results;
}
```

**Step 3: Commit**

```bash
git add src/content/dom-observer.ts
git commit -m "feat: convert dom-observer.js to TypeScript"
```

---

## Task 13: Convert src/content/content.js

**Files:**
- Rename: `src/content/content.js` → `src/content/content.ts`

**Step 1: Rename file**

Run:
```bash
mv src/content/content.js src/content/content.ts
```

**Step 2: Update src/content/content.ts**

```typescript
import './styles.css';
import { MESSAGE_TYPES } from '../shared/constants';
import { createDOMObserver } from './dom-observer';
import {
  createBadge,
  updateBadgeState,
  badgeExistsFor,
  injectBadge,
} from './badge-injector';
import type { TweetData, WorkerOutgoingMessage, VerifyHandleResponse } from '../types';

const processedImages = new Set<string>();
const pendingHandles = new Set<string>();
let ocrWorker: Worker | null = null;
let ocrReady = false;
const ocrQueue: string[] = [];

function initOCRWorker(): void {
  const workerUrl = chrome.runtime.getURL('src/worker/ocr-worker.js');
  ocrWorker = new Worker(workerUrl, { type: 'module' });

  ocrWorker.onmessage = (e: MessageEvent<WorkerOutgoingMessage>) => {
    const { type, payload } = e.data;

    if (type === 'ready') {
      ocrReady = true;
      processOCRQueue();
      return;
    }

    if (type === 'result' && payload) {
      payload.handles.forEach((handle) => {
        handleDetected(handle, null);
      });
      processOCRQueue();
    }
  };

  ocrWorker.postMessage({ type: 'init' });
}

function processOCRQueue(): void {
  if (!ocrReady || ocrQueue.length === 0) return;

  const imageUrl = ocrQueue.shift()!;
  ocrWorker?.postMessage({ type: 'process', payload: { imageUrl } });
}

function queueImageForOCR(imageUrl: string): void {
  if (processedImages.has(imageUrl)) return;
  processedImages.add(imageUrl);

  if (processedImages.size > 1000) {
    const first = processedImages.values().next().value;
    if (first) processedImages.delete(first);
  }

  if (ocrQueue.length < 20) {
    ocrQueue.push(imageUrl);
    processOCRQueue();
  }
}

async function handleDetected(
  handle: string,
  targetElement: Element | null
): Promise<void> {
  if (pendingHandles.has(handle)) {
    return;
  }

  if (
    targetElement &&
    !badgeExistsFor(handle, targetElement.closest('article') || document.body)
  ) {
    const badge = createBadge(handle);
    injectBadge(badge, targetElement);
  }

  pendingHandles.add(handle);

  try {
    const result: VerifyHandleResponse = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.VERIFY_HANDLE,
      payload: { handle },
    });

    if (result && !result.error) {
      updateBadgeState(handle, result.exists === true);
    }
  } catch (error) {
    console.error('Xscape Hatch: verification error', error);
  }

  pendingHandles.delete(handle);
}

function onTweetFound({ article, blueskyHandles, twitterHandles, images }: TweetData): void {
  blueskyHandles.forEach((handle) => {
    const targetElement = findBestTargetElement(article, handle);
    if (targetElement) {
      handleDetected(handle, targetElement);
    }
  });

  twitterHandles.forEach(({ element, inferredBluesky }) => {
    handleDetected(inferredBluesky, element);
  });

  images.forEach((url) => {
    queueImageForOCR(url);
  });
}

function findBestTargetElement(
  article: HTMLElement,
  _handle: string
): Element | null {
  const links = article.querySelectorAll('a[href^="/"]');
  for (const link of links) {
    if (link.textContent?.startsWith('@')) {
      return link;
    }
  }
  return null;
}

const observer = createDOMObserver(onTweetFound);
observer.start();
initOCRWorker();
```

**Step 3: Commit**

```bash
git add src/content/content.ts
git commit -m "feat: convert content.js to TypeScript"
```

---

## Task 14: Convert src/worker/ocr-worker.js

**Files:**
- Rename: `src/worker/ocr-worker.js` → `src/worker/ocr-worker.ts`

**Step 1: Rename file**

Run:
```bash
mv src/worker/ocr-worker.js src/worker/ocr-worker.ts
```

**Step 2: Update src/worker/ocr-worker.ts**

```typescript
/// <reference lib="webworker" />

import Tesseract from 'tesseract.js';
import type { WorkerIncomingMessage, WorkerOutgoingMessage } from '../types';

let tesseractWorker: Tesseract.Worker | null = null;
const BLUESKY_HANDLE_REGEX = /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi;

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async function (e: MessageEvent<WorkerIncomingMessage>) {
  const { type, payload, id } = e.data;

  if (type === 'init') {
    await initWorker();
    const response: WorkerOutgoingMessage = { type: 'ready', id };
    self.postMessage(response);
    return;
  }

  if (type === 'process' && payload) {
    const handles = await processImage(payload.imageUrl);
    const response: WorkerOutgoingMessage = {
      type: 'result',
      id,
      payload: { imageUrl: payload.imageUrl, handles },
    };
    self.postMessage(response);
    return;
  }

  if (type === 'terminate') {
    if (tesseractWorker) {
      await tesseractWorker.terminate();
      tesseractWorker = null;
    }
    return;
  }
};

async function initWorker(): Promise<void> {
  if (tesseractWorker) return;
  tesseractWorker = await Tesseract.createWorker('eng');
}

async function processImage(imageUrl: string): Promise<string[]> {
  if (!tesseractWorker) {
    await initWorker();
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return [];

    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const maxWidth = 1500;
    let canvas: OffscreenCanvas;
    if (imageBitmap.width > maxWidth) {
      const scale = maxWidth / imageBitmap.width;
      canvas = new OffscreenCanvas(maxWidth, imageBitmap.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
    } else {
      canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(imageBitmap, 0, 0);
    }

    imageBitmap.close();

    const {
      data: { text },
    } = await tesseractWorker!.recognize(canvas);

    const handles = new Set<string>();
    const matches = text.matchAll(BLUESKY_HANDLE_REGEX);
    for (const match of matches) {
      handles.add(match[1].toLowerCase());
    }

    return Array.from(handles);
  } catch (error) {
    console.error('OCR error:', error);
    return [];
  }
}
```

**Step 3: Commit**

```bash
git add src/worker/ocr-worker.ts
git commit -m "feat: convert ocr-worker.js to TypeScript"
```

---

## Task 15: Update manifest.json

**Files:**
- Modify: `manifest.json`

**Step 1: Update manifest.json file references**

Update the following fields:
- `background.service_worker`: `"src/background/service-worker.ts"`
- `content_scripts[0].js`: `["src/content/content.ts"]`

```json
{
  "manifest_version": 3,
  "name": "Xscape Hatch - Twitter to Bluesky Escape",
  "version": "1.0.0",
  "description": "Find Bluesky profiles on X/Twitter",
  "permissions": ["storage"],
  "host_permissions": [
    "https://x.com/*",
    "https://twitter.com/*",
    "https://public.api.bsky.app/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["https://x.com/*", "https://twitter.com/*"],
    "js": ["src/content/content.ts"],
    "run_at": "document_idle"
  }],
  "web_accessible_resources": [{
    "resources": ["src/worker/*"],
    "matches": ["https://x.com/*", "https://twitter.com/*"]
  }],
  "icons": {
    "16": "assets/icons/icon-16.png",
    "48": "assets/icons/icon-48.png",
    "128": "assets/icons/icon-128.png"
  }
}
```

**Step 2: Commit**

```bash
git add manifest.json
git commit -m "chore: update manifest to reference TypeScript files"
```

---

## Task 16: Clean Up Old JavaScript Files

**Files:**
- Delete: Any remaining `.js` files in `src/`

**Step 1: Verify no .js files remain in src/**

Run:
```bash
find src -name "*.js" -type f
```

Expected: No output (all files converted)

**Step 2: If any remain, delete them**

Run:
```bash
find src -name "*.js" -type f -delete
```

**Step 3: Commit cleanup if needed**

```bash
git add -A src/
git commit -m "chore: remove old JavaScript files" --allow-empty
```

---

## Task 17: Run TypeScript Type Check

**Files:** None (verification)

**Step 1: Run typecheck**

Run:
```bash
npm run typecheck
```

Expected: No errors

**Step 2: Fix any type errors that appear**

If errors occur, fix them in the relevant files.

**Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve TypeScript type errors" --allow-empty
```

---

## Task 18: Run ESLint

**Files:** None (verification)

**Step 1: Run lint**

Run:
```bash
npm run lint
```

Expected: No errors (or only warnings)

**Step 2: Fix any lint errors**

Run:
```bash
npm run lint -- --fix
```

**Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve ESLint errors" --allow-empty
```

---

## Task 19: Test Build

**Files:** None (verification)

**Step 1: Run production build**

Run:
```bash
npm run build
```

Expected: Build completes successfully, `dist/` folder created

**Step 2: Verify dist output**

Run:
```bash
ls -la dist/
```

Expected: Contains manifest.json, compiled JS files, assets

**Step 3: Commit any build config fixes if needed**

```bash
git add -A
git commit -m "fix: resolve build issues" --allow-empty
```

---

## Task 20: Final Verification and Commit

**Files:** None (verification)

**Step 1: Run all checks**

Run:
```bash
npm run typecheck && npm run lint && npm run build
```

Expected: All pass

**Step 2: Create final summary commit if needed**

```bash
git status
```

If clean, the conversion is complete.

**Step 3: Tag the release**

```bash
git tag -a v1.1.0-typescript -m "TypeScript conversion complete"
```
