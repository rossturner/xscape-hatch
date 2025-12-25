# Testing Infrastructure Design

## Overview

Add unit and integration testing to xscape-hatch using Vitest with vitest-chrome for Chrome API mocking.

**Goals:**
- Confidence in refactoring
- Catch regressions
- Document behavior through tests

**Scope:** Unit tests + Integration tests (no E2E/Playwright)

## Project Structure

```
test/
  unit/
    shared/
      constants.test.ts      # Regex patterns, selectors
    content/
      dom-observer.test.ts   # Handle extraction from DOM
      badge-injector.test.ts # Badge creation/styling
    background/
      cache.test.ts          # chrome.storage.local operations
      bluesky-api.test.ts    # API calls, error handling
    worker/
      ocr-worker.test.ts     # OCR logic with mocked Tesseract
  integration/
    messaging.test.ts        # Content ↔ service worker flow
    ocr-pipeline.test.ts     # Real Tesseract on example images
  fixtures/
    images/                  # Reference to example_images/
    mocks/
      chrome.ts              # vitest-chrome helpers
      tesseract.ts           # Tesseract mock factory
      dom.ts                 # DOM element factories
  setup.ts                   # Global test setup
```

## Dependencies

```json
{
  "devDependencies": {
    "vitest": "^3.0.0",
    "vitest-chrome": "^0.2.0",
    "@vitest/coverage-v8": "^3.0.0",
    "jsdom": "^26.0.0"
  }
}
```

## Unit Test Coverage

### `test/unit/shared/constants.test.ts`
- Test `BLUESKY_HANDLE_REGEX` against valid handles (`user.bsky.social`, `user-name.bsky.social`)
- Test rejection of invalid handles (`user@bsky.social`, `user.bsky.com`, `@twitter`)
- Test `TWEET_SELECTORS` match expected DOM patterns

### `test/unit/content/dom-observer.test.ts`
- Mock `MutationObserver` and DOM elements
- Test handle extraction from tweet text nodes
- Test image queuing logic (filters by size >100px)
- Test debounce behavior (100ms)

### `test/unit/content/badge-injector.test.ts`
- Test badge HTML structure matches expected markup
- Test optimistic (dimmed) vs verified (solid) badge states
- Test badge removal when handle doesn't exist
- Test duplicate badge prevention

### `test/unit/background/cache.test.ts`
- Mock `chrome.storage.local` via vitest-chrome
- Test cache hit/miss behavior
- Test TTL expiration logic
- Test cache write on API response

### `test/unit/background/bluesky-api.test.ts`
- Mock `fetch` responses
- Test successful profile resolution
- Test 404 handling (handle doesn't exist)
- Test network error handling

### `test/unit/worker/ocr-worker.test.ts`
- Mock Tesseract worker and `recognize()` method
- Test handle extraction from OCR text results
- Test filtering of non-handle text

## Integration Tests

### `test/integration/messaging.test.ts`

Tests the message flow between content script and service worker:

- Content script sends `VERIFY_HANDLE` message → service worker checks cache → returns cached result
- Content script sends `VERIFY_HANDLE` message → cache miss → API call → response returned
- Content script sends `PROCESS_IMAGE` message → service worker forwards to OCR worker → handles extracted → returned

Uses vitest-chrome's `chrome.runtime.sendMessage` mock with `callListeners()` to simulate responses.

### `test/integration/ocr-pipeline.test.ts`

Tests real OCR against example images:

```ts
const TEST_CASES = [
  { file: 'G894uCFb0AA1cqD.jpg', expected: ['momoameo.bsky.social'] },
  { file: 'G8_tqvob0AIuUUD.jpg', expected: ['tanishiii.bsky.social'] },
  { file: 'G9Axyuhb0AA66Px.jpg', expected: ['sasa-ekakiman.bsky.social'] },
  { file: 'GF68_dwawAAi43w.jpg', expected: ['yeni1871.bsky.social'] },
];
```

- Runs actual Tesseract.js on each image
- Verifies extracted text contains expected handle
- Marked with `describe.concurrent` for parallel execution
- Can be skipped during rapid development with `vitest --exclude "**/ocr-pipeline*"`

## Configuration

### `vite.config.ts` additions

```ts
export default defineConfig({
  // ...existing config
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

### `test/setup.ts`

```ts
import chrome from 'vitest-chrome';
import { vi } from 'vitest';

// Mock Chrome APIs globally
Object.assign(globalThis, { chrome });

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
});
```

### `package.json` scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run test/unit",
    "test:integration": "vitest run test/integration",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Mock Factories

### `test/fixtures/mocks/chrome.ts`

```ts
export function mockCacheHit(handle: string, exists: boolean) {
  chrome.storage.local.get.mockResolvedValue({
    [handle]: { exists, timestamp: Date.now() }
  });
}

export function mockCacheMiss() {
  chrome.storage.local.get.mockResolvedValue({});
}
```

### `test/fixtures/mocks/tesseract.ts`

```ts
export function createMockTesseractWorker(ocrText: string) {
  return {
    recognize: vi.fn().mockResolvedValue({
      data: { text: ocrText }
    }),
    terminate: vi.fn(),
  };
}
```

### `test/fixtures/mocks/dom.ts`

```ts
export function createMockTweet(textContent: string, images: string[] = []) {
  const article = document.createElement('article');
  article.innerHTML = `<div>${textContent}</div>`;
  images.forEach(src => {
    const img = document.createElement('img');
    img.src = src;
    img.width = 200; // passes size filter
    article.appendChild(img);
  });
  return article;
}
```
