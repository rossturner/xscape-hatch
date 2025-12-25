# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Xscape Hatch is a Chrome Extension (Manifest V3) that detects Bluesky handles on X.com/Twitter and injects clickable profile badges. It uses OCR (Tesseract.js) to scan images for handles since users post Bluesky profile screenshots to avoid X's shadowbanning of direct links.

## Commands

```bash
npm install           # Install dependencies
npm run dev           # Development mode with HMR
npm run build         # Production build to dist/
npm run lint          # Run ESLint
npm run typecheck     # TypeScript type checking

npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:unit     # Run unit tests only
npm run test:integration  # Run integration tests only
npm run test:coverage # Run tests with coverage report
```

To load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `dist/` folder.

## Architecture

```
src/
├── content/                    # Content script (runs on x.com)
│   ├── content.ts              # Entry point, orchestrates DOM observation
│   ├── dom-observer.ts         # MutationObserver, handle/image extraction
│   └── badge-injector.ts       # Creates and updates Bluesky badges
├── background/                 # Service worker
│   ├── service-worker.ts       # Message handler, coordinates verification
│   ├── bluesky-api.ts          # Bluesky API calls
│   └── cache.ts                # chrome.storage.local verification cache
├── worker/
│   └── ocr-worker.ts           # Web Worker running Tesseract.js OCR
├── shared/
│   ├── constants.ts            # Regex patterns, selectors, API URLs, TTLs
│   ├── mapping-cache.ts        # Twitter→Bluesky handle mapping (memory + storage)
│   └── messaging.ts            # Type-safe chrome.runtime messaging
└── types/
    └── index.ts                # TypeScript interfaces

test/
├── setup.ts                    # Global test setup, Chrome API mocks
├── fixtures/mocks/
│   ├── chrome.ts               # Chrome storage mock helpers
│   ├── dom.ts                  # DOM element factories
│   └── tesseract.ts            # Tesseract mock factory
├── unit/
│   ├── shared/constants.test.ts
│   ├── background/cache.test.ts
│   ├── background/bluesky-api.test.ts
│   ├── content/badge-injector.test.ts
│   └── content/dom-observer.test.ts
└── integration/
    └── ocr-pipeline.test.ts    # Real Tesseract against example images
```

**Message Flow:**
```
Content Script ──VERIFY_HANDLE──► Service Worker ──► Bluesky API
      │                                │
      │◄─────HANDLE_VERIFIED──────────┘
      │
      ├──OCR_PROCESS──► OCR Worker (Tesseract.js)
      │◄────OCR_RESULT────┘
```

**Data Flow:**
1. `dom-observer.ts` watches for `<article>` elements, extracts tweet author handles (with retweet detection), Bluesky handles from text, and queues images >100px
2. `content.ts` checks mapping cache for known Twitter→Bluesky mappings, injects optimistic badges (dimmed), sends to service worker
3. `service-worker.ts` checks verification cache, then calls Bluesky API
4. `ocr-worker.ts` processes images with Tesseract.js, extracts `*.bsky.social` handles
5. Verified mappings saved to mapping cache for instant display on future encounters
6. Badges update to solid (verified) or are removed (doesn't exist)

## Testing

**Framework:** Vitest 4.x with jsdom for DOM testing

**Chrome API Mocking:** Manual mock in `test/setup.ts` (vitest-chrome incompatible with Vitest 4.x ESM)

**Test Structure:**
- Unit tests mock all dependencies (Chrome APIs, fetch, Tesseract)
- Integration tests run real Tesseract against `example_images/` directory
- OCR tests use `@vitest-environment node` directive (Tesseract needs Node, not jsdom)

**Example Images:** `example_images/` contains real Twitter images with Bluesky handles for OCR testing.

## Build System

Uses CRXJS + Vite to bundle ES modules for Chrome extension:
- Handles content script module imports (Chrome doesn't natively support)
- Auto-generates `web_accessible_resources` in manifest
- CSS imported in JS gets injected properly
- Vitest configured in `vite.config.ts`

## X.com DOM Notes

X.com obfuscates class names frequently. The extension uses:
- `<article>` elements to identify tweets
- `a[href^="/"]` links containing `@username` for handle detection
- `[data-testid="tweetText"]` for tweet text content
- Image size filtering (>100px) to skip avatars
- MutationObserver with 100ms debounce for dynamic content

## Key Patterns

**Handle Regex:** `/@?([a-zA-Z0-9_-]+\.bsky\.social)/gi`

**Cache TTLs:**
- Verified handles: 7 days
- Non-existent handles: 24 hours

**Badge States:**
- Optimistic (dimmed): Pending verification
- Verified (solid): Handle confirmed on Bluesky
- Removed: Handle doesn't exist

## Debug Logging

Runtime debug logging via `src/shared/debug.ts`. Toggle methods:
- Console: `xscapeDebug(true)` / `xscapeDebug(false)` on x.com
- Context menu: Right-click → "Xscape Hatch: Debug ON/OFF"
- Programmatic: `chrome.storage.local.set({ 'xscape:debug': true })`

Log categories: `[Xscape:DOM]`, `[Xscape:OCR]`, `[Xscape:API]`, `[Xscape:CACHE]`, `[Xscape:BADGE]`, `[Xscape:MSG]`

## Browser Testing with Playwright MCP

The project includes Playwright MCP configuration for testing the extension in a real browser.

**Config files:**
- `.mcp.json` - MCP server definition
- `playwright-mcp.config.json` - Browser launch args with extension loading
- `.claude/settings.local.json` - Enables project MCP servers

**Setup:**
1. Run `npm run build` to create production build in `dist/`
2. Restart Claude Code to load the project MCP server
3. Use Playwright MCP tools (`browser_navigate`, `browser_click`, etc.) to test on x.com

**How it works:**
The Playwright MCP launches Chromium with `--load-extension=./dist` to load the built extension automatically. This enables testing the full extension flow including content scripts, service worker, and OCR processing.
