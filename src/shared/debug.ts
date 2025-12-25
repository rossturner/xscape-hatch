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

export function exposeDebugGlobal(): void {
  const globalObj = typeof window !== 'undefined' ? window : globalThis;
  (globalObj as Record<string, unknown>).xscapeDebug = (enabled?: boolean) => {
    if (enabled === undefined) {
      console.log(`[Xscape] Debug is ${debugEnabled ? 'ON' : 'OFF'}`);
      return debugEnabled;
    }
    setDebugEnabled(enabled);
    console.log(`[Xscape] Debug ${enabled ? 'enabled' : 'disabled'}`);
    return enabled;
  };
}
