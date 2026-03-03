const STORAGE_NAMESPACE = "pageCache:";
const MAX_CACHE_AGE_MS = 1000 * 60 * 30; // 30 minutes
const MAX_ENTRIES = 50;

function keyForUrl(url) {
  return `${STORAGE_NAMESPACE}${url}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "GET_PAGE_CACHE") {
    (async () => {
      try {
        const key = keyForUrl(message.url);
        const record = (await chrome.storage.local.get(key))[key];

        if (!record) {
          sendResponse({ ok: true, cache: null });
          return;
        }

        const isExpired = Date.now() - record.timestamp > MAX_CACHE_AGE_MS;
        if (isExpired) {
          await chrome.storage.local.remove(key);
          sendResponse({ ok: true, cache: null });
          return;
        }

        sendResponse({ ok: true, cache: record });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();

    return true;
  }

  if (message.type === "SET_PAGE_CACHE") {
    (async () => {
      try {
        const key = keyForUrl(message.url);
        await chrome.storage.local.set({
          [key]: {
            html: message.html,
            timestamp: Date.now(),
            title: message.title || ""
          }
        });

        await cleanupOldEntries();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();

    return true;
  }

  return false;
});

async function cleanupOldEntries() {
  const allStorage = await chrome.storage.local.get(null);
  const cacheEntries = Object.entries(allStorage)
    .filter(([key]) => key.startsWith(STORAGE_NAMESPACE))
    .map(([key, value]) => ({ key, timestamp: value?.timestamp || 0 }))
    .sort((a, b) => b.timestamp - a.timestamp);

  const keysToDelete = [];

  for (const entry of cacheEntries) {
    const isExpired = Date.now() - entry.timestamp > MAX_CACHE_AGE_MS;
    if (isExpired) {
      keysToDelete.push(entry.key);
    }
  }

  if (cacheEntries.length > MAX_ENTRIES) {
    const overflow = cacheEntries.slice(MAX_ENTRIES);
    keysToDelete.push(...overflow.map((entry) => entry.key));
  }

  if (keysToDelete.length > 0) {
    await chrome.storage.local.remove([...new Set(keysToDelete)]);
  }
}
