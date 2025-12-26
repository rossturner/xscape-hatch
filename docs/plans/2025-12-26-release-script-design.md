# Release Script Design

## Overview

Script-assisted releases via `npm run release` that bumps version, builds, creates zip, tags, and publishes to GitHub Releases.

## Usage

```bash
npm run release        # patch: 1.0.0 → 1.0.1
npm run release minor  # minor: 1.0.0 → 1.1.0
npm run release major  # major: 1.0.0 → 2.0.0
```

## Script Flow

1. Check git working directory is clean (exit if dirty)
2. Check `gh` CLI is available (exit with install instructions if missing)
3. Calculate new version based on argument (default: patch)
4. Update version in `package.json` and `manifest.json`
5. Run `npm run build`
6. Create `xscape-hatch-v{version}.zip` from `dist/`
7. Commit: `chore: release v{version}`
8. Create tag: `v{version}`
9. Push commit and tag to origin
10. Create GitHub Release with zip attached via `gh release create`

## File Changes

- New: `scripts/release.mjs`
- Edit: `package.json` (add `release` script)
- Edit: `.gitignore` (add `xscape-hatch-*.zip`)

## Error Handling

**Dirty working directory:**
```
Error: Working directory not clean. Commit or stash changes first.
```

**gh CLI missing:**
```
Error: gh CLI not found.
Install with: sudo apt install gh
Then authenticate: gh auth login
```

## Console Output

```
$ npm run release
Bumping version: 1.0.0 → 1.0.1
Updating package.json...
Updating manifest.json...
Building extension...
Creating xscape-hatch-v1.0.1.zip...
Committing version bump...
Creating tag v1.0.1...
Pushing to origin...
Creating GitHub Release...
✓ Released v1.0.1
  https://github.com/rossturner/xscape-hatch/releases/tag/v1.0.1
```

## Dependencies

- Node.js built-ins only (no new npm dependencies)
- External: `git`, `gh` CLI, `zip` command
