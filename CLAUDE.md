# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Xscape Hatch is a Chrome Extension (Manifest V3) that detects Bluesky handles on X.com/Twitter and injects clickable profile badges. It uses OCR (Tesseract.js) to scan images for handles since users post Bluesky profile screenshots to avoid X's shadowbanning of direct links.

## Build Commands

```bash
npm install          # Install dependencies
npm run dev          # Development mode with HMR
npm run build        # Production build to dist/
```

To load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `dist/` folder.

## Architecture

```
Content Script (x.com)     Service Worker (background)     Web Worker
       │                           │                           │
  dom-observer.ts            service-worker.ts           ocr-worker.ts
       │                           │                           │
  badge-injector.ts          bluesky-api.ts              Tesseract.js
       │                      cache.ts                         │
  content.ts ◄─────────────────────┼───────────────────────────┘
       │                           │
       └───── MESSAGE_TYPES ───────┘
              (chrome.runtime)

  Shared Layer:
  ├── mapping-cache.ts (Twitter→Bluesky handle mappings)
  └── constants.ts (config, selectors, patterns)
```

**Data Flow:**
1. `dom-observer.ts` watches for `<article>` elements (tweets), extracts tweet author handles (with retweet detection), Bluesky handles from text, and queues images
2. `content.ts` checks mapping cache for known Twitter→Bluesky associations, injects optimistic badges (dimmed) for new handles, sends to service worker for verification
3. `service-worker.ts` checks verification cache, then calls Bluesky API to verify handles exist
4. `ocr-worker.ts` processes images with Tesseract.js, extracts `*.bsky.social` handles
5. Verified mappings are saved to mapping cache (memory + chrome.storage.local) for instant display on future encounters
6. Badges update to solid (verified) or are removed (doesn't exist)

**Key Files:**
- `src/shared/constants.ts` - Centralized selectors, regex patterns, API URLs, cache TTLs
- `src/shared/mapping-cache.ts` - Two-layer cache (memory + chrome.storage.local) for Twitter→Bluesky mappings
- `src/content/styles.css` - Badge styling with `.xscape-hatch-badge` class
- `manifest.json` - Extension config (permissions, content scripts, service worker)

## Build System

Uses CRXJS + Vite to bundle ES modules for Chrome extension:
- Handles content script module imports (Chrome doesn't natively support)
- Auto-generates `web_accessible_resources` in manifest
- CSS imported in JS gets injected properly

## X.com DOM Notes

X.com obfuscates class names frequently. The extension uses:
- `<article>` elements to identify tweets
- `a[href^="/"]` links containing `@username` for handle detection
- Image size filtering (>100px) to skip avatars
- MutationObserver with 100ms debounce for dynamic content
