const CACHE_OVERLAY_ID = "hwcc-speed-cache-overlay";
const CACHE_SPINNER_ID = "hwcc-speed-cache-spinner";
const ACTIVE_BADGE_ID = "hwcc-speed-cache-badge";

(async function boot() {
  showActiveBadge();

  try {
    const url = location.href;
    const cache = await getCachedPage(url);

    if (cache?.html) {
      showCachedOverlay(cache.html);
      showLoadingSpinner();
    }

    const persistCurrentPage = async () => {
      removeCachedOverlay();
      removeLoadingSpinner();

      const snapshot = `<!doctype html>\n${document.documentElement.outerHTML}`;
      await setCachedPage(url, snapshot, document.title);
    };

    if (document.readyState === "complete") {
      await persistCurrentPage();
    } else {
      window.addEventListener(
        "load",
        async () => {
          await persistCurrentPage();
        },
        { once: true }
      );
    }
  } catch (error) {
    console.warn("Huawei cache extension error:", error);
    removeCachedOverlay();
    removeLoadingSpinner();
  }
})();

function showActiveBadge() {
  if (document.getElementById(ACTIVE_BADGE_ID)) {
    return;
  }

  const badge = document.createElement("div");
  badge.id = ACTIVE_BADGE_ID;
  badge.setAttribute("aria-label", "Huawei cache extension is active");
  badge.title = "Huawei cache extension is active";
  badge.textContent = "⚡ Cache";
  badge.style.cssText = [
    "position: fixed",
    "right: 12px",
    "bottom: 12px",
    "z-index: 2147483647",
    "padding: 6px 10px",
    "border-radius: 999px",
    "background: rgba(25, 118, 210, 0.92)",
    "color: #fff",
    "font: 600 11px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    "letter-spacing: 0.02em",
    "box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25)",
    "pointer-events: none",
    "user-select: none"
  ].join(";");

  const mount = () => {
    if (!document.documentElement) {
      requestAnimationFrame(mount);
      return;
    }
    document.documentElement.appendChild(badge);
  };

  mount();
}

function getCachedPage(url) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_PAGE_CACHE", url }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        resolve(null);
        return;
      }
      resolve(response.cache || null);
    });
  });
}

function setCachedPage(url, html, title) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "SET_PAGE_CACHE", url, html, title },
      () => {
        resolve();
      }
    );
  });
}

function showCachedOverlay(html) {
  if (document.getElementById(CACHE_OVERLAY_ID)) {
    return;
  }

  const overlay = document.createElement("iframe");
  overlay.id = CACHE_OVERLAY_ID;
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = [
    "position: fixed",
    "inset: 0",
    "width: 100vw",
    "height: 100vh",
    "z-index: 2147483646",
    "border: 0",
    "background: white",
    "pointer-events: none"
  ].join(";");
  overlay.srcdoc = html;

  const mount = () => {
    if (!document.documentElement) {
      requestAnimationFrame(mount);
      return;
    }
    document.documentElement.appendChild(overlay);
  };

  mount();
}

function removeCachedOverlay() {
  const overlay = document.getElementById(CACHE_OVERLAY_ID);
  if (overlay) {
    overlay.remove();
  }
}

function showLoadingSpinner() {
  if (document.getElementById(CACHE_SPINNER_ID)) {
    return;
  }

  const spinner = document.createElement("div");
  spinner.id = CACHE_SPINNER_ID;
  spinner.setAttribute("aria-label", "Loading latest page");
  spinner.style.cssText = [
    "position: fixed",
    "top: 16px",
    "right: 16px",
    "z-index: 2147483647",
    "width: 32px",
    "height: 32px",
    "border: 4px solid rgba(0, 0, 0, 0.15)",
    "border-top-color: #1976d2",
    "border-radius: 50%",
    "animation: hwcc-spin 0.9s linear infinite",
    "box-sizing: border-box"
  ].join(";");

  const style = document.createElement("style");
  style.textContent = "@keyframes hwcc-spin { to { transform: rotate(360deg); } }";
  style.id = `${CACHE_SPINNER_ID}-style`;

  const mount = () => {
    if (!document.documentElement) {
      requestAnimationFrame(mount);
      return;
    }
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(spinner);
  };

  mount();
}

function removeLoadingSpinner() {
  const spinner = document.getElementById(CACHE_SPINNER_ID);
  const style = document.getElementById(`${CACHE_SPINNER_ID}-style`);

  if (spinner) {
    spinner.remove();
  }
  if (style) {
    style.remove();
  }
}
