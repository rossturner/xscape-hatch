X has **light (“Default”)** plus **two dark variants (“Dim” and “Lights out”)** in its Display settings. ([Beebom][1])
So the trick isn’t “find the theme name” (good luck) — it’s “make your injected UI automatically match whatever the user picked”.

## Don’t “detect theme” unless you absolutely have to

If your injected link/badge:

* inherits font + text color,
* uses an accent color sampled from nearby X links,
* keeps backgrounds mostly transparent,

…then it’ll look fine in Default/Dim/Lights out without you caring which one it is.

### Minimal styling that just blends in

* `font: inherit;`
* `color: inherit;` (or use sampled accent)
* no hardcoded backgrounds
* SVG icons use `fill: currentColor;`

That alone solves ~80% of “theme support”.

---

## If you *do* need theme-aware styling (e.g., pill backgrounds, borders)

### 1) Sample real colors from the live DOM (works with X’s own theme + accent settings)

Pick an anchor element close to where you’ll inject (e.g., the display name row), then:

* **Foreground**: `getComputedStyle(anchor).color`
* **Background**: walk up to a stable container (tweet card / main column) and take `background-color`
* **Accent**: grab the computed `color` of an existing X link inside the same tweet (timestamp link is usually a good candidate)

Why not `prefers-color-scheme`? Because it reflects OS/browser preference, not necessarily the site’s own setting. ([MDN Web Docs][2])

```js
function sampleColors(anchorEl) {
  const fg = getComputedStyle(anchorEl).color;

  const bgEl =
    anchorEl.closest('article') ||
    anchorEl.closest('[role="main"]') ||
    document.body;
  const bg = getComputedStyle(bgEl).backgroundColor;

  // accent: steal it from an actual link in the same card if possible
  const link = bgEl.querySelector('a[href*="/status/"], a[href*="/i/status/"]') || bgEl.querySelector('a');
  const accent = link ? getComputedStyle(link).color : fg;

  return { fg, bg, accent };
}
```

### 2) Classify the background (optional) into light / dim / lights-out

You don’t need exact RGBs — just compute luminance.

```js
function rgbToLuma(rgb) {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return 1;
  const [r,g,b] = [m[1],m[2],m[3]].map(Number).map(v => v/255);
  const lin = v => (v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4);
  return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
}

function classifyTheme(bgRgb) {
  const l = rgbToLuma(bgRgb);
  if (l < 0.03) return 'lights-out';
  if (l < 0.20) return 'dim';
  return 'light';
}
```

Then you can tweak things like border opacity or pill background alpha based on that.

### 3) Push sampled colors into CSS variables on your injected element

This keeps your CSS clean and makes re-theming painless.

```js
function applyThemeVars(el, { fg, bg, accent }) {
  el.style.setProperty('--xh-fg', fg);
  el.style.setProperty('--xh-bg', bg);
  el.style.setProperty('--xh-accent', accent);
}
```

```css
.xh-wrap {
  font: inherit;
  color: var(--xh-fg);
}

.xh-link {
  color: var(--xh-accent);
  text-decoration: none;
}
.xh-link:hover { text-decoration: underline; }

.xh-pill {
  margin-left: 6px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 0.15); /* you can override per theme classification */
  background: rgb(0 0 0 / 0.0); /* default transparent */
}
```

If you inject any real controls (inputs etc.), set `color-scheme` so the browser renders native UI appropriately in light/dark. ([MDN Web Docs][3])

---

## Handling theme changes live (because X is an SPA)

Theme toggles often update root attributes / classes / inline styles / CSS variables. So:

### 1) Watch the root for attribute changes

```js
function watchThemeChanges(onChange) {
  const root = document.documentElement;
  const obs = new MutationObserver(() => onChange());
  obs.observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
  return () => obs.disconnect();
}
```

### 2) When it fires, just resample + reapply on your injected nodes

Don’t try to be clever. Be boring and correct:

* keep a Set of your injected elements
* on theme change: for each, resample based on its nearest anchor, reapply vars

### 3) Also treat “card re-rendered” as “theme might have changed”

You’re already using `MutationObserver` for tweet cards. Whenever you (re)inject, call `sampleColors()` again.

(And yes, `MutationObserver` literally gives you `addedNodes` for new content, so you can rescan only what appeared. ([MDN Web Docs][4]))

---

## Practical recommendation for your specific UI (a Bluesky handle link next to the name)

* Make the link **look like a native X link** by sampling `accent` from an existing link in the same tweet.
* Keep your badge background **transparent** or very low alpha; on Lights out (near-black), heavy translucent backgrounds look gross fast.
* Store **no hardcoded “dark mode colors”** — you’ll lose that fight.

If you want, paste a screenshot of where exactly you’re injecting (name row on tweet vs profile header), and I’ll give you a robust “find anchor + sample accent” strategy that won’t randomly start coloring your link lime green.

[1]: https://beebom.com/how-turn-on-dark-mode-twitter-x/?utm_source=chatgpt.com "How to Turn On Dark Mode on Twitter/X - Beebom"
[2]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-color-scheme?utm_source=chatgpt.com "prefers-color-scheme - CSS | MDN"
[3]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme?utm_source=chatgpt.com "color-scheme - CSS | MDN - MDN Web Docs"
[4]: https://developer.mozilla.org/en-US/docs/Web/API/MutationRecord/addedNodes?utm_source=chatgpt.com "MutationRecord: addedNodes property - Web APIs | MDN"
