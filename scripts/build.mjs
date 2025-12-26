import * as esbuild from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'fs';

const outdir = 'dist';

// Clean and create output directory
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
mkdirSync(`${outdir}/tesseract`, { recursive: true });

// Bundle entry points
await esbuild.build({
  entryPoints: [
    'src/content/content.ts',
    'src/content/debug-page.ts',
    'src/background/service-worker.ts',
    'src/offscreen/offscreen.ts',
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

// Copy Tesseract.js worker files for local loading
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${outdir}/tesseract/worker.min.js`);
cpSync('node_modules/tesseract.js-core/tesseract-core-simd.wasm.js', `${outdir}/tesseract/tesseract-core-simd.wasm.js`);

console.log('Build complete');
