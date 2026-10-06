import { ThemeMode } from "./state";

let currentMode: ThemeMode = "system";
let changeCallback: ((isDark: boolean) => void) | null = null;

const mediaQuery = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

function updateDocumentTheme(): boolean {
  let isDark = false;
  if (currentMode === "dark") {
    isDark = true;
  } else if (currentMode === "light") {
    isDark = false;
  } else {
    isDark = mediaQuery ? mediaQuery.matches : false;
  }

  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme-mode", currentMode);

  if (changeCallback) {
    changeCallback(isDark);
  }

  return isDark;
}

export function initTheme(initialMode: ThemeMode, onChange: (isDark: boolean) => void): boolean {
  currentMode = initialMode;
  changeCallback = onChange;

  if (mediaQuery) {
    mediaQuery.addEventListener("change", () => {
      if (currentMode === "system") {
        updateDocumentTheme();
      }
    });
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
  return mediaQuery ? mediaQuery.matches : false;
}

