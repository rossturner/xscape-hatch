/// <reference lib="webworker" />

import Tesseract from 'tesseract.js';
import type { WorkerIncomingMessage, WorkerOutgoingMessage } from '../types';

let tesseractWorker: Tesseract.Worker | null = null;
const BLUESKY_HANDLE_REGEX = /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi;

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async function (e: MessageEvent<WorkerIncomingMessage>) {
  const message = e.data;

  if (message.type === 'init') {
    await initWorker();
    const response: WorkerOutgoingMessage = { type: 'ready', id: message.id };
    self.postMessage(response);
    return;
  }

  if (message.type === 'process') {
    const handles = await processImage(message.payload.imageUrl);
    const response: WorkerOutgoingMessage = {
      type: 'result',
      id: message.id,
      payload: { imageUrl: message.payload.imageUrl, handles },
    };
    self.postMessage(response);
    return;
  }

  if (message.type === 'terminate') {
    if (tesseractWorker) {
      await tesseractWorker.terminate();
      tesseractWorker = null;
    }
    return;
  }
};

async function initWorker(): Promise<void> {
  if (tesseractWorker) return;
  tesseractWorker = await Tesseract.createWorker('eng');
}

async function processImage(imageUrl: string): Promise<string[]> {
  if (!tesseractWorker) {
    await initWorker();
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return [];

    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const maxWidth = 1500;
    let canvas: OffscreenCanvas;
    if (imageBitmap.width > maxWidth) {
      const scale = maxWidth / imageBitmap.width;
      canvas = new OffscreenCanvas(maxWidth, imageBitmap.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
    } else {
      canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(imageBitmap, 0, 0);
    }

    imageBitmap.close();

    const {
      data: { text },
    } = await tesseractWorker!.recognize(canvas);

    const handles = new Set<string>();
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
