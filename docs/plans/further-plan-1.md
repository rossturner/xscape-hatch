# Xscape Hatch dev guide: surviving X’s DOM + turning “screenshot handles” into real Bluesky links

You’re building an extension that:

1. finds Bluesky handles people posted *as images* on X (because link suppression),
2. OCRs those images locally,
3. validates the handle via Bluesky’s public APIs,
4. injects a neat link next to the X display name/handle.

X’s UI is React + infinite scroll + virtualization, so your UI will get deleted and recreated constantly. Plan for that, or enjoy suffering.

---

## 1) Architecture (keep the page script dumb, keep the extension resilient)

**Content script (runs on x.com):**

* Finds “tweet cards” in the Home timeline + profile timelines.
* Attaches lightweight observers.
* Injects your UI (badge/link) into each card *idempotently* (meaning: it can run 50 times and still not duplicate).

**Background/service worker (MV3):**

* Does cross-origin fetches to Bluesky APIs (content scripts are still bound by the page’s origin rules). Chrome explicitly documents that **extension contexts can do cross-origin with host permissions, but content scripts are subject to the web page origin**. ([Chrome for Developers][1])
* Maintains caches (handle → profile / DID) so you don’t hit rate limits.

**OCR worker (local-only):**

* Do OCR on-device. Don’t ship users’ images to a server unless you want your reviews to become “1★ spyware”.

---

## 2) Finding the right part of the page to watch

### Prefer semantic landmarks over brittle CSS

Use the page’s **main landmark** as your starting point. `role="main"` exists for accessibility and is less likely to get randomly nuked than classnames. ([MDN Web Docs][2])

**Root selection strategy:**

1. `main` element, or `[role="main"]` (fallback).
2. Within that, look for a likely timeline container (if there’s a region/group with an aria-label that smells like “Timeline”, great — don’t hardcode exact label text because locale/A-B tests).

Even if labels change, starting from the main landmark reduces sidebar/overlay noise.

---

## 3) Detecting “tweet cards” without relying on `data-testid`

Assume `data-testid` may be missing, unstable, or A/B’d.

### Use a functional signature (things the UI needs to work)

A robust “this is a tweet” signature is something like:

* Contains a **status permalink** (`/status/<id>` or `/i/status/<id>`). X uses these formats widely enough that they’re basically canonical. ([Wikidata][3])
* Often contains a `time` element with `datetime` (nice when present; don’t make it mandatory because X has experimented with timestamp display changes). ([Social Media Today][4])

**Practical heuristic (scoring, not a single selector):**

* +3 if descendant link matches `/status/(\d+)` or `/i/status/(\d+)`
* +1 if contains `time[datetime]`
* +1 if it *looks* like an article/card container (e.g., `article` tag)
* Treat anything with score ≥ 3 as a tweet card

Why scoring? Because X will “refactor” and your one perfect selector will die.

---

## 4) The only “new card arrived” notification you get: MutationObserver

X won’t send you events. You watch the DOM.

**MutationObserver basics:**
It’s the platform API designed to watch DOM tree changes. ([MDN Web Docs][5])

### Recommended observer setup

* Observe your chosen root (timeline container if you found it; otherwise `role="main"`).
* `childList: true, subtree: true` so you see inserted cards anywhere under it. ([JavaScript.info][6])
* In the callback, only inspect `addedNodes` and query downward from those nodes for candidate cards.

This keeps you from rescanning the universe every time React sneezes.

### Handle “content updates without new nodes”

Images often lazy-load or change `src/srcset` later.
Two options:

* Add an attributes observer with `attributeFilter: ["src", "srcset"]` on `img` nodes you care about (best effort).
* Or simpler: when a card becomes visible (next section), re-check its images and OCR any you haven’t seen.

---

## 5) Don’t OCR on “node added” — OCR on “node visible”

OCR is expensive. Infinite scroll is infinite. Do the math.

Use **IntersectionObserver** to trigger OCR only when:

* the tweet card (or its images) intersects the viewport.

IntersectionObserver is literally for efficiently tracking visibility. ([MDN Web Docs][7])

**Pattern:**

* When you detect a new tweet card, register it (or its `img`s) with an IntersectionObserver.
* When it becomes visible, enqueue OCR jobs for any unprocessed images.
* Keep per-image caches keyed by a stable identifier (image URL, blob hash, etc.) so you don’t OCR the same thing repeatedly.

---

## 6) Re-rendering + virtualization: assume your injected UI will be deleted

React will:

* replace a whole card node,
* wipe your injected element,
* reuse DOM for different tweets (virtualization).

So your injection logic must be **idempotent**.

### Idempotent injection rules

For each tweet card:

1. Compute a **tweet identity** (usually from the status permalink ID).
2. “Ensure” your UI exists for that tweet:

    * If missing → insert
    * If present but bound to a different tweet ID → update
    * If present and correct → do nothing

### Use a marker that survives *your* logic (not React)

* Add an attribute like `data-xscape-hatch="1"` to your injected element (not the tweet node).
* Also store mappings in memory: `tweetId → injectedElement`, `tweetId → processedImages`, etc.
* If your element disappears (because React), you’ll detect it next time you process that card and re-inject.

If you don’t do this, users will get flickering links and you’ll get angry GitHub issues.

---

## 7) SPA navigation: home ↔ profile without reload

