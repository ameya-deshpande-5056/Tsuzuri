import { ThemeMode } from "./state";

let currentMode: ThemeMode = "system";
let changeCallback: ((isDark: boolean) => void) | null = null;

let mediaQuery: MediaQueryList | null = null;
let mediaQueryListenerAttached = false;

function ensureMediaQuery(): MediaQueryList | null {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  }
  return mediaQuery;
}

function updateDocumentTheme(): boolean {
  let isDark = false;
  if (currentMode === "dark") {
    isDark = true;
  } else if (currentMode === "light") {
    isDark = false;
  } else {
    const mq = ensureMediaQuery();
    isDark = mq ? mq.matches : false;
  }

  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme-mode", currentMode);
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  const metaThemeColor = document.getElementById("theme-color-meta");
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", isDark ? "#000000" : "#ffffff");
  }

  if (changeCallback) {
    changeCallback(isDark);
  }

  return isDark;
}

export function initTheme(initialMode: ThemeMode, onChange: (isDark: boolean) => void): boolean {
  currentMode = initialMode;
  changeCallback = onChange;

  const mq = ensureMediaQuery();
  if (mq && !mediaQueryListenerAttached && typeof mq.addEventListener === "function") {
    mq.addEventListener("change", () => {
      if (currentMode === "system") {
        updateDocumentTheme();
      }
    });
    mediaQueryListenerAttached = true;
  }

  return updateDocumentTheme();
}

export function setTheme(mode: ThemeMode): boolean {
  currentMode = mode;
  localStorage.setItem("tsuzuri_theme", mode);
  return updateDocumentTheme();
}

export function getTheme(): ThemeMode {
  return currentMode;
}

export function isDarkModeActive(): boolean {
  if (currentMode === "dark") return true;
  if (currentMode === "light") return false;
  const mq = ensureMediaQuery();
  return mq ? mq.matches : false;
}

