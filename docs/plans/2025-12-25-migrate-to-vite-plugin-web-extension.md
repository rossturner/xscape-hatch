# Migrate from CRXJS to vite-plugin-web-extension

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace CRXJS with vite-plugin-web-extension to fix Chrome 130+ CSP issues blocking content script loading.

**Architecture:** The new plugin bundles content scripts directly without generating a dynamic import loader. Manifest is defined inline in vite.config.ts. Offscreen document and OCR worker are configured as additional inputs.

**Tech Stack:** Vite 5.x, @samrum/vite-plugin-web-extension, TypeScript, Manifest V3

---

## Task 1: Swap Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Uninstall CRXJS and install vite-plugin-web-extension**

Run:
```bash
npm uninstall @crxjs/vite-plugin && npm install -D @samrum/vite-plugin-web-extension
```

Expected: Package removed and new package added, package-lock.json updated.

**Step 2: Verify installation**

Run:
```bash
npm ls @samrum/vite-plugin-web-extension
```

Expected: Shows installed version (e.g., `@samrum/vite-plugin-web-extension@3.x.x`)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: replace CRXJS with vite-plugin-web-extension"
```

---

## Task 2: Rewrite vite.config.ts

**Files:**
- Modify: `vite.config.ts`
- Reference: `manifest.json` (for values to copy)

**Step 1: Replace the entire vite.config.ts**

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import webExtension from '@samrum/vite-plugin-web-extension';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: {
        manifest_version: 3,
        name: 'Xscape Hatch - Twitter to Bluesky Escape',
        version: '1.0.0',
        description: 'Find Bluesky profiles on X/Twitter',
        permissions: ['storage', 'contextMenus', 'offscreen'],
        host_permissions: [
          'https://x.com/*',
          'https://twitter.com/*',
          'https://public.api.bsky.app/*',
        ],
        background: {
          service_worker: 'src/background/service-worker.ts',
          type: 'module',
        },
        content_scripts: [
          {
            matches: ['https://x.com/*', 'https://twitter.com/*'],
            js: ['src/content/content.ts'],
            css: ['src/content/styles.css'],
            run_at: 'document_idle',
          },
        ],
        icons: {
          '16': 'assets/icons/icon-16.png',
          '48': 'assets/icons/icon-48.png',
          '128': 'assets/icons/icon-128.png',
        },
      },
      additionalInputs: {
        html: ['src/offscreen/offscreen.html'],
        scripts: ['src/worker/ocr-worker.ts'],
      },
      useDynamicUrlWebAccessibleResources: false,
    }),
  ],
  build: {
    sourcemap: process.env.NODE_ENV === 'development',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/types/**'],
    },
  },
});
```

**Step 2: Verify syntax**

Run:
```bash
npm run typecheck
```

Expected: No errors (or only pre-existing errors unrelated to vite.config.ts)

**Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat: rewrite vite config for vite-plugin-web-extension"
```

---

## Task 3: Remove Old manifest.json

**Files:**
- Delete: `manifest.json`

**Step 1: Delete the old manifest file**

Run:
```bash
rm manifest.json
```

Expected: File deleted. The manifest is now defined inline in vite.config.ts.

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove standalone manifest.json (now inline in vite.config)"
```

---

## Task 4: Update Content Script CSS Import

**Files:**
- Modify: `src/content/content.ts`

The new plugin handles CSS differently - it's declared in manifest, not imported in JS.

**Step 1: Remove CSS import from content.ts**

Open `src/content/content.ts` and remove this line (should be line 1):
```typescript
import './styles.css';
```

**Step 2: Verify file still has correct structure**

The file should now start with:
```typescript
import { MESSAGE_TYPES } from '../shared/constants';
```

**Step 3: Commit**

```bash
git add src/content/content.ts
git commit -m "fix: remove CSS import (now in manifest content_scripts.css)"
```

---

## Task 5: Update Web Accessible Resources for OCR Worker

**Files:**
- Modify: `src/offscreen/offscreen.ts`
- Modify: `src/background/service-worker.ts`

The worker path may change with the new build system. We need to verify and update references.

**Step 1: Check current worker reference in offscreen.ts**

