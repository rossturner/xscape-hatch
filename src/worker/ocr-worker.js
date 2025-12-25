import Tesseract from 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';

let worker = null;
const BLUESKY_HANDLE_REGEX = /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi;

self.onmessage = async function(e) {
  const { type, payload, id } = e.data;

  if (type === 'init') {
    await initWorker();
    self.postMessage({ type: 'ready', id });
    return;
  }

  if (type === 'process') {
    const handles = await processImage(payload.imageUrl);
    self.postMessage({ type: 'result', id, payload: { imageUrl: payload.imageUrl, handles } });
    return;
  }

  if (type === 'terminate') {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    return;
  }
};

async function initWorker() {
  if (worker) return;
  worker = await Tesseract.createWorker('eng');
}

async function processImage(imageUrl) {
  if (!worker) {
    await initWorker();
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return [];

    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const maxWidth = 1500;
    let canvas;
    if (imageBitmap.width > maxWidth) {
      const scale = maxWidth / imageBitmap.width;
      canvas = new OffscreenCanvas(maxWidth, imageBitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
    } else {
      canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageBitmap, 0, 0);
    }

    imageBitmap.close();

    const { data: { text } } = await worker.recognize(canvas);

    const handles = new Set();
    const matches = text.matchAll(BLUESKY_HANDLE_REGEX);
    for (const match of matches) {
      handles.add(match[1].toLowerCase());
    }

    return Array.from(handles);
  } catch (error) {
    console.error('OCR error:', error);
    return [];
  }
}
