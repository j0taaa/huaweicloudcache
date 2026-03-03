# Huawei Cloud Console Speed Cache (Chrome Extension)

This extension makes the Huawei Cloud Console feel faster by:

1. Saving a fully loaded page snapshot by URL.
2. Showing that cached snapshot instantly on the next visit to the same URL.
3. Displaying a spinner in the top-right corner while the real page loads in the background.
4. Replacing the cached snapshot with the real page once loading is complete.

## How it works

- A content script runs at `document_start` on Huawei Cloud console domains.
- It requests cached HTML for the current URL from the extension service worker.
- If present, the HTML is rendered in a full-screen iframe overlay.
- A spinning indicator is shown in the top-right corner.
- When the real page fires the `load` event, the overlay/spinner are removed.
- The freshly loaded page is serialized and saved back into cache.

## Cache policy

- Cached entries expire after 30 minutes.
- Maximum 50 URLs are retained.
- Old/expired entries are automatically removed.

## Install locally in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder (`huaweicloudcache`).

## Notes

- This tool optimizes perceived speed, not actual network/backend response times.
- Some pages with strict security headers may limit rendering fidelity inside `iframe srcdoc`.