X is an SPA; “new page” often means “same document, different DOM”.

### Options to detect navigation changes

* **Navigation API** (`navigation` + `navigate` event) is designed for intercepting navigations in SPAs, but it’s still labeled experimental-ish in docs, so use it opportunistically. ([MDN Web Docs][8])
* **`popstate`** catches back/forward history changes. ([MDN Web Docs][9])
* From the extension background, **`chrome.webNavigation`** can give you navigation lifecycle events if you declare the permission. ([Chrome for Developers][10])

### What to do on navigation

* Re-find your root container (`role="main"` etc.).
* Clear per-route caches if needed (or scope them by pathname).
* Run an initial sweep + keep observers attached (or reattach if the old root was replaced).

---

## 8) Bluesky API: yes, you can call it unauthenticated (for your use case)

Bluesky’s docs explicitly say **public endpoints that don’t require auth can be called against the public AppView** (`public.api.bsky.app`). ([docs.bsky.app][11])

### Endpoints you actually need

**Validate/lookup a handle or DID (single):**

```txt
GET https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=<handle-or-did>
```

This endpoint is documented as callable via the public AppView for no-auth usage. ([docs.bsky.app][11])

**Batch lookup (reduces requests):**

```txt
GET https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?actors=<actor>&actors=<actor>&actors=<actor>
```

Also documented as public-callable against the public AppView. ([docs.bsky.app][12])
(Yes, it’s repeated query params, not a comma list — people trip on that constantly. ([Stack Overflow][13]))

**Optional: resolve handle → DID:**

```txt
GET https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<handle>
```

Docs: resolves an atproto handle (hostname) to a DID. ([docs.bsky.app][14])

### Rate limits (don’t be a gremlin)

Bluesky documents rate limits and encourages adapting to rate limit headers / 429s. ([docs.bsky.app][15])
So: batch requests, cache aggressively, and back off on errors.

---

## 9) Chrome extension networking (do it the non-broken way)

If you want to call Bluesky from the extension:

* Put API calls in the **background/service worker** and request **host permissions** for the domains.
  Chrome’s docs: extension contexts can do cross-origin requests with host permissions; content scripts are constrained by the page origin. ([Chrome for Developers][1])

Example manifest bits (conceptual):

```json
{
  "host_permissions": [
    "https://public.api.bsky.app/*"
  ]
}
```

---

## 10) Putting it together: the processing pipeline

**Per navigation (home/profile):**

1. Locate root (`role="main"`).
2. Initial sweep: find candidate tweet cards under root, “ensure” injection watchers.
3. Start MutationObserver on root to capture new cards.
4. Start IntersectionObserver to OCR only visible cards/images.

**Per visible tweet card:**

1. Identify tweet ID from `/status/<id>` or `/i/status/<id>`. ([Wikidata][3])
2. Find images inside; for each image not yet processed:

    * OCR → extract candidate handle(s)
    * Normalize/validate via `getProfile` / `getProfiles`
    * Inject link UI next to author line (idempotently)

---

[1]: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests?utm_source=chatgpt.com "Cross-origin network requests | Chrome for Developers"
[2]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/main_role?utm_source=chatgpt.com "ARIA: main role - MDN Web Docs"
[3]: https://www.wikidata.org/wiki/Property%3AP5933?utm_source=chatgpt.com "X post ID - Wikidata"
[4]: https://www.socialmediatoday.com/news/x-formerly-twitter-considers-removing-time-stamps-from-posts/736997/?utm_source=chatgpt.com "X Is Considering Removing Time Markers on Posts in the Main Feed"
[5]: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver?utm_source=chatgpt.com "MutationObserver - Web APIs | MDN - MDN Web Docs"
[6]: https://javascript.info/mutation-observer?utm_source=chatgpt.com "Mutation observer - The Modern JavaScript Tutorial"
[7]: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API?utm_source=chatgpt.com "Intersection Observer API - Web APIs | MDN - MDN Web Docs"
[8]: https://developer.mozilla.org/en-US/docs/Web/API/Navigation/navigate_event?utm_source=chatgpt.com "Navigation: navigate event - Web APIs | MDN - MDN Web Docs"
[9]: https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event?utm_source=chatgpt.com "Window: popstate event - Web APIs | MDN - MDN Web Docs"
[10]: https://developer.chrome.com/docs/extensions/reference/api/webNavigation?utm_source=chatgpt.com "chrome.webNavigation | API | Chrome for Developers"
[11]: https://docs.bsky.app/docs/api/app-bsky-actor-get-profile?utm_source=chatgpt.com "app.bsky.actor.getProfile | Bluesky"
[12]: https://docs.bsky.app/docs/api/app-bsky-actor-get-profiles?utm_source=chatgpt.com "app.bsky.actor.getProfiles | Bluesky - docs.bsky.app"
[13]: https://stackoverflow.com/questions/79489874/bluesky-api-bulk-retrieve-profile-informtion?utm_source=chatgpt.com "Bluesky API - bulk retrieve Profile Informtion - Stack Overflow"
[14]: https://docs.bsky.app/docs/api/com-atproto-identity-resolve-handle?utm_source=chatgpt.com "com.atproto.identity.resolveHandle | Bluesky"
[15]: https://docs.bsky.app/docs/advanced-guides/rate-limits?utm_source=chatgpt.com "Rate Limits | Bluesky - docs.bsky.app"
