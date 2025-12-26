# Documentation Update Design

## Overview

Update CLAUDE.md with comprehensive technical details and create a new README.md for human visitors.

## CLAUDE.md - Comprehensive Rewrite

### Structure

```
# CLAUDE.md

## Project Overview
- What it does (detect Bluesky handles, inject badges)
- Why OCR (X shadowbans Bluesky links, users post screenshots)
- MV3 context (offscreen document requirement)

## Commands
- npm scripts (build, watch, lint, typecheck, test variants)
- Chrome loading instructions

## Source Structure
File-level listing with one-line descriptions:

src/
├── background/
│   ├── service-worker.ts    - Message routing, OCR dispatch, offscreen management
│   ├── bluesky-api.ts       - Bluesky profile verification API calls
│   └── cache.ts             - Legacy cache helpers (mostly moved to shared/)
├── content/
│   ├── content.ts           - Main orchestrator, badge injection flow
│   ├── dom-observer.ts      - DOM mutation watching, tweet extraction
│   ├── badge-injector.ts    - Badge creation and DOM insertion
│   ├── debug-page.ts        - Exposes debug functions to page context
│   └── styles.css           - Badge styling
├── offscreen/
│   ├── offscreen.ts         - Tesseract.js initialization, OCR processing
│   └── offscreen.html       - HTML host for offscreen context
├── shared/
│   ├── constants.ts         - Regexes, selectors, API endpoints, cache config
│   ├── messaging.ts         - Chrome message-passing utilities
│   ├── mapping-cache.ts     - Twitter→Bluesky mapping cache
│   ├── api-cache.ts         - Bluesky API lookup cache
│   ├── ocr-cache.ts         - Image OCR results cache
│   ├── handle-lookup.ts     - Unified handle verification function
│   └── debug.ts             - Debug logging infrastructure
└── types/
    └── index.ts             - TypeScript interfaces

## Architecture

### Entry Points
- src/content/content.ts → Content script (runs on x.com)
- src/background/service-worker.ts → Service worker
- src/offscreen/offscreen.ts → Offscreen document (hosts Tesseract.js)
- src/content/debug-page.ts → Debug utilities exposed to page

(Remove legacy ocr-worker.ts reference)

### Message Flow
(Keep existing diagram, verify accuracy)

### Caching System

**API Cache (xscape:api:*)**
Stores Bluesky profile verification results. When a handle is checked against
the Bluesky API, the result (exists/doesn't exist, display name) is cached for
24 hours. This prevents hammering the API for the same handles and provides
instant responses for previously-seen handles. Max 10,000 entries with
oldest-first pruning.

**OCR Cache (xscape:ocr:*)**
Stores OCR processing results keyed by hashed image URL. When an image is
processed by Tesseract, any extracted handles are cached for 7 days. This
avoids re-processing the same images on page refresh or when scrolling back
through the timeline. Max 10,000 entries.

**Mapping Cache (xscape:mapping:*)**
Stores confirmed Twitter→Bluesky handle mappings. When we discover that
@twitteruser has @user.bsky.social, this mapping is saved persistently (no TTL).
Sources have priority: text (explicit mention) > image (OCR) > inferred
(guessing twitter_handle.bsky.social). Higher-priority sources overwrite lower.
Max 20,000 entries.

## Testing
- Unit tests mock Chrome APIs via test/setup.ts
- Integration tests run real Tesseract against example_images/
- OCR tests use @vitest-environment node (Tesseract needs Node, not jsdom)
- Run single test: npx vitest run test/unit/path/to/test.ts

## Debug Logging
- Toggle: xscapeDebug(true) / xscapeDebug(false) in console
- Categories: [Xscape:DOM], [Xscape:OCR], [Xscape:API], [Xscape:CACHE], [Xscape:BADGE], [Xscape:MSG]

## Key Patterns
- Bluesky handle regex: /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi
- Twitter handle regex: /@([a-zA-Z0-9_]{1,15})/g
- Cache TTLs: API=24h, OCR=7d, Mapping=permanent
- X.com selectors: article for tweets, [data-testid="tweetText"] for text
```

## README.md - New File

### Structure

```markdown
# Xscape Hatch

One-paragraph hook explaining the problem (X shadowbans Bluesky links) and
solution (extension detects handles and adds clickable badges).

## Features
- Detects Bluesky handles mentioned in tweet text
- Uses OCR to find handles in profile screenshot images
- Injects clickable badges linking directly to Bluesky profiles
- Works on user profile pages
- Smart caching for instant display on repeat visits

## Screenshots

Screenshot 1: Before/after showing OCR detection
- Caption: "Detects Bluesky handles from profile screenshots using OCR"

Screenshot 2: Timeline with multiple badges
- Caption: "Adds clickable Bluesky badges next to usernames"

## Installation

### Chrome Web Store
Coming soon - use manual installation below for now.

### Manual Installation
1. Clone this repository
2. npm install && npm run build
3. Open chrome://extensions
4. Enable "Developer mode"
5. Click "Load unpacked" and select the dist/ folder

## How It Works
User-friendly 2-3 sentence explanation without technical jargon.
"When you browse X, Xscape Hatch scans tweets for Bluesky handles. It can even
read handles from profile screenshot images. When it finds one, it adds a
clickable badge so you can follow them on Bluesky with one click."

---

## For Developers

### Quick Start
npm install
npm run build
npm run watch  # development mode
npm test

### Architecture Overview
Brief description: Content script watches DOM → extracts handles → verifies
via service worker → injects badges. OCR runs in offscreen document due to
MV3 restrictions.

### Project Structure
High-level only:
- src/content/ - Content script (runs on x.com)
- src/background/ - Service worker
- src/offscreen/ - OCR processing
- src/shared/ - Shared utilities and caching

### More Details
See [CLAUDE.md](./CLAUDE.md) for comprehensive technical documentation
including architecture details, caching system, and testing guide.

## License
GPL - see LICENSE file
```

## Screenshot Captions

Based on viewing the actual screenshots:

1. **screenshot1.png**: Side-by-side before/after. Shows a tweet by @TOYOMAN_sfw
   containing a Bluesky profile screenshot. The "after" side shows the injected
   badge with the detected handle @toyomansfw.bsky.social.

2. **screenshot2.png**: Timeline view showing multiple tweets with Bluesky
   badges injected next to usernames (Morgan Clear VA, TOYOMAN, Hwaiting Hoshino).

## Implementation Notes

- Remove reference to src/worker/ocr-worker.ts (legacy, OCR now in offscreen)
- Use relative paths for screenshots: ./assets/screenshots/screenshot1.png
- Keep CLAUDE.md focused on what Claude Code needs to work effectively
- Keep README.md accessible to non-technical users in first half
