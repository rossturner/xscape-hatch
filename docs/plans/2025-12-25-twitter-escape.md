# Twitter Escape Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Chrome extension that detects Bluesky handles on X.com (via OCR and text) and injects clickable profile links.

**Architecture:** Content script observes DOM for tweets, extracts handles from text and images (via Tesseract.js Web Worker), injects badges optimistically, service worker verifies handles against Bluesky API and caches results.

**Tech Stack:** Chrome Extension Manifest V3, Tesseract.js, Bluesky Public API, chrome.storage.local

---

## Task 1: Project Setup & Manifest

**Files:**
- Create: `manifest.json`
- Create: `assets/icons/icon-16.png`
- Create: `assets/icons/icon-48.png`
- Create: `assets/icons/icon-128.png`

**Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Twitter Escape",
  "version": "1.0.0",
  "description": "Find Bluesky profiles on X/Twitter",
  "permissions": ["storage"],
  "host_permissions": [
    "https://x.com/*",
    "https://twitter.com/*",
    "https://public.api.bsky.app/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["https://x.com/*", "https://twitter.com/*"],
    "js": ["src/content/content.js"],
    "css": ["src/content/styles.css"],
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

**Step 2: Create placeholder icons**

Create simple placeholder PNG files for icons (blue squares). These can be replaced with proper Bluesky butterfly icons later.

**Step 3: Create directory structure**

```bash
mkdir -p src/content src/background src/worker src/shared assets/icons
```

**Step 4: Verify manifest loads in Chrome**

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" and select the project folder
4. Verify extension appears (will show errors for missing files - that's expected)

**Step 5: Commit**

```bash
git init
git add manifest.json assets/
git commit -m "feat: initial project setup with manifest v3"
```

---

## Task 2: Shared Constants & Utilities

**Files:**
- Create: `src/shared/constants.js`
- Create: `src/shared/messaging.js`

**Step 1: Create constants.js**

```javascript
export const BLUESKY_HANDLE_REGEX = /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi;

export const TWITTER_HANDLE_REGEX = /@([a-zA-Z0-9_]{1,15})/g;

export const SELECTORS = {
  article: 'article',
  tweetText: '[data-testid="tweetText"]',
  userNameFallback: 'a[href^="/"]',
};

export const BLUESKY_API = {
  profileUrl: 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile',
  webProfileUrl: 'https://bsky.app/profile',
};

export const CACHE = {
  prefix: 'bsky:',
  existsTTL: 7 * 24 * 60 * 60 * 1000,
  notExistsTTL: 24 * 60 * 60 * 1000,
};

export const BADGE_ATTR = 'data-twitter-escape';

export const MESSAGE_TYPES = {
  VERIFY_HANDLE: 'VERIFY_HANDLE',
  HANDLE_VERIFIED: 'HANDLE_VERIFIED',
  OCR_INIT: 'OCR_INIT',
  OCR_READY: 'OCR_READY',
  OCR_PROCESS: 'OCR_PROCESS',
  OCR_RESULT: 'OCR_RESULT',
};
```

**Step 2: Create messaging.js**

```javascript
export function sendToBackground(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

export function onMessage(callback) {
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
git add src/shared/
git commit -m "feat: add shared constants and messaging utilities"
```

---

## Task 3: Badge Styling

**Files:**
- Create: `src/content/styles.css`

**Step 1: Create styles.css**

```css
.twitter-escape-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  margin-right: 4px;
  border-radius: 4px;
  background: rgba(32, 139, 254, 0.1);
  color: #1185fe;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: opacity 0.2s, background 0.2s;
  vertical-align: middle;
}

.twitter-escape-badge[data-verified="pending"] {
  opacity: 0.5;
  pointer-events: none;
}

.twitter-escape-badge[data-verified="true"]:hover {
  background: rgba(32, 139, 254, 0.2);
}

.twitter-escape-badge svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.twitter-escape-badge span {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**Step 2: Commit**

```bash
git add src/content/styles.css
git commit -m "feat: add badge styling with verification states"
```

---

## Task 4: Badge Injector Module

**Files:**
- Create: `src/content/badge-injector.js`

**Step 1: Create badge-injector.js**

```javascript
import { BADGE_ATTR, BLUESKY_API } from '../shared/constants.js';

const BUTTERFLY_SVG = `<svg viewBox="0 0 568 501" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
<path d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.733-.017-2.875-1.169.506-3.631 7.733-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.89-129.52 80.986-149.071-65.72 11.185-139.6-7.295-159.875-79.748C9.945 203.659 0 75.291 0 57.946 0-28.906 76.135-1.612 123.121 33.664Z"/>
</svg>`;

export function createBadge(handle) {
  const badge = document.createElement('a');
  badge.className = 'twitter-escape-badge';
  badge.href = `${BLUESKY_API.webProfileUrl}/${handle}`;
  badge.target = '_blank';
  badge.rel = 'noopener noreferrer';
  badge.setAttribute(BADGE_ATTR, '');
  badge.setAttribute('data-handle', handle);
  badge.setAttribute('data-verified', 'pending');
  badge.innerHTML = `${BUTTERFLY_SVG}<span>@${handle}</span>`;
  return badge;
}

export function updateBadgeState(handle, exists) {
  const badges = document.querySelectorAll(
    `.twitter-escape-badge[data-handle="${handle}"]`
  );
  badges.forEach(badge => {
    if (exists) {
      badge.setAttribute('data-verified', 'true');
    } else {
      badge.remove();
    }
  });
}

export function badgeExistsFor(handle, container) {
  return container.querySelector(
    `.twitter-escape-badge[data-handle="${handle}"]`
  ) !== null;
}

export function injectBadge(badge, targetElement) {
  const parent = targetElement.parentElement;
  if (parent) {
    parent.insertBefore(badge, targetElement);
  }
}
```

**Step 2: Commit**

```bash
git add src/content/badge-injector.js
git commit -m "feat: add badge creation and injection module"
```

---

## Task 5: DOM Observer Module

**Files:**
- Create: `src/content/dom-observer.js`

**Step 1: Create dom-observer.js**

```javascript
import { SELECTORS, BLUESKY_HANDLE_REGEX, TWITTER_HANDLE_REGEX, BADGE_ATTR } from '../shared/constants.js';

export function createDOMObserver(onTweetFound) {
  let debounceTimer = null;
  const processedArticles = new WeakSet();

  function processArticle(article) {
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

  function scanPage() {
    const articles = document.querySelectorAll(SELECTORS.article);
    articles.forEach(processArticle);
  }

  function handleMutations(mutations) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches?.(SELECTORS.article)) {
                processArticle(node);
              }
              node.querySelectorAll?.(SELECTORS.article).forEach(processArticle);
            }
          });
        }
      }
    }, 100);
  }

  const observer = new MutationObserver(handleMutations);

  return {
    start() {
      scanPage();
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    },
    stop() {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  };
}

