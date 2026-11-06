// One fixed trial window for all administrators; signing in never extends it.
export const ADMIN_DESKTOP_START = Date.parse("2026-11-06T14:41:33Z");
export const ADMIN_DESKTOP_END = Date.parse("2026-11-13T14:41:33Z");

export function isAdminDesktopTrialActive({ authenticated, role, now = Date.now() }) {
  return authenticated && role === "admin" && now >= ADMIN_DESKTOP_START && now < ADMIN_DESKTOP_END;
}

export function installTemporaryDesktopViewport({ authenticated, role, document, window, now = Date.now }) {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport || !authenticated || role !== "admin") return () => {};
  const original = viewport.getAttribute("content");
  let timer;
  function restore() {
    if (original === null) viewport.removeAttribute("content");
    else viewport.setAttribute("content", original);
  }
  function refresh() {
    window.clearTimeout(timer);
    const timestamp = now();
    if (isAdminDesktopTrialActive({ authenticated, role, now: timestamp })) {
      // Omitting initial-scale lets mobile browsers fit the desktop and retain pinch zoom.
      viewport.setAttribute("content", "width=1440");
      timer = window.setTimeout(refresh, ADMIN_DESKTOP_END - timestamp);
    } else {
      restore();
    }
  }
  refresh();
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("pageshow", refresh);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", refresh);
    window.removeEventListener("pageshow", refresh);
    restore();
  };
}
