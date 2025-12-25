# Caching Strategy Redesign

## Problem

The current caching logic prevents OCR from running when it should. When an inferred handle (e.g., `elonmusk.bsky.social`) is checked and doesn't exist, it creates a mapping with `verified: false`. Subsequent encounters of that user's tweets hit early returns, permanently blocking OCR detection for their images.

Detection methods should be independent - a failed inferred lookup shouldn't prevent OCR from finding a handle in an image.

## Solution Overview

Split into three independent caches with clear responsibilities:

1. **API Cache** - Deduplicates Bluesky API calls
2. **Image OCR Cache** - Deduplicates OCR processing
3. **Mapping Cache** - Stores confirmed Twitter→Bluesky links

Key behavior change: All mappings are verified before creation. No more `verified: true/false` distinction.

## Data Structures

### API Cache

Caches Bluesky API responses to avoid redundant network calls.

```typescript
interface ApiCacheEntry {
  exists: boolean;
  displayName: string | null;
  checkedAt: number;
}
```

- **Key:** `xscape:api:{blueskyHandle}`
- **TTL:** 24 hours
- **Max entries:** 1000

### Image OCR Cache

Tracks which images have been processed to avoid redundant OCR.

```typescript
interface OcrCacheEntry {
  handles: string[];      // Handles found (may be empty)
  processedAt: number;
}
```

- **Key:** `xscape:ocr:{md5(imageUrl)}`
- **TTL:** 7 days
- **Max entries:** 500

### Mapping Cache

Stores confirmed Twitter→Bluesky associations. All entries are verified.

```typescript
interface MappingEntry {
  twitterHandle: string;
  blueskyHandle: string;
  displayName: string | null;
  source: 'text' | 'image' | 'inferred';
  discoveredAt: number;
}
```

- **Key:** `xscape:mapping:{twitterHandle}`
- **TTL:** 7 days
- **Max entries:** 1000

Note: Removed `verified` field - all mappings are verified before creation.

## Core Functions

### lookupHandle

Generic Bluesky API lookup with caching.

```typescript
async function lookupHandle(blueskyHandle: string): Promise<ApiCacheEntry> {
  const cached = getApiCache(blueskyHandle);
  if (cached && !isStale(cached, 24 * 60 * 60 * 1000)) {
    return cached;
  }

  const result = await callBlueskyApi(blueskyHandle);
  saveApiCache(blueskyHandle, result);
  return result;
}
```

### getImageAuthor

Determines true owner of an image from its status URL.

```typescript
function getImageAuthor(imageElement: HTMLImageElement): string | null {
  const imgLink = imageElement.closest('a[href*="/status/"]');
  const statusUrl = imgLink?.getAttribute('href');

  if (statusUrl) {
    // "/Ganbarosuu/status/123/photo/1" → "Ganbarosuu"
    return statusUrl.split('/')[1];
  }

  return null;
}
```

This approach:
- Works for regular tweets (URL matches article author)
- Works for quote tweets (URL contains quoted author)
- Works for retweets (shows original tweet)
- No heuristic quote detection needed - URL is source of truth

## Updated Flow

### onTweetFound

```
onTweetFound(tweet):
  author = tweet.author

  // Step 1: Check existing mapping
  mapping = getMappingCache(author.twitterHandle)
  if (mapping):
    injectBadge(author, mapping)
    return

  // Step 2: Process text-based handles
  for handle in tweet.blueskyHandles:
    result = lookupHandle(handle)
    if (result.exists):
      saveMapping(author.twitterHandle, handle, result.displayName, 'text')
      injectBadge(...)
      return  // Text has highest priority

  // Step 3: Queue images for OCR (runs independently)
  for image in tweet.images:
    imageAuthor = getImageAuthor(image)
    if (imageAuthor && !inOcrCache(image.url)):
      queueForOcr(image.url, imageAuthor)

  // Step 4: Try inferred handle
  inferredHandle = author.twitterHandle + '.bsky.social'
  result = lookupHandle(inferredHandle)
  if (result.exists):
    saveMapping(author.twitterHandle, inferredHandle, result.displayName, 'inferred')
    injectBadge(...)
```

### processOcrResult

```
processOcrResult(imageUrl, twitterHandle, handles):
  saveOcrCache(imageUrl, handles)

  for blueskyHandle in handles:
    // Check if we already have a mapping for this user
    existing = getMappingCache(twitterHandle)
    if (existing):
      continue  // Don't overwrite existing mapping

    result = lookupHandle(blueskyHandle)
    if (result.exists):
      saveMapping(twitterHandle, blueskyHandle, result.displayName, 'image')
      injectBadge(...)
```

## Source Priority

When multiple detection methods find handles for the same user:

1. **text** (highest) - Handle found in tweet text
2. **image** - Handle found via OCR
3. **inferred** (lowest) - Derived from Twitter username

Higher priority sources can overwrite lower priority mappings via `shouldOverwriteMapping()`.

## Cache Management

### Pruning

Each cache manages its own size independently:
- When cache exceeds max entries, remove oldest by `checkedAt`/`processedAt`/`discoveredAt`
- Run pruning after each write operation

### TTL Checking

```typescript
function isStale(entry: { checkedAt: number }, ttlMs: number): boolean {
  return Date.now() - entry.checkedAt > ttlMs;
}
```

### Storage Keys

All caches use Chrome's `storage.local` with prefixes:
- `xscape:api:` - API response cache
- `xscape:ocr:` - OCR processed images
- `xscape:mapping:` - User mappings

## Migration

Existing mappings in the old format need migration:
1. Load all `xm:` prefixed entries (old format)
2. Filter to only `verified: true` entries
3. Convert to new format, save with new prefix
4. Delete old entries

Unverified mappings are discarded - they'll be re-detected with the new logic.

## Benefits

1. **OCR runs independently** - Failed inferred lookups don't block image detection
2. **No redundant API calls** - All handle lookups cached for 24h
3. **No redundant OCR** - Processed images cached for 7 days
4. **Simpler mapping cache** - All entries verified, no state machine
5. **Correct quote tweet handling** - Image URLs identify true owner
