const CACHE_OVERLAY_ID = "hwcc-speed-cache-overlay";
const CACHE_SPINNER_ID = "hwcc-speed-cache-spinner";
const ACTIVE_BADGE_ID = "hwcc-speed-cache-badge";
const EXTENSION_OWNED_ATTR = "data-hwcc-owned";

const BADGE_STATES = {
  checking: { label: "Checking cache", background: "rgba(97, 97, 97, 0.94)" },
  cacheHit: { label: "Cache hit", background: "rgba(56, 142, 60, 0.94)" },
  cacheMiss: { label: "Cache miss", background: "rgba(245, 124, 0, 0.95)" },
  loadingLive: { label: "Loading live page", background: "rgba(25, 118, 210, 0.92)" },
  caching: { label: "Caching latest page", background: "rgba(123, 31, 162, 0.94)" },
  cached: { label: "Cache updated", background: "rgba(0, 121, 107, 0.94)" },
  error: { label: "Cache error", background: "rgba(211, 47, 47, 0.95)" }
};

const pageRequestTracker = installPageRequestTracker();

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

      await waitForPageToSettle();

      removeCachedOverlay();
      removeLoadingSpinner();

      const snapshot = buildSnapshotHtml();
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
  await waitForDocumentReadyComplete();
  await waitForPendingRequestsToDrain(pageRequestTracker);
  await waitForImagesToFinish();
  await waitForFontsToLoad();
  await waitForDomToSettle();
  await waitForTwoFrames();
}

function installPageRequestTracker() {
  let pendingRequests = 0;
  const waiters = new Set();

  const notifyIfIdle = () => {
    if (pendingRequests !== 0) {
      return;
    }

    for (const resolve of waiters) {
      resolve();
    }
    waiters.clear();
  };

  const startRequest = () => {
    pendingRequests += 1;
  };

  const finishRequest = () => {
    pendingRequests = Math.max(0, pendingRequests - 1);
    notifyIfIdle();
  };

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      startRequest();
      return originalFetch(...args).finally(finishRequest);
    };
  }

  if (typeof XMLHttpRequest === "function") {
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      startRequest();
      this.addEventListener("loadend", finishRequest, { once: true });
      return originalSend.apply(this, args);
    };
  }

  return {
    isIdle() {
      return pendingRequests === 0;
    },
    waitUntilIdle() {
      if (pendingRequests === 0) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        waiters.add(resolve);
      });
    }
  };
}

async function waitForDocumentReadyComplete() {
  if (document.readyState === "complete") {
    return;
  }

  await new Promise((resolve) => {
    window.addEventListener("load", resolve, { once: true });
  });
}

async function waitForPendingRequestsToDrain(requestTracker) {
  await requestTracker.waitUntilIdle();
}

async function waitForDomToSettle() {
  if (typeof MutationObserver !== "function") {
    return;
  }

  await new Promise((resolve) => {
    let hasMutation = false;
    let quietFrames = 0;

    let observer = null;
    try {
      observer = new MutationObserver((mutations) => {
        const hasMeaningfulChange = mutations.some(
          (mutation) =>
            mutation.type === "childList" ||
            (mutation.type === "attributes" && mutation.attributeName !== "aria-busy") ||
            mutation.type === "characterData"
        );

        if (hasMeaningfulChange) {
          hasMutation = true;
          quietFrames = 0;
        }
      });

      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
      });
    } catch {
      observer = null;
    }

    const checkFrame = () => {
      if (hasMutation) {
        hasMutation = false;
        quietFrames = 0;
      } else {
        quietFrames += 1;
      }

      const stable = quietFrames >= 2;
      if (stable && pageRequestTracker.isIdle()) {
        observer?.disconnect();
        resolve();
        return;
      }

      requestAnimationFrame(checkFrame);
    };

    requestAnimationFrame(checkFrame);
  });
}

async function waitForFontsToLoad() {
  if (!document.fonts?.ready) {
    return;
  }

  await document.fonts.ready.catch(() => {});
}

async function waitForImagesToFinish() {
  const trackedImages = Array.from(document.images).filter((img) => !img.complete || !img.currentSrc);
  if (trackedImages.length === 0) {
    return;
  }

  await Promise.allSettled(
    trackedImages.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }

          const onDone = () => {
            img.removeEventListener("load", onDone);
            img.removeEventListener("error", onDone);
            resolve();
          };

          img.addEventListener("load", onDone, { once: true });
          img.addEventListener("error", onDone, { once: true });
        })
    )
  );
}

function waitForTwoFrames() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function showActiveBadge() {
  if (document.getElementById(ACTIVE_BADGE_ID)) {
    return;
  }

  const badge = document.createElement("div");
  badge.id = ACTIVE_BADGE_ID;
  badge.setAttribute(EXTENSION_OWNED_ATTR, "true");
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
  overlay.setAttribute(EXTENSION_OWNED_ATTR, "true");
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
  spinner.setAttribute(EXTENSION_OWNED_ATTR, "true");
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
  style.setAttribute(EXTENSION_OWNED_ATTR, "true");

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

function buildSnapshotHtml() {
  const snapshotRoot = document.documentElement.cloneNode(true);
  const ownedElements = snapshotRoot.querySelectorAll(`[${EXTENSION_OWNED_ATTR}="true"]`);
  ownedElements.forEach((node) => node.remove());

  return `<!doctype html>\n${snapshotRoot.outerHTML}`;
}