Read `src/offscreen/offscreen.ts` and note the worker path used in `new Worker()`.

**Step 2: Update worker path if needed**

The new plugin outputs to `dist/` with different naming. The worker should be referenced via `chrome.runtime.getURL()`. Verify the built output path after first build (Task 6) and update if necessary.

**Step 3: Commit any changes**

```bash
git add src/offscreen/offscreen.ts src/background/service-worker.ts
git commit -m "fix: update worker paths for new build system"
```

---

## Task 6: Build and Verify Output

**Files:**
- None (verification only)

**Step 1: Clean old build artifacts**

Run:
```bash
rm -rf dist/
```

**Step 2: Run production build**

Run:
```bash
npm run build
```

Expected: Build succeeds without errors. Output in `dist/` directory.

**Step 3: Verify dist/ structure**

Run:
```bash
ls -la dist/
```

Expected: Should contain:
- `manifest.json` (generated)
- Content script JS file
- Service worker JS file
- CSS file
- icons/
- offscreen HTML + JS
- worker JS

**Step 4: Verify manifest.json content**

Run:
```bash
cat dist/manifest.json
```

Expected: Valid MV3 manifest with content_scripts pointing to built JS/CSS files.

**Step 5: Commit**

```bash
git add -A
git commit -m "build: verify new vite-plugin-web-extension build output"
```

---

## Task 7: Test in Browser

**Files:**
- None (manual testing)

**Step 1: Load extension in Chrome**

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the `dist/` folder

Expected: Extension loads without errors.

**Step 2: Navigate to x.com**

1. Open https://x.com/elonmusk
2. Open DevTools Console

**Step 3: Verify content script loaded**

In DevTools Console, look for:
- Extension CSS applied (check for `.xscape-hatch-badge` styles)
- No CSP errors
- Extension debug logs (if debug enabled)

Run in console:
```javascript
document.querySelectorAll('.xscape-hatch-badge').length
```

Expected: Content script is running (may show 0 badges if no Bluesky handles found, but no errors)

**Step 4: Enable debug and verify logs**

Run in console:
```javascript
chrome.storage.local.set({ 'xscape:debug': true })
```

Refresh page. Look for `[Xscape:DOM]` logs in console.

Expected: Debug logs appear showing content script is processing tweets.

---

## Task 8: Run Tests

**Files:**
- None (verification only)

**Step 1: Run unit tests**

Run:
```bash
npm test
```

Expected: All tests pass (tests don't depend on build system, only source code)

**Step 2: Run typecheck**

Run:
```bash
npm run typecheck
```

Expected: No type errors.

**Step 3: Run lint**

Run:
```bash
npm run lint
```

Expected: No lint errors.

---

## Task 9: Update Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update build system section**

In `CLAUDE.md`, update the "Build System" section to reflect the new plugin:

```markdown
## Build System

Uses vite-plugin-web-extension to bundle ES modules for Chrome extension:
- Manifest defined inline in vite.config.ts
- Content scripts bundled directly (no dynamic loader)
- CSS declared in manifest content_scripts.css array
- Offscreen document and workers configured via additionalInputs
- Vitest configured in same vite.config.ts
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for new build system"
```

---

## Task 10: Final Verification and Cleanup

**Step 1: Run full verification suite**

Run:
```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: All pass.

**Step 2: Test extension manually one more time**

1. Reload extension in chrome://extensions
2. Navigate to x.com
3. Verify no errors, content script loads

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete migration to vite-plugin-web-extension"
```

---

## Troubleshooting

### If content script still doesn't load:
1. Check `dist/manifest.json` - verify content_scripts paths are correct
2. Check Chrome DevTools Network tab - verify JS/CSS files load (status 200)
3. Check for CSP errors in console
4. Verify extension has permission for the URL (chrome://extensions > Details > Site access)

### If worker fails:
1. Check built worker path in `dist/`
2. Update `chrome.runtime.getURL()` path in offscreen.ts
3. Verify worker is in `web_accessible_resources` in built manifest

### If tests fail:
1. Tests shouldn't be affected by build system change
2. If import errors, check that source files weren't accidentally modified
