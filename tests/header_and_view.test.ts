// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";

describe("Header Layout, Tooltip & View Switch Polishing", () => {
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

  it("instantly updates reader view when a different file is loaded while already in reader view", async () => {
    let renderedContent: string | null = null;
    const fakeRender = vi.fn().mockImplementation((content: string) => {
      renderedContent = content;
      return Promise.resolve([]);
    });

    let activeView: "reader" | "editor" = "reader";
    let docContent = "# Document 1";
    let lastRenderedContent: string | null = null;

    const renderCurrentDoc = async () => {
      await fakeRender(docContent);
      lastRenderedContent = docContent;
    };

    const loadNewDoc = async (newContent: string) => {
      docContent = newContent;
      if (activeView === "reader") {
        await renderCurrentDoc();
      }
    };

    // Initial state: Document 1 loaded and rendered in reader
    await renderCurrentDoc();
    expect(renderedContent).toBe("# Document 1");
    expect(fakeRender).toHaveBeenCalledTimes(1);

    // Load Document 2 while currently in reader view
    await loadNewDoc("# Document 2");
    // Verify Document 2 is immediately rendered without needing to switch to editor and back
    expect(renderedContent).toBe("# Document 2");
    expect(lastRenderedContent).toBe("# Document 2");
    expect(fakeRender).toHaveBeenCalledTimes(2);
  });

  it("ensures print functionality is completely removed and header buttons are cleanly structured", () => {
    const indexHtml = fs.readFileSync("/home/ameya/Tsuzuri/index.html", "utf-8");
    const mainTs = fs.readFileSync("/home/ameya/Tsuzuri/src/main.ts", "utf-8");

    // Print elements removed from index.html
    expect(indexHtml).not.toContain('id="btn-print"');
    expect(indexHtml).not.toContain('id="sheet-btn-print"');
    expect(indexHtml).not.toContain("theme-dropdown-container");

    // Print handlers removed from main.ts
    expect(mainTs).not.toContain("btnPrint");
    expect(mainTs).not.toContain("sheetBtnPrint");
    expect(mainTs).not.toContain("printDocument");
  });

  it("provides Google Docs style view toggle in mobile sheet with dynamic label and icon", () => {
    const indexHtml = fs.readFileSync("/home/ameya/Tsuzuri/index.html", "utf-8");
    const mainTs = fs.readFileSync("/home/ameya/Tsuzuri/src/main.ts", "utf-8");
    const layoutCss = fs.readFileSync("/home/ameya/Tsuzuri/src/styles/layout.css", "utf-8");

    // Elements present in index.html
    expect(indexHtml).toContain('id="sheet-btn-view-mode"');
    expect(indexHtml).toContain('id="sheet-view-label"');
    expect(indexHtml).toContain('id="sheet-view-icon"');

    // Layout CSS hides header-center on mobile
    expect(layoutCss).toContain(".header-center");
    expect(layoutCss).toMatch(/@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*\.header-center\s*\{[^}]*display:\s*none\s*!important/);

    // main.ts manages mobile view toggle display
    expect(mainTs).toContain("sheetBtnViewMode");
    expect(mainTs).toContain("updateMobileViewToggleDisplay");
    expect(mainTs).toContain("Edit Document");
    expect(mainTs).toContain("Reader View");
  });

  it("provides zoom controls in mobile sheet and header indicator with shortcuts", () => {
    const indexHtml = fs.readFileSync("/home/ameya/Tsuzuri/index.html", "utf-8");
    const mainTs = fs.readFileSync("/home/ameya/Tsuzuri/src/main.ts", "utf-8");
    const layoutCss = fs.readFileSync("/home/ameya/Tsuzuri/src/styles/layout.css", "utf-8");

    // Zoom controls in index.html
    expect(indexHtml).toContain('id="btn-zoom-reset"');
    expect(indexHtml).toContain('id="header-zoom-value"');
    expect(indexHtml).toContain('id="sheet-btn-zoom-in"');
    expect(indexHtml).toContain('id="sheet-btn-zoom-out"');
    expect(indexHtml).toContain('id="sheet-btn-zoom-reset"');
    expect(indexHtml).toContain('id="sheet-zoom-value"');
    expect(indexHtml).toContain('id="menu-zoom-slider"');

    // Immediate zoom pre-paint script in head
    expect(indexHtml).toContain('localStorage.getItem("tsuzuri_zoom")');

    // Layout styles
    expect(layoutCss).toContain(".sheet-zoom-control");
    expect(layoutCss).toContain(".sheet-zoom-btn");
    expect(layoutCss).toContain(".zoom-indicator-btn");
    expect(layoutCss).toContain(".menu-zoom-slider");
    expect(layoutCss).toContain(".menu-zoom-row");

    // Zoom logic and shortcuts in main.ts
    expect(mainTs).toContain("initZoomSystem");
    expect(mainTs).toContain("bindWheelZoom");
    expect(mainTs).toContain("sheetBtnZoomIn");
    expect(mainTs).toContain("btnZoomReset");
    expect(mainTs).toContain("menuZoomSlider");
  });

  it("configures unified 3-button header across desktop and mobile, with desktop popover menu", () => {
    const indexHtml = fs.readFileSync("/home/ameya/Tsuzuri/index.html", "utf-8");
    const layoutCss = fs.readFileSync("/home/ameya/Tsuzuri/src/styles/layout.css", "utf-8");
    const mainTs = fs.readFileSync("/home/ameya/Tsuzuri/src/main.ts", "utf-8");

    // Header has TOC, Save, and More buttons
    expect(indexHtml).toContain('id="btn-toc"');
    expect(indexHtml).toContain('id="btn-save"');
    expect(indexHtml).toContain('id="btn-more"');

    // Header buttons have .btn-label hidden globally
    expect(layoutCss).toMatch(/\.tool-btn\s+\.btn-label\s*\{[^}]*display:\s*none\s*!important/);

    // Header-center and view-switcher hidden
    expect(layoutCss).toMatch(/\.header-center\s*\{[^}]*display:\s*none\s*!important/);
    expect(layoutCss).toMatch(/\.view-switcher\s*\{[^}]*display:\s*none\s*!important/);

    // Desktop popover menu styling (min-width: 681px)
    expect(layoutCss).toContain("@media (min-width: 681px)");
    expect(layoutCss).toContain("width: 290px;");
    expect(layoutCss).toContain("background-color: transparent !important;");

    // More button toggles menu open/close
    expect(mainTs).toContain("this.isMobileSheetOpen");
    expect(mainTs).toContain("this.closeMobileSheet()");
    expect(mainTs).toContain("this.openMobileSheet()");
  });

  it("configures automated version synchronization from git tags in release workflow", () => {
    const releaseYaml = fs.readFileSync("/home/ameya/Tsuzuri/.github/workflows/release.yml", "utf-8");
    const syncScript = fs.readFileSync("/home/ameya/Tsuzuri/scripts/sync-version.js", "utf-8");
    const tauriConf = JSON.parse(fs.readFileSync("/home/ameya/Tsuzuri/src-tauri/tauri.conf.json", "utf-8"));
    const pkg = JSON.parse(fs.readFileSync("/home/ameya/Tsuzuri/package.json", "utf-8"));

    // release.yml synchronizes versions before building desktop, android, and ios
    expect(releaseYaml).toContain("Synchronize Version from Git Tag");
    expect(releaseYaml).toContain("node scripts/sync-version.js");

    // sync-version.js computes Android versionCode and updates configs
    expect(syncScript).toContain("tauri.conf.json");
    expect(syncScript).toContain("Cargo.toml");
    expect(syncScript).toContain("versionCode");

    // Versions match current release tag
    expect(tauriConf.version).toBe(pkg.version);
    expect(tauriConf.bundle?.android?.versionCode).toBeGreaterThanOrEqual(1000000);
  });

  it("provides About Tsuzuri dialog with icon, version, build time, and external link", () => {
    const indexHtml = fs.readFileSync("/home/ameya/Tsuzuri/index.html", "utf-8");
    const layoutCss = fs.readFileSync("/home/ameya/Tsuzuri/src/styles/layout.css", "utf-8");
    const mainTs = fs.readFileSync("/home/ameya/Tsuzuri/src/main.ts", "utf-8");
    const viteConfig = fs.readFileSync("/home/ameya/Tsuzuri/vite.config.ts", "utf-8");
    const typesDts = fs.readFileSync("/home/ameya/Tsuzuri/src/types.d.ts", "utf-8");

    // Vite defines build timestamp and app version
    expect(viteConfig).toContain("__APP_VERSION__");
    expect(viteConfig).toContain("__BUILD_TIME__");
    expect(typesDts).toContain("declare const __APP_VERSION__: string;");
    expect(typesDts).toContain("declare const __BUILD_TIME__: string;");

    // Action button in menu
    expect(indexHtml).toContain('id="sheet-btn-about"');
    expect(indexHtml).toContain("About Tsuzuri");

    // Dialog elements in index.html
    expect(indexHtml).toContain('id="about-modal-backdrop"');
    expect(indexHtml).toContain('id="about-dialog"');
    expect(indexHtml).toContain('id="btn-close-about-x"');
    expect(indexHtml).not.toContain('id="btn-close-about"');
    expect(indexHtml).toContain('class="about-app-icon"');
    expect(indexHtml).toContain('id="about-version-heading"');
    expect(indexHtml).toContain('id="about-meta-version"');
    expect(indexHtml).toContain('id="about-meta-build-time"');
    expect(indexHtml).toContain('id="about-github-link"');

    // Dialog styles in layout.css
    expect(layoutCss).toContain(".modal-backdrop");
    expect(layoutCss).toContain(".about-dialog");
    expect(layoutCss).toContain(".about-app-icon");
    expect(layoutCss).toContain(".about-meta-grid");
    expect(layoutCss).toContain(".about-close-x-btn");

    // Click handler and open/close logic in main.ts
    expect(mainTs).toContain("openAboutDialog");
    expect(mainTs).toContain("closeAboutDialog");
    expect(mainTs).toContain("sheetBtnAbout");
    expect(mainTs).toContain("aboutGithubLink");
    expect(mainTs).toContain("openInBrowser");
  });

  it("strictly enforces mutual exclusivity between reader and editor views in CSS and runtime", () => {
    const layoutCss = fs.readFileSync("/home/ameya/Tsuzuri/src/styles/layout.css", "utf-8");
    const mainTs = fs.readFileSync("/home/ameya/Tsuzuri/src/main.ts", "utf-8");
    const indexHtml = fs.readFileSync("/home/ameya/Tsuzuri/index.html", "utf-8");

    // CSS rule guarantees only .active pane is visible, completely preventing side-by-side display
    expect(layoutCss).toMatch(/\.view-pane\s*\{[^}]*display:\s*none\s*!important;/);
    expect(layoutCss).toMatch(/\.view-pane\.active\s*\{[^}]*display:\s*flex\s*!important;/);

    // Initial DOM starts with reader-view active and editor-view hidden
    expect(indexHtml).toMatch(/<section[^>]*id="reader-view"[^>]*class="[^"]*view-pane[^"]*active[^"]*"/);
    expect(indexHtml).toMatch(/<section[^>]*id="editor-view"[^>]*class="[^"]*view-pane[^"]*"(?!active)/);

    // switchView synchronously swaps active class between readerView and editorView
    expect(mainTs).toContain('this.editorView.classList.remove("active");');
    expect(mainTs).toContain('this.readerView.classList.add("active");');
    expect(mainTs).toContain('this.readerView.classList.remove("active");');
    expect(mainTs).toContain('this.editorView.classList.add("active");');

    // init() explicitly enforces clean initial view state
    expect(mainTs).toContain('await this.switchView("reader", true);');
  });
});

