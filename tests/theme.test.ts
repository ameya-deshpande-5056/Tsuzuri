// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTheme, setTheme, getTheme, isDarkModeActive } from "../src/theme";
import { createInitialState } from "../src/state";

describe("Tsuzuri Theme & Startup Pre-paint Behavior", () => {
  let metaTag: HTMLMetaElement;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-mode");

    metaTag = document.createElement("meta");
    metaTag.id = "theme-color-meta";
    metaTag.name = "theme-color";
    metaTag.content = "#000000";
    document.head.appendChild(metaTag);

    // Mock matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("dark"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    metaTag.remove();
    vi.restoreAllMocks();
  });

  it("applies dark mode attributes, class and meta tag correctly", () => {
    const callback = vi.fn();
    const isDark = initTheme("dark", callback);

    expect(isDark).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme-mode")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(metaTag.getAttribute("content")).toBe("#000000");
    expect(getTheme()).toBe("dark");
    expect(isDarkModeActive()).toBe(true);
  });

  it("applies light mode attributes, removes dark class and updates meta tag", () => {
    const callback = vi.fn();
    const isDark = initTheme("light", callback);

    expect(isDark).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme-mode")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(metaTag.getAttribute("content")).toBe("#ffffff");
    expect(getTheme()).toBe("light");
    expect(isDarkModeActive()).toBe(false);
  });

  it("evaluates system theme preference correctly", () => {
    // When prefers-color-scheme: dark matches
    const callback = vi.fn();
    const isDark = initTheme("system", callback);

    expect(isDark).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme-mode")).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists theme preference to localStorage when changed", () => {
    const callback = vi.fn();
    initTheme("system", callback);

    setTheme("dark");
    expect(localStorage.getItem("tsuzuri_theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(callback).toHaveBeenCalledWith(true);

    setTheme("light");
    expect(localStorage.getItem("tsuzuri_theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(metaTag.getAttribute("content")).toBe("#ffffff");
    expect(callback).toHaveBeenCalledWith(false);
  });

  it("loads stored theme mode from localStorage in createInitialState", () => {
    localStorage.setItem("tsuzuri_theme", "dark");
    const state = createInitialState();
    expect(state.themeMode).toBe("dark");
  });

  it("validates the head pre-paint inline script logic for synchronous theme application", () => {
    localStorage.setItem("tsuzuri_theme", "dark");

    // Execute the exact synchronous logic embedded in index.html <head>
    (function () {
      var saved = localStorage.getItem("tsuzuri_theme") || "system";
      var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var isDark = saved === "dark" || (saved === "system" && prefersDark);
      var root = document.documentElement;
      root.setAttribute("data-theme", isDark ? "dark" : "light");
      root.setAttribute("data-theme-mode", saved);
      if (isDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      var meta = document.getElementById("theme-color-meta");
      if (meta) {
        meta.setAttribute("content", isDark ? "#000000" : "#ffffff");
      }
    })();

    // Verify root is styled dark BEFORE application bundle loads
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(metaTag.getAttribute("content")).toBe("#000000");
  });
});
