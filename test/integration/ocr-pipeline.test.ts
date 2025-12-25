/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import Tesseract from 'tesseract.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const BLUESKY_HANDLE_REGEX = /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi;

function extractHandlesFromText(text: string): string[] {
  const handles = new Set<string>();
  const matches = text.matchAll(BLUESKY_HANDLE_REGEX);
  for (const match of matches) {
    handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
}

describe('OCR Pipeline Integration', () => {
  const TEST_CASES = [
    { file: 'G894uCFb0AA1cqD.jpg', expected: ['momoameo.bsky.social'] },
    { file: 'G8_tqvob0AIuUUD.jpg', expected: ['tanishiii.bsky.social'] },
    { file: 'G9Axyuhb0AA66Px.jpg', expected: ['sasa-ekakiman.bsky.social'] },
    { file: 'GF68_dwawAAi43w.jpg', expected: ['yeni1871.bsky.social'] },
  ];

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const imagesDir = path.resolve(__dirname, '../../example_images');

  it.each(TEST_CASES)(
    'extracts handle from $file',
    { timeout: 30000 },
    async ({ file, expected }) => {
      const imagePath = path.join(imagesDir, file);

      if (!fs.existsSync(imagePath)) {
        console.warn(`Skipping test: ${imagePath} not found`);
        return;
      }

      const worker = await Tesseract.createWorker('eng');
      const {
        data: { text },
      } = await worker.recognize(imagePath);
      await worker.terminate();

      const handles = extractHandlesFromText(text);

      for (const handle of expected) {
        expect(handles).toContain(handle);
      }
    }
  );
});
