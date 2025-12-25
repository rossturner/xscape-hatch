declare global {
  interface Window {
    xscapeDebug: (enabled?: boolean) => boolean | void;
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

console.log('[Xscape] Debug toggle available: xscapeDebug(true) or xscapeDebug(false)');

export {};
