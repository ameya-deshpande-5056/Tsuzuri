// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clampZoom,
  formatZoom,
  getZoom,
  setZoom,
  zoomIn,
  zoomOut,
  resetZoom,
  initZoom,
  onZoomChange,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  ZOOM_STEP,
  ZOOM_STORAGE_KEY,
} from "../src/zoom";

describe("Zoom Management System", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.zoom = "";
  });

  it("clamps zoom within bounds [MIN_ZOOM, MAX_ZOOM] and rounds to 1 decimal place", () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(3.5)).toBe(MAX_ZOOM);
    expect(clampZoom(1.234)).toBe(1.2);
    expect(clampZoom(1.26)).toBe(1.3);
    expect(clampZoom(1.0)).toBe(1.0);
    expect(ZOOM_STEP).toBe(0.1);
  });

  it("formats zoom level cleanly as percentage string", () => {
    expect(formatZoom(1.0)).toBe("100%");
    expect(formatZoom(1.2)).toBe("120%");
    expect(formatZoom(0.7)).toBe("70%");
    expect(formatZoom(2.0)).toBe("200%");
  });

  it("sets zoom and applies style to document.documentElement and persists to localStorage", () => {
    const val = setZoom(1.3);
    expect(val).toBe(1.3);
    expect(getZoom()).toBe(1.3);
    expect(document.documentElement.style.zoom).toBe("1.3");
    expect(localStorage.getItem(ZOOM_STORAGE_KEY)).toBe("1.3");
  });

  it("steps zoom in by ZOOM_STEP and clamps at MAX_ZOOM", () => {
    resetZoom();
    expect(getZoom()).toBe(DEFAULT_ZOOM);

    zoomIn();
    expect(getZoom()).toBe(1.1);

    zoomIn();
    expect(getZoom()).toBe(1.2);

    setZoom(MAX_ZOOM);
    zoomIn();
    expect(getZoom()).toBe(MAX_ZOOM);
  });

  it("steps zoom out by ZOOM_STEP and clamps at MIN_ZOOM", () => {
    resetZoom();
    zoomOut();
    expect(getZoom()).toBe(0.9);

    setZoom(MIN_ZOOM);
    zoomOut();
    expect(getZoom()).toBe(MIN_ZOOM);
  });

  it("resets zoom back to DEFAULT_ZOOM (1.0)", () => {
    setZoom(1.8);
    expect(getZoom()).toBe(1.8);

    resetZoom();
    expect(getZoom()).toBe(DEFAULT_ZOOM);
    expect(document.documentElement.style.zoom).toBe("1");
  });

  it("notifies registered change listeners when zoom changes", () => {
    const listener = vi.fn();
    const unsubscribe = onZoomChange(listener);

    setZoom(1.4);
    expect(listener).toHaveBeenCalledWith(1.4);

    unsubscribe();
    setZoom(1.5);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("initializes from localStorage if saved zoom exists within valid range", () => {
    localStorage.setItem(ZOOM_STORAGE_KEY, "1.5");
    const initial = initZoom();
    expect(initial).toBe(1.5);
    expect(document.documentElement.style.zoom).toBe("1.5");
  });

  it("initializes to DEFAULT_ZOOM if localStorage is empty or invalid", () => {
    localStorage.setItem(ZOOM_STORAGE_KEY, "invalid_number");
    const initial = initZoom();
    expect(initial).toBe(DEFAULT_ZOOM);
  });

  it("scales document dimensions when zoom < 1.0 to prevent shrinking/letterboxing", () => {
    setZoom(0.8);
    expect(document.documentElement.style.zoom).toBe("0.8");
    expect(document.documentElement.style.width).toBe("125%");
    expect(document.documentElement.style.height).toBe("125%");
    expect(document.documentElement.style.getPropertyValue("--app-zoom")).toBe("0.8");

    setZoom(1.0);
    expect(document.documentElement.style.zoom).toBe("1");
    expect(document.documentElement.style.width).toBe("100%");
    expect(document.documentElement.style.height).toBe("100%");
    expect(document.documentElement.style.getPropertyValue("--app-zoom")).toBe("1");
  });
});
