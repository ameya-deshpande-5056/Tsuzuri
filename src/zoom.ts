export const MIN_ZOOM = 0.6; // 60%
export const MAX_ZOOM = 2.4; // 240%
export const DEFAULT_ZOOM = 1.0; // 100%
export const ZOOM_STEP = 0.1; // 10%
export const ZOOM_STORAGE_KEY = "tsuzuri_zoom";

let currentZoom: number = DEFAULT_ZOOM;
let zoomChangeListeners: Array<(zoom: number) => void> = [];

export function clampZoom(val: number): number {
  const rounded = Math.round(val * 10) / 10;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rounded));
}

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export function getZoom(): number {
  return currentZoom;
}

function applyScaleToElement(element: HTMLElement | null, zoom: number): void {
  if (!element) return;

  element.style.removeProperty("zoom");
  element.style.transform = `scale(${zoom})`;
  element.style.transformOrigin = "top left";
  element.style.width = `${100 / zoom}%`;
  element.style.height = `${100 / zoom}%`;
}

export function applyZoomToDom(zoom: number): void {
  currentZoom = clampZoom(zoom);
  if (typeof document !== "undefined") {
    // Keep document root strictly at 100% width and height so the app chrome (header, buttons, drawers, modals)
    // is never distorted, pushed off-screen, or given artificial horizontal overflow.
    if (document.documentElement) {
      document.documentElement.style.removeProperty("zoom");
      document.documentElement.style.width = "100%";
      document.documentElement.style.height = "100%";
      document.documentElement.style.setProperty("--app-zoom", String(currentZoom));
    }
    if (document.body) {
      document.body.style.width = "100%";
      document.body.style.height = "100%";
    }

    // Apply zoom as a transform instead of CSS zoom, which is not consistently implemented
    // across Chromium-based WebViews (notably Android/Tauri production builds).
    const viewPanes = document.querySelectorAll<HTMLElement>(".view-pane");
    viewPanes.forEach((pane) => {
      applyScaleToElement(pane, currentZoom);
    });

    const tocList = document.getElementById("toc-list");
    if (tocList) {
      applyScaleToElement(tocList, currentZoom);
    }
    const tocHeading = document.querySelector<HTMLElement>(".toc-heading");
    if (tocHeading) {
      applyScaleToElement(tocHeading, currentZoom);
    }

    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(currentZoom));
    } catch {
      // Ignore storage write error in sandboxed environments
    }
  }
  for (const listener of zoomChangeListeners) {
    try {
      listener(currentZoom);
    } catch (e) {
      console.error("Zoom change listener error:", e);
    }
  }
}

export function setZoom(level: number): number {
  applyZoomToDom(level);
  return currentZoom;
}

export function zoomIn(): number {
  return setZoom(currentZoom + ZOOM_STEP);
}

export function zoomOut(): number {
  return setZoom(currentZoom - ZOOM_STEP);
}

export function resetZoom(): number {
  return setZoom(DEFAULT_ZOOM);
}

export function onZoomChange(listener: (zoom: number) => void): () => void {
  zoomChangeListeners.push(listener);
  return () => {
    zoomChangeListeners = zoomChangeListeners.filter((l) => l !== listener);
  };
}

export function initZoom(listener?: (zoom: number) => void): number {
  if (listener) {
    zoomChangeListeners.push(listener);
  }
  let initial = DEFAULT_ZOOM;
  try {
    const saved = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= MIN_ZOOM && parsed <= MAX_ZOOM) {
        initial = parsed;
      }
    }
  } catch {}

  applyZoomToDom(initial);
  return currentZoom;
}
