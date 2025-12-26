type DebugCategory = 'DOM' | 'OCR' | 'API' | 'CACHE' | 'BADGE' | 'MSG';

const STORAGE_KEY = 'xscape:debug';
let debugEnabled = false;

export async function initDebug(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  debugEnabled = result[STORAGE_KEY] === true;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      debugEnabled = changes[STORAGE_KEY].newValue === true;
      log('MSG', `Debug ${debugEnabled ? 'enabled' : 'disabled'}`);
    }
  });
}

export function log(category: DebugCategory, message: string, ...data: unknown[]): void {
  if (!debugEnabled) return;
  const prefix = `[Xscape:${category}]`;
  if (data.length > 0) {
    console.log(prefix, message, ...data);
  } else {
    console.log(prefix, message);
  }
}

export function isDebugEnabled(): boolean {
  return debugEnabled;
}

export async function setDebugEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: enabled });
}

export async function clearAllCaches(): Promise<number> {
  const prefixes = ['xscape:api:', 'xscape:ocr:', 'xscape:mapping:'];
  const all = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter(key =>
    prefixes.some(prefix => key.startsWith(prefix))
  );
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
  return keysToRemove.length;
}

export function exposeDebugGlobal(): void {
  if (typeof document === 'undefined') return;

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/debug-page.js');
  script.type = 'module';
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  document.addEventListener('xscape-debug-set', ((event: CustomEvent) => {
    setDebugEnabled(event.detail === true);
  }) as EventListener);

  document.addEventListener('xscape-debug-query', () => {
    console.log(`[Xscape] Debug is ${debugEnabled ? 'ON' : 'OFF'}`);
  });

  document.addEventListener('xscape-clear-caches', async () => {
    const count = await clearAllCaches();
    document.dispatchEvent(new CustomEvent('xscape-caches-cleared', { detail: count }));
  });
}
