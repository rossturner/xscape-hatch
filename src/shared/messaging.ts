export function sendToBackground<T, R>(type: string, payload: T): Promise<R> {
  return chrome.runtime.sendMessage({ type, payload });
}

export function onMessage(
  callback: (
    message: { type: string; payload: unknown },
    sender: chrome.runtime.MessageSender
  ) => Promise<unknown> | void
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = callback(message, sender);
    if (result instanceof Promise) {
      result.then(sendResponse);
      return true;
    }
    return false;
  });
}
