declare global {
  interface Window {
    xscapeDebug: (enabled?: boolean) => boolean | void;
    xscapeClearCaches: () => void;
  }
}

window.xscapeDebug = function(enabled?: boolean): boolean | void {
  if (enabled === undefined) {
    document.dispatchEvent(new CustomEvent('xscape-debug-query'));
    return;
  }
  document.dispatchEvent(new CustomEvent('xscape-debug-set', { detail: enabled }));
  console.log(`[Xscape] Debug ${enabled ? 'enabled' : 'disabled'}`);
  return enabled;
};

window.xscapeClearCaches = function(): void {
  const handler = ((event: CustomEvent) => {
    console.log(`[Xscape] Cleared ${event.detail} cache entries`);
    document.removeEventListener('xscape-caches-cleared', handler as EventListener);
  }) as EventListener;
  document.addEventListener('xscape-caches-cleared', handler);
  document.dispatchEvent(new CustomEvent('xscape-clear-caches'));
};

export {};
