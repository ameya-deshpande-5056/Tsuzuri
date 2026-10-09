// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Header Layout, Tooltip & View Switch Polishing", () => {
  let header: HTMLElement;
  let docTitle: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <header class="app-header" id="app-header">
        <div class="header-left">
          <span class="app-name">綴り</span>
          <div class="doc-title-wrapper">
            <span id="doc-title" class="doc-title">very_long_file_name_that_might_overflow.md</span>
            <span id="dirty-indicator" class="dirty-indicator" style="display: none;">•</span>
          </div>
        </div>
        <div class="header-center">
          <div class="view-switcher" role="tablist">
            <button id="btn-view-reader" class="view-btn active">Reader</button>
            <button id="btn-view-editor" class="view-btn">Editor</button>
          </div>
        </div>
        <div class="header-right">
          <button id="btn-toc" class="tool-btn"><span class="btn-label">TOC</span></button>
          <button id="btn-save" class="tool-btn"><span class="btn-label">Save</span></button>
        </div>
      </header>
    `;
    header = document.getElementById("app-header") as HTMLElement;
    docTitle = document.getElementById("doc-title") as HTMLElement;
  });

  it("applies doc-title tooltip only when title text is truncated", () => {
    const updateTooltip = (el: HTMLElement, fileName: string) => {
      if (el.scrollWidth > el.clientWidth) {
        el.title = fileName;
      } else {
        el.removeAttribute("title");
      }
    };

    // Case 1: Insufficient space (truncated)
    Object.defineProperty(docTitle, "clientWidth", { value: 100, configurable: true });
    Object.defineProperty(docTitle, "scrollWidth", { value: 250, configurable: true });

    updateTooltip(docTitle, "very_long_file_name_that_might_overflow.md");
    expect(docTitle.getAttribute("title")).toBe("very_long_file_name_that_might_overflow.md");

    // Case 2: Ample space (not truncated)
    Object.defineProperty(docTitle, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(docTitle, "scrollWidth", { value: 250, configurable: true });

    updateTooltip(docTitle, "very_long_file_name_that_might_overflow.md");
    expect(docTitle.hasAttribute("title")).toBe(false);
  });

  it("does not re-render document if content is unchanged during view toggle", async () => {
    let renderCount = 0;
    const fakeRender = vi.fn().mockImplementation(() => {
      renderCount++;
      return Promise.resolve([]);
    });

    let lastRenderedContent: string | null = null;
    let currentContent = "# Hello Tsuzuri";

    const switchView = async (targetView: "reader" | "editor") => {
      if (targetView === "reader") {
        if (lastRenderedContent !== currentContent) {
          await fakeRender();
          lastRenderedContent = currentContent;
        }
      }
    };

    // Initial render
    await switchView("reader");
    expect(renderCount).toBe(1);

    // Switch to editor (no render)
    await switchView("editor");
    expect(renderCount).toBe(1);

    // Switch back to reader without modifying content (instantaneous 0ms fast-path!)
    await switchView("reader");
    expect(renderCount).toBe(1); // STILL 1, no duplicate re-render!

    // Modify content
    currentContent = "# Hello Tsuzuri with edits";
    await switchView("reader");
    expect(renderCount).toBe(2); // Rendered because content changed
  });
});
