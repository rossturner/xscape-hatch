import * as esbuild from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'fs';

const outdir = 'dist';

// Clean and create output directory
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

// Bundle entry points
await esbuild.build({
  entryPoints: [
    'src/content/content.ts',
    'src/background/service-worker.ts',
    'src/offscreen/offscreen.ts',
    'src/worker/ocr-worker.ts',
  ],
  bundle: true,
  outdir,
  format: 'esm',
  target: 'chrome120',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: process.env.NODE_ENV !== 'production',
});

// Copy static assets
cpSync('manifest.json', `${outdir}/manifest.json`);
cpSync('src/content/styles.css', `${outdir}/styles.css`);
cpSync('src/offscreen/offscreen.html', `${outdir}/offscreen.html`);
cpSync('public/assets', `${outdir}/assets`, { recursive: true });

console.log('Build complete');
