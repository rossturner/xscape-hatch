#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const bumpType = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error(`Error: Invalid bump type "${bumpType}". Use: patch, minor, or major`);
  process.exit(1);
}

const status = execSync('git status --porcelain').toString();
if (status.trim()) {
  console.error('Error: Working directory not clean. Commit or stash changes first.');
  process.exit(1);
}

try {
  execSync('gh --version', { stdio: 'ignore' });
} catch {
  console.error('Error: gh CLI not found.');
  console.error('Install with: sudo apt install gh');
  console.error('Then authenticate: gh auth login');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const newVersion = {
  major: `${major + 1}.0.0`,
  minor: `${major}.${minor + 1}.0`,
  patch: `${major}.${minor}.${patch + 1}`,
}[bumpType];

console.log(`Bumping version: ${pkg.version} → ${newVersion}`);

console.log('Updating package.json...');
pkg.version = newVersion;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

console.log('Updating manifest.json...');
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.version = newVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

console.log('Building extension...');
execSync('npm run build', { stdio: 'inherit' });

const zipName = `xscape-hatch-v${newVersion}.zip`;
console.log(`Creating ${zipName}...`);
execSync(`cd dist && zip -r ../${zipName} .`, { stdio: 'inherit' });

console.log('Committing version bump...');
execSync('git add package.json manifest.json');
execSync(`git commit -m "chore: release v${newVersion}"`);

console.log(`Creating tag v${newVersion}...`);
execSync(`git tag v${newVersion}`);

console.log('Pushing to origin...');
execSync('git push && git push --tags', { stdio: 'inherit' });

console.log('Creating GitHub Release...');
execSync(`gh release create v${newVersion} ${zipName} --title "v${newVersion}" --generate-notes`, { stdio: 'inherit' });

console.log(`✓ Released v${newVersion}`);
