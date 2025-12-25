# TypeScript Conversion Design

Convert the entire Xscape Hatch codebase from JavaScript to TypeScript with strict configuration.

## Decisions

- **TypeScript strictness:** Strict (`strict: true`)
- **Chrome types:** `@types/chrome`
- **ESLint:** Update to `@typescript-eslint`
- **Tesseract.js:** Install as npm dependency (remove CDN import)

## Project Configuration

### tsconfig.json

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

### package.json additions

```json
{
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/chrome": "^0.0.287",
    "@typescript-eslint/parser": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0"
  },
  "dependencies": {
    "tesseract.js": "^5.0.0"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

### ESLint update

Update `eslint.config.js` to use:
- `@typescript-eslint/parser`
- `plugin:@typescript-eslint/recommended`
- Apply to `.ts` files

## Type Definitions

### src/types/index.ts

```typescript
// Message types
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

// Cache
export interface CacheEntry {
  exists: boolean;
  displayName: string | null;
  checkedAt: number;
}

// DOM observer
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

// OCR Worker messages
export type WorkerIncomingMessage =
  | { type: 'init'; id?: string }
  | { type: 'process'; id?: string; payload: { imageUrl: string } }
  | { type: 'terminate' };

export type WorkerOutgoingMessage =
  | { type: 'ready'; id?: string }
  | { type: 'result'; id?: string; payload: { imageUrl: string; handles: string[] } };
```

## File Conversions

### Shared

**src/shared/constants.ts**
- Add `as const` to `MESSAGE_TYPES` for literal types
- Types for `SELECTORS`, `BLUESKY_API`, `CACHE` objects

**src/shared/messaging.ts**
- Generic `sendToBackground<T, R>()` with typed request/response
- Typed `onMessage()` callback with `chrome.runtime.MessageSender`

### Content Scripts

**src/content/content.ts**
- `processedImages: Set<string>`
- `pendingHandles: Set<string>`
- `ocrWorker: Worker | null`
- Typed OCR message handling

**src/content/dom-observer.ts**
- `createDOMObserver(onTweetFound: (data: TweetData) => void): { start: () => void; stop: () => void }`
- `processedArticles: WeakSet<HTMLElement>`

**src/content/badge-injector.ts**
- `createBadge(handle: string): HTMLAnchorElement`
- `updateBadgeState(handle: string, exists: boolean): void`
- `badgeExistsFor(handle: string, container: Element): boolean`
- `injectBadge(badge: HTMLAnchorElement, targetElement: Element): void`

### Background Scripts

**src/background/service-worker.ts**
- `pendingVerifications: Map<string, Promise<VerifyHandleResponse>>`
- `handleVerification(handle: string, tabId?: number): Promise<VerifyHandleResponse>`

**src/background/cache.ts**
- `getCachedHandle(handle: string): Promise<CacheEntry | null>`
- `setCachedHandle(handle: string, exists: boolean, displayName?: string | null): Promise<void>`
- `pruneCache(maxEntries?: number): Promise<void>`

**src/background/bluesky-api.ts**
- `verifyBlueskyProfile(handle: string): Promise<{ exists: boolean; displayName: string | null } | null>`

### Worker

**src/worker/ocr-worker.ts**
- Add `/// <reference lib="webworker" />` directive
- Import `tesseract.js` from npm
- `worker: Tesseract.Worker | null`
- Typed `self.onmessage` handler
- `processImage(imageUrl: string): Promise<string[]>`

## Manifest Updates

Update file references in `manifest.json`:
- `"service_worker": "src/background/service-worker.ts"`
- `"js": ["src/content/content.ts"]`

CRXJS/Vite handles transpilation to `.js` in the output.

## Final Structure

```
src/
├── types/
│   └── index.ts
├── shared/
│   ├── constants.ts
│   └── messaging.ts
├── content/
│   ├── content.ts
│   ├── dom-observer.ts
│   ├── badge-injector.ts
│   └── styles.css
├── background/
│   ├── service-worker.ts
│   ├── cache.ts
│   └── bluesky-api.ts
└── worker/
    └── ocr-worker.ts

tsconfig.json
vite.config.ts
eslint.config.js
```

## Unchanged

- `src/content/styles.css`
- Build commands (`npm run dev`, `npm run build`)
- Overall architecture and data flow
