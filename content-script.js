const CACHE_OVERLAY_ID = "hwcc-speed-cache-overlay";
const CACHE_SPINNER_ID = "hwcc-speed-cache-spinner";
const ACTIVE_BADGE_ID = "hwcc-speed-cache-badge";
const PAGE_SETTLE_WINDOW_MS = 1200;
const PAGE_SETTLE_TIMEOUT_MS = 15000;
const IMAGE_WAIT_TIMEOUT_MS = 10000;

const BADGE_STATES = {
  checking: { label: "Checking cache", background: "rgba(97, 97, 97, 0.94)" },
  cacheHit: { label: "Cache hit", background: "rgba(56, 142, 60, 0.94)" },
  cacheMiss: { label: "Cache miss", background: "rgba(245, 124, 0, 0.95)" },
  loadingLive: { label: "Loading live page", background: "rgba(25, 118, 210, 0.92)" },
  caching: { label: "Caching latest page", background: "rgba(123, 31, 162, 0.94)" },
  cached: { label: "Cache updated", background: "rgba(0, 121, 107, 0.94)" },
  error: { label: "Cache error", background: "rgba(211, 47, 47, 0.95)" }
};

(async function boot() {
  showActiveBadge();

  try {
    const url = location.href;
    setBadgeState("checking");
    const cache = await getCachedPage(url);

    if (cache?.html) {
      setBadgeState("cacheHit");
      showCachedOverlay(cache.html);
      showLoadingSpinner();
      setBadgeState("loadingLive");
    } else {
      setBadgeState("cacheMiss");
      setBadgeState("loadingLive");
    }

    const persistCurrentPage = async () => {
      setBadgeState("caching");
      removeCachedOverlay();
      removeLoadingSpinner();

      await waitForPageToSettle();

      const snapshot = `<!doctype html>\n${document.documentElement.outerHTML}`;
      await setCachedPage(url, snapshot, document.title);
      setBadgeState("cached");
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
    setBadgeState("error", String(error));
    removeCachedOverlay();
    removeLoadingSpinner();
  }
})();

async function waitForPageToSettle() {
  await Promise.all([
    waitForNetworkQuiet(PAGE_SETTLE_WINDOW_MS, PAGE_SETTLE_TIMEOUT_MS),
    waitForImagesToFinish(IMAGE_WAIT_TIMEOUT_MS)
  ]);

  await waitForTwoFrames();
}

async function waitForNetworkQuiet(quietWindowMs, maxWaitMs) {
  if (typeof PerformanceObserver !== "function") {
    await delay(quietWindowMs);
    return;
  }

  await new Promise((resolve) => {
    let settled = false;
    let quietTimer = null;
    let timeoutTimer = null;

    const cleanup = (observer) => {
      if (settled) {
        return;
      }

      settled = true;
      if (quietTimer) {
        clearTimeout(quietTimer);
      }
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      observer?.disconnect();
      resolve();
    };

    const markActivity = () => {
      if (settled) {
        return;
      }

      if (quietTimer) {
        clearTimeout(quietTimer);
      }

      quietTimer = setTimeout(() => cleanup(observer), quietWindowMs);
    };

    let observer = null;

    try {
      observer = new PerformanceObserver((list) => {
        const hasResourceEntry = list
          .getEntries()
          .some((entry) => entry.entryType === "resource");

        if (hasResourceEntry) {
          markActivity();
        }
      });
      observer.observe({ entryTypes: ["resource"] });
    } catch {
      observer = null;
    }

    timeoutTimer = setTimeout(() => cleanup(observer), maxWaitMs);
    markActivity();
  });
}

async function waitForImagesToFinish(maxWaitMs) {
  const pendingImages = Array.from(document.images).filter((img) => !img.complete);
  if (pendingImages.length === 0) {
    return;
  }

  await Promise.race([
    Promise.allSettled(
      pendingImages.map(
        (img) =>
          new Promise((resolve) => {
            const onDone = () => {
              img.removeEventListener("load", onDone);
              img.removeEventListener("error", onDone);
              resolve();
            };

            img.addEventListener("load", onDone, { once: true });
            img.addEventListener("error", onDone, { once: true });
          })
      )
    ),
    delay(maxWaitMs)
  ]);
}

function waitForTwoFrames() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function showActiveBadge() {
  if (document.getElementById(ACTIVE_BADGE_ID)) {
    return;
  }

  const badge = document.createElement("div");
  badge.id = ACTIVE_BADGE_ID;
  badge.setAttribute("aria-live", "polite");
  badge.setAttribute("aria-atomic", "true");
  badge.setAttribute("aria-label", "Huawei cache extension status");
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
    setBadgeState("checking");
  };

  mount();
}

function setBadgeState(state, detail = "") {
  const badge = document.getElementById(ACTIVE_BADGE_ID);
  if (!badge) {
    return;
  }

  const stateMeta = BADGE_STATES[state] || BADGE_STATES.checking;
  const suffix = detail ? ` (${detail})` : "";
  const text = `⚡ Cache · ${stateMeta.label}`;

  badge.textContent = text;
  badge.style.background = stateMeta.background;
  badge.title = `${stateMeta.label}${suffix}`;
  badge.setAttribute("aria-label", `Huawei cache status: ${stateMeta.label}${suffix}`);
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
