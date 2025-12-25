# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Xscape Hatch is a Chrome Extension (Manifest V3) that detects Bluesky handles on X.com/Twitter and injects clickable profile badges. It uses OCR (Tesseract.js) to scan images for handles since users post Bluesky profile screenshots to avoid X's shadowbanning of direct links.

## Commands

```bash
npm run build         # Build extension to dist/
npm run watch         # Build with watch mode
npm run lint          # ESLint
npm run typecheck     # TypeScript type checking
npm test              # Run all tests
npm run test:watch    # Tests in watch mode
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only (runs real Tesseract OCR)
```

To load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`

## Architecture

**Build:** esbuild bundles TypeScript directly to ES modules. No framework plugins - just `scripts/build.mjs` bundling entry points and copying static assets.

**Entry Points:**
- `src/content/content.ts` → Content script (runs on x.com)
- `src/background/service-worker.ts` → Service worker
- `src/offscreen/offscreen.ts` → Offscreen document (hosts OCR worker)
- `src/worker/ocr-worker.ts` → Web Worker running Tesseract.js

**Message Flow:**
```
Content Script ──VERIFY_HANDLE──► Service Worker ──► Bluesky API
      │                                │
      │◄─────HANDLE_VERIFIED──────────┘
      │
      ├──OCR_PROCESS──► Offscreen Doc ──► OCR Worker
      │◄────OCR_RESULT────────────────────┘
```

**Data Flow:**
1. `dom-observer.ts` watches for tweets, extracts handles from text, queues images >100px
2. `content.ts` checks mapping cache, injects optimistic badges, sends to service worker
3. `service-worker.ts` verifies handles via Bluesky API, creates offscreen doc for OCR
4. `ocr-worker.ts` processes images with Tesseract.js, extracts `.bsky.social` handles
5. Verified mappings cached for instant display on future encounters

**Why Offscreen Document:** Chrome MV3 doesn't allow Web Workers in service workers. The offscreen document hosts the Tesseract.js worker.

## Testing

- Unit tests mock Chrome APIs (manual mock in `test/setup.ts`)
- Integration tests run real Tesseract against `example_images/`
- OCR tests use `@vitest-environment node` (Tesseract needs Node, not jsdom)

Run single test: `npx vitest run test/unit/background/cache.test.ts`

## Debug Logging

Toggle via console on x.com: `xscapeDebug(true)` / `xscapeDebug(false)`

Log categories: `[Xscape:DOM]`, `[Xscape:OCR]`, `[Xscape:API]`, `[Xscape:CACHE]`, `[Xscape:BADGE]`, `[Xscape:MSG]`

## Key Patterns

- Handle regex: `/@?([a-zA-Z0-9_-]+\.bsky\.social)/gi`
- Cache TTLs: verified=7 days, non-existent=24 hours
- X.com selectors: `article` for tweets, `[data-testid="tweetText"]` for text
