# Twitter-to-Bluesky Account Mapping Design

## Problem

X.com uses React with virtualization. When users scroll, React unmounts and remounts tweet components, deleting any injected badges. The current implementation tracks processed articles with a `WeakSet`, but when React replaces a DOM node, the badge is lost and not re-injected.

## Solution

Shift from per-tweet tracking to per-Twitter-account mapping. Build a cache that associates Twitter handles with their Bluesky accounts. When a badge disappears due to React re-rendering, we detect the tweet author, lookup the mapping, and re-inject instantly.

## Data Model

### TwitterBlueskyMapping

```typescript
interface TwitterBlueskyMapping {
  twitterHandle: string;        // e.g., "alice"
  blueskyHandle: string;        // e.g., "alice.bsky.social"
  verified: boolean;            // Bluesky API confirmed handle exists
  displayName: string | null;   // From Bluesky profile
  discoveredAt: number;         // Timestamp
  source: 'text' | 'image' | 'inferred';
}
```

### TweetAuthor

```typescript
interface TweetAuthor {
  twitterHandle: string;
  authorElement: HTMLElement;   // For badge placement
  isRetweet: boolean;
  retweetedBy: string | null;
}
```

### Updated TweetData

```typescript
interface TweetData {
  article: HTMLElement;
  author: TweetAuthor;
  blueskyHandles: string[];     // Explicit handles found in text
  images: string[];             // Image URLs to OCR
}
```

## Cache Architecture

### Two-Layer Cache

1. **Memory layer** (`Map<string, TwitterBlueskyMapping>`) - Fast lookups during session
2. **Storage layer** (`chrome.storage.local`) - Persisted across sessions

Key format for storage: `twitter2bsky:<handle>` → `TwitterBlueskyMapping`

### Cache Operations

```typescript
// On extension load: hydrate memory from storage
async function loadMappingCache(): Promise<void>

// On new discovery: update both layers
async function saveMappingCache(mapping: TwitterBlueskyMapping): Promise<void>

// Lookup (memory-first, instant)
function getMapping(twitterHandle: string): TwitterBlueskyMapping | null
```

## Processing Flow

```
Tweet appears in DOM
        ↓
Extract TweetAuthor (handle, element, retweet info)
        ↓
Check mapping cache for Twitter handle
        ↓
┌───────────────────────────────────────────────────┐
│                                                   │
HAS MAPPING (verified)              NO MAPPING
        │                                   │
        ↓                                   ↓
Inject badge immediately      Scan text for Bluesky handles
                              Queue images for OCR
                                        │
                                        ↓
                              Handle found?
                              YES → Create mapping
                                  → Verify via Bluesky API
                                  → Inject badge
                              NO  → Do nothing
```

## Retweet Handling

Retweets show a "reposted" indicator. We always associate discovered Bluesky handles with the **original tweet author**, not the retweeter.

```typescript
interface TweetContext {
  author: TweetAuthor;           // Original content author
  retweetedBy: string | null;    // Person who retweeted
  isRetweet: boolean;
}
```

Detection:
1. Check for retweet indicator in article
2. If retweet: find original author from tweet body
3. If not retweet: author is the first handle link
4. Associate discovered handles with original author

## UI Re-injection Flow

When React re-renders and badge disappears:

```
MutationObserver fires (new/changed nodes)
        ↓
Process article, extract TweetAuthor
        ↓
Badge exists for this author in article?
        ↓
YES → Do nothing
NO  → Check mappingCache for Twitter handle
        ↓
HAS verified mapping → Inject badge immediately (sync, no API)
HAS unverified mapping → Verify, then inject
NO mapping → Scan for handles (normal flow)
```

## Association Rules

One Bluesky handle per Twitter account. When multiple handles are discovered:

1. First discovered handle wins
2. Higher confidence sources can overwrite lower:
   - `text` (highest) - explicit handle in tweet text
   - `image` (medium) - OCR from image
   - `inferred` (lowest) - guessed from Twitter handle

## File Changes

### New Files

- `src/shared/mapping-cache.ts` - Cache module with load/save/get operations

### Modified Files

- `src/types/index.ts` - Add `TwitterBlueskyMapping`, `TweetAuthor`, update `TweetData`
- `src/content/dom-observer.ts` - Add `extractTweetAuthor()`, retweet detection
- `src/content/content.ts` - Integrate mapping cache, change to author-based flow

### Unchanged Files

- `src/worker/ocr-worker.ts` - No changes needed
- `src/background/bluesky-api.ts` - No changes needed
- `src/background/cache.ts` - Keep for Bluesky API response caching (separate concern)
- `src/content/badge-injector.ts` - No changes needed
- `src/content/styles.css` - No changes needed