function extractHandlesFromArticle(article) {
  const text = article.textContent || '';
  const matches = text.matchAll(BLUESKY_HANDLE_REGEX);
  const handles = new Set();
  for (const match of matches) {
    handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
}

function extractImagesFromArticle(article) {
  const images = article.querySelectorAll('img');
  const urls = [];
  images.forEach(img => {
    if (img.src && img.width > 100 && img.height > 100) {
      const isAvatar = img.closest('[data-testid="Tweet-User-Avatar"]') ||
                       img.src.includes('profile_images');
      if (!isAvatar) {
        urls.push(img.src);
      }
    }
  });
  return urls;
}

function findHandleElements(article) {
  const results = [];
  const links = article.querySelectorAll('a[href^="/"]');

  links.forEach(link => {
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

**Step 2: Commit**

```bash
git add src/content/dom-observer.js
git commit -m "feat: add DOM observer for detecting tweets and handles"
```

---

## Task 6: Service Worker - Cache Module

**Files:**
- Create: `src/background/cache.js`

**Step 1: Create cache.js**

```javascript
import { CACHE } from '../shared/constants.js';

export async function getCachedHandle(handle) {
  const key = CACHE.prefix + handle;
  const result = await chrome.storage.local.get(key);
  const entry = result[key];

  if (!entry) return null;

  const ttl = entry.exists ? CACHE.existsTTL : CACHE.notExistsTTL;
  if (Date.now() - entry.checkedAt > ttl) {
    await chrome.storage.local.remove(key);
    return null;
  }

  return entry;
}

export async function setCachedHandle(handle, exists, displayName = null) {
  const key = CACHE.prefix + handle;
  await chrome.storage.local.set({
    [key]: {
      exists,
      displayName,
      checkedAt: Date.now(),
    },
  });
}

export async function pruneCache(maxEntries = 50000) {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([key]) => key.startsWith(CACHE.prefix))
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.checkedAt - b.checkedAt);

  if (entries.length > maxEntries) {
    const toRemove = entries.slice(0, entries.length - maxEntries).map(e => e.key);
    await chrome.storage.local.remove(toRemove);
  }
}
```

**Step 2: Commit**

```bash
git add src/background/cache.js
git commit -m "feat: add cache module for handle verification results"
```

---

## Task 7: Service Worker - Bluesky API

**Files:**
- Create: `src/background/bluesky-api.js`

**Step 1: Create bluesky-api.js**

```javascript
import { BLUESKY_API } from '../shared/constants.js';

export async function verifyBlueskyProfile(handle) {
  try {
    const url = `${BLUESKY_API.profileUrl}?actor=${encodeURIComponent(handle)}`;
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
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
    console.error('Twitter Escape: API error', error);
    return null;
  }
}
```

**Step 2: Commit**

```bash
git add src/background/bluesky-api.js
git commit -m "feat: add Bluesky API verification module"
```

---

## Task 8: Service Worker - Main Entry

**Files:**
- Create: `src/background/service-worker.js`

**Step 1: Create service-worker.js**

```javascript
import { MESSAGE_TYPES } from '../shared/constants.js';
import { getCachedHandle, setCachedHandle, pruneCache } from './cache.js';
import { verifyBlueskyProfile } from './bluesky-api.js';

const pendingVerifications = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.VERIFY_HANDLE) {
    handleVerification(message.payload.handle, sender.tab?.id)
      .then(sendResponse);
    return true;
  }
});

async function handleVerification(handle, tabId) {
  const cached = await getCachedHandle(handle);
  if (cached !== null) {
    return { handle, exists: cached.exists, displayName: cached.displayName };
  }

  if (pendingVerifications.has(handle)) {
    return pendingVerifications.get(handle);
  }

  const verificationPromise = (async () => {
    const result = await verifyBlueskyProfile(handle);

    if (result !== null) {
      await setCachedHandle(handle, result.exists, result.displayName);
      pendingVerifications.delete(handle);
      return { handle, exists: result.exists, displayName: result.displayName };
    }

    pendingVerifications.delete(handle);
    return { handle, exists: null, error: true };
  })();

  pendingVerifications.set(handle, verificationPromise);
  return verificationPromise;
}

chrome.runtime.onInstalled.addListener(() => {
  pruneCache();
});
```

**Step 2: Commit**

```bash
git add src/background/service-worker.js
git commit -m "feat: add service worker with message handling and verification"
```

---

## Task 9: OCR Web Worker

**Files:**
- Create: `src/worker/ocr-worker.js`

**Step 1: Create ocr-worker.js**

```javascript
import Tesseract from 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';

let worker = null;
const BLUESKY_HANDLE_REGEX = /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi;

self.onmessage = async function(e) {
  const { type, payload, id } = e.data;

  if (type === 'init') {
    await initWorker();
    self.postMessage({ type: 'ready', id });
    return;
  }

  if (type === 'process') {
    const handles = await processImage(payload.imageUrl);
    self.postMessage({ type: 'result', id, payload: { imageUrl: payload.imageUrl, handles } });
    return;
  }

  if (type === 'terminate') {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    return;
  }
};

async function initWorker() {
  if (worker) return;
  worker = await Tesseract.createWorker('eng');
}

async function processImage(imageUrl) {
  if (!worker) {
    await initWorker();
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return [];

    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const maxWidth = 1500;
    let canvas;
    if (imageBitmap.width > maxWidth) {
      const scale = maxWidth / imageBitmap.width;
      canvas = new OffscreenCanvas(maxWidth, imageBitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
    } else {
      canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageBitmap, 0, 0);
    }

    imageBitmap.close();

    const { data: { text } } = await worker.recognize(canvas);

    const handles = new Set();
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

**Step 2: Commit**

```bash
git add src/worker/ocr-worker.js
git commit -m "feat: add Tesseract.js OCR web worker"
```

---

## Task 10: Content Script - Main Entry

**Files:**
- Create: `src/content/content.js`

**Step 1: Create content.js**

```javascript
import { MESSAGE_TYPES } from '../shared/constants.js';
import { createDOMObserver } from './dom-observer.js';
import { createBadge, updateBadgeState, badgeExistsFor, injectBadge } from './badge-injector.js';

const processedImages = new Set();
const pendingHandles = new Set();
let ocrWorker = null;
let ocrReady = false;
const ocrQueue = [];

function initOCRWorker() {
  const workerUrl = chrome.runtime.getURL('src/worker/ocr-worker.js');
  ocrWorker = new Worker(workerUrl, { type: 'module' });

  ocrWorker.onmessage = (e) => {
    const { type, payload } = e.data;

    if (type === 'ready') {
      ocrReady = true;
      processOCRQueue();
      return;
    }

    if (type === 'result') {
      payload.handles.forEach(handle => {
        handleDetected(handle, null);
      });
      processOCRQueue();
    }
  };

  ocrWorker.postMessage({ type: 'init' });
}

function processOCRQueue() {
  if (!ocrReady || ocrQueue.length === 0) return;

  const imageUrl = ocrQueue.shift();
  ocrWorker.postMessage({ type: 'process', payload: { imageUrl } });
}

function queueImageForOCR(imageUrl) {
  if (processedImages.has(imageUrl)) return;
  processedImages.add(imageUrl);

  if (processedImages.size > 1000) {
    const first = processedImages.values().next().value;
    processedImages.delete(first);
  }

  if (ocrQueue.length < 20) {
    ocrQueue.push(imageUrl);
    processOCRQueue();
  }
}

async function handleDetected(handle, targetElement) {
  if (pendingHandles.has(handle)) {
    return;
  }

  if (targetElement && !badgeExistsFor(handle, targetElement.closest('article') || document)) {
    const badge = createBadge(handle);
    injectBadge(badge, targetElement);
  }

  pendingHandles.add(handle);

  try {
    const result = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.VERIFY_HANDLE,
      payload: { handle },
    });

    if (result && !result.error) {
      updateBadgeState(handle, result.exists);
    }
  } catch (error) {
    console.error('Twitter Escape: verification error', error);
  }

  pendingHandles.delete(handle);
}

function onTweetFound({ article, blueskyHandles, twitterHandles, images }) {
  blueskyHandles.forEach(handle => {
    const targetElement = findBestTargetElement(article, handle);
    if (targetElement) {
      handleDetected(handle, targetElement);
    }
  });

  twitterHandles.forEach(({ element, inferredBluesky }) => {
    handleDetected(inferredBluesky, element);
  });

  images.forEach(url => {
    queueImageForOCR(url);
  });
}

function findBestTargetElement(article, handle) {
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

**Step 2: Commit**

```bash
git add src/content/content.js
git commit -m "feat: add main content script tying all modules together"
```

---

## Task 11: Build Configuration

**Files:**
- Create: `package.json`

**Step 1: Create package.json**

```json
{
  "name": "twitter-escape",
  "version": "1.0.0",
  "description": "Find Bluesky profiles on X/Twitter",
  "type": "module",
  "scripts": {
    "lint": "eslint src/",
    "test": "echo \"No tests yet\" && exit 0"
  },
  "devDependencies": {},
  "private": true
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add package.json"
```

---

## Task 12: Integration Testing

**Step 1: Load extension in Chrome**

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" and select the project folder
4. Note any errors in the extension card

**Step 2: Test on X.com**

1. Navigate to `https://x.com`
2. Open DevTools Console (F12)
3. Look for any errors prefixed with "Twitter Escape"
4. Scroll through the feed
5. Verify badges appear on tweets (dimmed initially)

**Step 3: Test Bluesky verification**

1. Find or post a tweet mentioning a known Bluesky handle like `@jay.bsky.social`
2. Verify badge appears and transitions from dimmed to solid
3. Click the badge and verify it opens the Bluesky profile

**Step 4: Test OCR (if images with Bluesky handles are visible)**

1. Find a tweet with an image containing a Bluesky handle
2. Wait for OCR processing (may take several seconds)
3. Verify badge appears if handle is detected

**Step 5: Document any issues found**

Create a file `TESTING.md` with any issues discovered during manual testing.

**Step 6: Commit**

```bash
git add TESTING.md
git commit -m "docs: add testing notes"
```

---

## Future Enhancements (Not in scope for v1)

- Options page for user preferences (enable/disable OCR, etc.)
- Popup showing detected handles on current page
- Custom domain handle support
- Firefox/Safari ports
- Automated tests with Puppeteer
