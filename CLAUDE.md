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
  dom-observer.js            service-worker.js           ocr-worker.js
       │                           │                           │
  badge-injector.js          bluesky-api.js              Tesseract.js
       │                      cache.js                         │
  content.js ◄─────────────────────┼───────────────────────────┘
       │                           │
       └───── MESSAGE_TYPES ───────┘
              (chrome.runtime)
```

**Data Flow:**
1. `dom-observer.js` watches for `<article>` elements (tweets), extracts handles from text and queues images
2. `content.js` injects optimistic badges (dimmed) and sends handles to service worker
3. `service-worker.js` checks cache, then calls Bluesky API to verify handles exist
4. `ocr-worker.js` processes images with Tesseract.js, extracts `*.bsky.social` handles
5. Badges update to solid (verified) or are removed (doesn't exist)

**Key Files:**
- `src/shared/constants.js` - Centralized selectors, regex patterns, API URLs, cache TTLs
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
