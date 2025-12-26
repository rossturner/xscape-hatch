# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Xscape Hatch is a Chrome Extension (Manifest V3) that detects Bluesky handles on X.com/Twitter and injects clickable profile badges. It uses OCR (Tesseract.js) to scan images for handles since users post Bluesky profile screenshots to avoid X's shadowbanning of direct links.

The extension runs entirely client-side with no external servers. Chrome MV3 restrictions require an offscreen document to host the Tesseract.js worker since service workers can't spawn Web Workers.

## Commands

```bash
npm run build            # Build extension to dist/
npm run watch            # Build with watch mode
npm run lint             # ESLint
npm run typecheck        # TypeScript type checking
npm test                 # Run all tests
npm run test:watch       # Tests in watch mode
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only (runs real Tesseract OCR)
```

To load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`

## Source Structure

```
src/
├── background/
│   ├── service-worker.ts   # Message routing, OCR dispatch, offscreen document management
│   ├── bluesky-api.ts      # Bluesky profile verification API calls
│   └── cache.ts            # Legacy cache helpers (getCachedHandle, setCachedHandle)
├── content/
│   ├── content.ts          # Main orchestrator - badge injection flow, OCR queue management
│   ├── dom-observer.ts     # DOM mutation watching, tweet/handle/image extraction
│   ├── badge-injector.ts   # Badge element creation and DOM insertion
│   ├── debug-page.ts       # Exposes xscapeDebug() and xscapeClearCaches() to page
│   └── styles.css          # Badge styling (blue background, butterfly icon, hover)
├── offscreen/
│   ├── offscreen.ts        # Tesseract.js initialization, image fetch, OCR processing
│   └── offscreen.html      # HTML host for offscreen document context
├── shared/
│   ├── constants.ts        # Regexes, selectors, API endpoints, cache config, message types
│   ├── messaging.ts        # Chrome runtime message-passing utilities
│   ├── mapping-cache.ts    # Twitter→Bluesky mapping cache (in-memory + storage)
│   ├── api-cache.ts        # Bluesky API verification results cache
│   ├── ocr-cache.ts        # Image OCR results cache (keyed by URL hash)
│   ├── handle-lookup.ts    # Unified handle verification entry point
│   └── debug.ts            # Debug logging with categories, storage toggle
└── types/
    └── index.ts            # TypeScript interfaces and type definitions
```

## Architecture

### Entry Points

- `src/content/content.ts` → Content script (runs on x.com pages)
- `src/background/service-worker.ts` → Service worker (message handling, API calls)
- `src/offscreen/offscreen.ts` → Offscreen document (hosts Tesseract.js OCR)
- `src/content/debug-page.ts` → Debug utilities injected into page context

### Message Flow

```
Content Script ──VERIFY_HANDLE──► Service Worker ──► Bluesky API
      │                                │
      │◄─────response─────────────────┘
      │
      ├──OCR_PROCESS──► Service Worker ──► Offscreen Doc ──► Tesseract.js
      │◄────────────────────OCR_RESULT────────────────────────┘
```

### Data Flow

1. `dom-observer.ts` watches for tweets via MutationObserver, extracts handles from text, queues images >100px
2. `content.ts` checks mapping cache for known Twitter→Bluesky mappings, injects badges for cached handles
3. For uncached handles: sends `VERIFY_HANDLE` to service worker, which checks API cache then calls Bluesky API
4. For images: sends `OCR_PROCESS` to service worker, which delegates to offscreen document for Tesseract processing
5. Verified mappings saved to mapping cache for instant display on future encounters

### Caching System

**API Cache (`xscape:api:*`)**

Stores Bluesky profile verification results. When a handle is checked against the Bluesky API, the result (exists/doesn't exist, display name) is cached for 24 hours. This prevents hammering the API for the same handles and provides instant responses for previously-seen handles. Max 10,000 entries with oldest-first pruning.

**OCR Cache (`xscape:ocr:*`)**

Stores OCR processing results keyed by hashed image URL. When an image is processed by Tesseract, any extracted handles are cached for 7 days. This avoids re-processing the same images on page refresh or when scrolling back through the timeline. Max 10,000 entries.

**Mapping Cache (`xscape:mapping:*`)**

Stores confirmed Twitter→Bluesky handle mappings. When we discover that @twitteruser has @user.bsky.social, this mapping is saved persistently (no TTL). Sources have priority: text (explicit mention) > image (OCR) > inferred (guessing twitter_handle.bsky.social). Higher-priority sources overwrite lower. Max 20,000 entries.

## Testing

- Unit tests mock Chrome APIs via manual mock in `test/setup.ts`
- Integration tests run real Tesseract against `example_images/`
- OCR tests use `@vitest-environment node` (Tesseract needs Node, not jsdom)

Run single test: `npx vitest run test/unit/background/cache.test.ts`

Test structure:
```
test/
├── setup.ts              # Chrome API mocks
├── unit/
│   ├── background/       # service-worker, bluesky-api, cache tests
│   ├── content/          # dom-observer, badge-injector tests
│   └── shared/           # cache modules, constants, handle-lookup tests
└── integration/
    └── ocr-pipeline.test.ts  # Real Tesseract OCR tests (30s timeout)
```

## Manual Testing with Playwright MCP

Claude Code can use the Playwright MCP server to manually test the extension in a real browser. The configuration in `.mcp.json` and `playwright-mcp.config.json` launches Chromium with the extension pre-installed from `dist/`.

To test: ensure the extension is built (`npm run build`), then use the Playwright MCP tools to navigate to x.com and verify badge injection, OCR processing, etc.

## Debug Logging

Toggle via console on x.com: `xscapeDebug(true)` / `xscapeDebug(false)`

Log categories:
- `[Xscape:DOM]` - DOM mutations, tweet extraction
- `[Xscape:OCR]` - Image processing, Tesseract output
- `[Xscape:API]` - Bluesky API calls, verification results
- `[Xscape:CACHE]` - Cache hits/misses, pruning
- `[Xscape:BADGE]` - Badge injection, state updates
- `[Xscape:MSG]` - Message passing, service worker lifecycle

Clear all caches: `xscapeClearCaches()`

## Key Patterns

- Bluesky handle regex: `/@?([a-zA-Z0-9_-]+\.bsky\.social)/gi`
- Twitter handle regex: `/@([a-zA-Z0-9_]{1,15})/g`
- Cache TTLs: API=24 hours, OCR=7 days, Mapping=permanent
- X.com selectors: `article` for tweets, `[data-testid="tweetText"]` for text
- Badge attribute: `data-xscape-hatch` (used to detect existing badges)
