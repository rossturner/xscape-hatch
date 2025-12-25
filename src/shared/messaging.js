export function sendToBackground(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

export function onMessage(callback) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = callback(message, sender);
    if (result instanceof Promise) {
      result.then(sendResponse);
      return true;
    }
    return false;
  });
}
