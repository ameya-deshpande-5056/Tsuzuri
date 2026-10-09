import "katex/dist/katex.min.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/reader.css";
import "./styles/editor.css";

import { createInitialState, AppState, ViewMode, ThemeMode } from "./state";
import { initTheme, setTheme, getTheme } from "./theme";
import { renderDocument, setupInteractiveBehaviors } from "./renderer";
import { MarkdownEditor } from "./editor";
import { NavigationManager } from "./navigation";
import {
  readDocumentFile,
  writeDocumentFile,
  pickOpenFile,
  pickSaveFile,
  getCliTargetFile,
} from "./api";
import {
  initZoom,
  getZoom,
  zoomIn,
  zoomOut,
  resetZoom,
  formatZoom,
} from "./zoom";

// Main Application Controller
class TsuzuriApp {
  private state: AppState;
  private editor!: MarkdownEditor;
  private nav!: NavigationManager;

  // DOM Elements
  private readerView!: HTMLElement;
  private readerContent!: HTMLElement;
  private editorView!: HTMLElement;
  private markdownTextarea!: HTMLTextAreaElement;
  private lineGutter!: HTMLElement;
  private btnViewReader!: HTMLButtonElement;
  private btnViewEditor!: HTMLButtonElement;
  private btnToc!: HTMLButtonElement;
  private btnOpen!: HTMLButtonElement;
  private btnSave!: HTMLButtonElement;
  private btnTheme!: HTMLButtonElement;
  private themeLabel!: HTMLElement;
  private docTitleEl!: HTMLElement;
  private dirtyIndicatorEl!: HTMLElement;
  private tocDrawer!: HTMLElement;
  private tocList!: HTMLElement;
  private btnCloseToc!: HTMLButtonElement;
  private toastEl!: HTMLElement;

  // Zoom Controls
  private btnZoomReset!: HTMLButtonElement | null;
  private headerZoomValue!: HTMLElement | null;
  private sheetBtnZoomIn!: HTMLButtonElement | null;
  private sheetBtnZoomOut!: HTMLButtonElement | null;
  private sheetBtnZoomReset!: HTMLButtonElement | null;
  private sheetZoomValue!: HTMLElement | null;

  // Mobile Sheet & Backdrop Elements
  private btnMore!: HTMLButtonElement;
  private mobileSheet!: HTMLElement;
  private btnCloseSheet!: HTMLButtonElement;
  private drawerBackdrop!: HTMLElement;
  private sheetBtnViewMode!: HTMLButtonElement | null;
  private sheetViewLabel!: HTMLElement | null;
  private sheetViewIcon!: SVGElement | null;
  private sheetBtnOpen!: HTMLButtonElement;
  private sheetBtnSave!: HTMLButtonElement;
  private sheetBtnFind!: HTMLButtonElement;
  private sheetBtnWrap!: HTMLButtonElement;
  private sheetWrapLabel!: HTMLElement;
  private isMobileSheetOpen: boolean = false;

  // Find & Replace Elements
  private findReplaceBar!: HTMLElement;
  private replaceRow!: HTMLElement;
  private findInput!: HTMLInputElement;
  private replaceInput!: HTMLInputElement;
  private findCountEl!: HTMLElement;
  private btnFindPrev!: HTMLButtonElement;
  private btnFindNext!: HTMLButtonElement;
  private btnCloseFind!: HTMLButtonElement;
  private btnReplaceOne!: HTMLButtonElement;
  private btnReplaceAll!: HTMLButtonElement;

  // Statusbar Elements
  private editorCursorPos!: HTMLElement;
  private editorStats!: HTMLElement;
  private btnToggleWrap!: HTMLButtonElement;

  private toastTimeout: number | null = null;
  private lastRenderedContent: string | null = null;

  constructor() {
    this.state = createInitialState();
  }

  public async init(): Promise<void> {
    this.bindDomElements();
    this.initThemeSystem();
    this.initZoomSystem();
    this.initEditor();
    this.initNavigation();
    this.bindEvents();
    this.bindShortcuts();
    this.bindWheelZoom();
    this.bindDragAndDrop();

    // Initial render
    this.updateTitleDisplay();
    this.updateMobileViewToggleDisplay();
    await this.renderCurrentDocument();

    // Setup interactive behaviors (links, copy buttons)
    setupInteractiveBehaviors(this.readerContent);

    // Setup listener for Android / external document open intents
    this.setupExternalDocumentListener();

    // Check if launched with a file argument
    await this.checkLaunchFile();
  }

  private bindDomElements(): void {
    this.readerView = document.getElementById("reader-view") as HTMLElement;
    this.readerContent = document.getElementById("reader-content") as HTMLElement;
    this.editorView = document.getElementById("editor-view") as HTMLElement;
    this.markdownTextarea = document.getElementById("markdown-textarea") as HTMLTextAreaElement;
    this.lineGutter = document.getElementById("line-gutter") as HTMLElement;
    this.btnViewReader = document.getElementById("btn-view-reader") as HTMLButtonElement;
    this.btnViewEditor = document.getElementById("btn-view-editor") as HTMLButtonElement;
    this.btnToc = document.getElementById("btn-toc") as HTMLButtonElement;
    this.btnOpen = document.getElementById("btn-open") as HTMLButtonElement;
    this.btnSave = document.getElementById("btn-save") as HTMLButtonElement;
    this.btnTheme = document.getElementById("btn-theme") as HTMLButtonElement;
    this.themeLabel = document.getElementById("theme-label") as HTMLElement;
    this.docTitleEl = document.getElementById("doc-title") as HTMLElement;
    this.dirtyIndicatorEl = document.getElementById("dirty-indicator") as HTMLElement;
    this.tocDrawer = document.getElementById("toc-drawer") as HTMLElement;
    this.tocList = document.getElementById("toc-list") as HTMLElement;
    this.btnCloseToc = document.getElementById("btn-close-toc") as HTMLButtonElement;
    this.toastEl = document.getElementById("toast-notification") as HTMLElement;

    this.btnZoomReset = document.getElementById("btn-zoom-reset") as HTMLButtonElement | null;
    this.headerZoomValue = document.getElementById("header-zoom-value") as HTMLElement | null;
    this.sheetBtnZoomIn = document.getElementById("sheet-btn-zoom-in") as HTMLButtonElement | null;
    this.sheetBtnZoomOut = document.getElementById("sheet-btn-zoom-out") as HTMLButtonElement | null;
    this.sheetBtnZoomReset = document.getElementById("sheet-btn-zoom-reset") as HTMLButtonElement | null;
    this.sheetZoomValue = document.getElementById("sheet-zoom-value") as HTMLElement | null;

    this.btnMore = document.getElementById("btn-more") as HTMLButtonElement;
    this.mobileSheet = document.getElementById("mobile-sheet") as HTMLElement;
    this.btnCloseSheet = document.getElementById("btn-close-sheet") as HTMLButtonElement;
    this.drawerBackdrop = document.getElementById("drawer-backdrop") as HTMLElement;
    this.sheetBtnViewMode = document.getElementById("sheet-btn-view-mode") as HTMLButtonElement | null;
    this.sheetViewLabel = document.getElementById("sheet-view-label") as HTMLElement | null;
    this.sheetViewIcon = document.getElementById("sheet-view-icon") as unknown as SVGElement | null;
    this.sheetBtnOpen = document.getElementById("sheet-btn-open") as HTMLButtonElement;
    this.sheetBtnSave = document.getElementById("sheet-btn-save") as HTMLButtonElement;
    this.sheetBtnFind = document.getElementById("sheet-btn-find") as HTMLButtonElement;
    this.sheetBtnWrap = document.getElementById("sheet-btn-wrap") as HTMLButtonElement;
    this.sheetWrapLabel = document.getElementById("sheet-wrap-label") as HTMLElement;

    this.findReplaceBar = document.getElementById("find-replace-bar") as HTMLElement;
    this.replaceRow = document.getElementById("replace-row") as HTMLElement;
    this.findInput = document.getElementById("find-input") as HTMLInputElement;
    this.replaceInput = document.getElementById("replace-input") as HTMLInputElement;
    this.findCountEl = document.getElementById("find-count") as HTMLElement;
    this.btnFindPrev = document.getElementById("btn-find-prev") as HTMLButtonElement;
    this.btnFindNext = document.getElementById("btn-find-next") as HTMLButtonElement;
    this.btnCloseFind = document.getElementById("btn-close-find") as HTMLButtonElement;
    this.btnReplaceOne = document.getElementById("btn-replace-one") as HTMLButtonElement;
    this.btnReplaceAll = document.getElementById("btn-replace-all") as HTMLButtonElement;

    this.editorCursorPos = document.getElementById("editor-cursor-pos") as HTMLElement;
    this.editorStats = document.getElementById("editor-stats") as HTMLElement;
    this.btnToggleWrap = document.getElementById("btn-toggle-wrap") as HTMLButtonElement;
  }

  private initThemeSystem(): void {
    initTheme(this.state.themeMode, async () => {
      this.updateThemeButtonDisplay();
      if (this.state.activeView === "reader") {
        await this.renderCurrentDocument();
      }
    });
    this.updateThemeButtonDisplay();
  }

  private updateThemeButtonDisplay(): void {
    const current = getTheme();
    if (this.themeLabel) {
      this.themeLabel.textContent = current.charAt(0).toUpperCase() + current.slice(1);
    }
    document.querySelectorAll<HTMLButtonElement>(".sheet-theme-btn").forEach((btn) => {
      const mode = btn.getAttribute("data-theme-mode");
      if (mode === current) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  private initZoomSystem(): void {
    initZoom((zoom) => {
      this.updateZoomDisplay(zoom);
    });
    this.updateZoomDisplay(getZoom());
  }

  private updateZoomDisplay(zoom: number): void {
    const formatted = formatZoom(zoom);
    if (this.sheetZoomValue) {
      this.sheetZoomValue.textContent = formatted;
    }
    if (this.btnZoomReset && this.headerZoomValue) {
      if (Math.abs(zoom - 1.0) > 0.01) {
        this.headerZoomValue.textContent = formatted;
        this.btnZoomReset.style.display = "inline-flex";
        this.btnZoomReset.title = `Reset Zoom (${formatted} → 100%) (Ctrl+0)`;
      } else {
        this.btnZoomReset.style.display = "none";
      }
    }
  }

  private updateMobileViewToggleDisplay(): void {
    if (!this.sheetBtnViewMode || !this.sheetViewLabel || !this.sheetViewIcon) return;
    const isReader = this.state.activeView === "reader";
    if (isReader) {
      this.sheetViewLabel.textContent = "Edit Document";
      this.sheetViewIcon.innerHTML = `
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
        <path d="m15 5 4 4"></path>
      `;
      this.sheetBtnViewMode.title = "Switch to Editor Mode (Ctrl+E)";
    } else {
      this.sheetViewLabel.textContent = "Reader View";
      this.sheetViewIcon.innerHTML = `
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
      `;
      this.sheetBtnViewMode.title = "Switch to Reader View (Ctrl+E)";
    }
  }

  private cycleTheme(): void {
    const current = getTheme();
    let next: ThemeMode = "system";
    if (current === "system") next = "light";
    else if (current === "light") next = "dark";
    else next = "system";

    setTheme(next);
    this.state.themeMode = next;
    this.updateThemeButtonDisplay();
  }

  private openMobileSheet(): void {
    this.isMobileSheetOpen = true;
    this.mobileSheet.classList.add("open");
    this.mobileSheet.setAttribute("aria-hidden", "false");
    this.drawerBackdrop.classList.add("active");
  }

  private closeMobileSheet(): void {
    this.isMobileSheetOpen = false;
    this.mobileSheet.classList.remove("open");
    this.mobileSheet.setAttribute("aria-hidden", "true");
    if (!this.state.tocOpen) {
      this.drawerBackdrop.classList.remove("active");
    }
  }

  private initEditor(): void {
    const savedWrap = localStorage.getItem("tsuzuri-editor-wrap") !== "false";
    this.editor = new MarkdownEditor(
      this.editorView,
      this.markdownTextarea,
      this.lineGutter,
      {
        onContentChange: (newContent) => {
          this.state.doc.content = newContent;
          this.state.doc.isDirty = newContent !== this.state.doc.savedSnapshot;
          this.updateTitleDisplay();
          this.updateEditorStats(newContent);
        },
        onCursorChange: (line, col) => {
          this.editorCursorPos.textContent = `Ln ${line}, Col ${col}`;
        },
      },
      { wordWrap: savedWrap }
    );

    this.editor.setValue(this.state.doc.content, true);
    this.updateEditorStats(this.state.doc.content);
    this.updateWrapDisplay();
  }

  private toggleWordWrap(): void {
    const next = !this.editor.isWordWrap();
    this.editor.setWordWrap(next);
    localStorage.setItem("tsuzuri-editor-wrap", String(next));
    this.updateWrapDisplay();
    this.showToast(`Word wrap: ${next ? "On" : "Off"}`);
  }

  private updateWrapDisplay(): void {
    const isWrap = this.editor.isWordWrap();
    if (this.btnToggleWrap) {
      this.btnToggleWrap.textContent = `Wrap: ${isWrap ? "On" : "Off"}`;
      this.btnToggleWrap.title = `Toggle Word Wrap (${isWrap ? "On" : "Off"}) (Alt+Z)`;
    }
    if (this.sheetWrapLabel) {
      this.sheetWrapLabel.textContent = `Word Wrap: ${isWrap ? "On" : "Off"}`;
    }
  }

  private initNavigation(): void {
    this.nav = new NavigationManager(
      this.tocDrawer,
      this.tocList,
      this.readerView,
      (isOpen) => {
        this.state.tocOpen = isOpen;
        if (isOpen) {
          this.drawerBackdrop.classList.add("active");
        } else if (!this.isMobileSheetOpen) {
          this.drawerBackdrop.classList.remove("active");
        }
      }
    );
  }

  private bindEvents(): void {
    // View Switcher (Editor ↔ Reader)
    this.btnViewReader.addEventListener("click", () => this.switchView("reader"));
    this.btnViewEditor.addEventListener("click", () => this.switchView("editor"));

    // Document Title Tooltip & Path Info
    this.docTitleEl.addEventListener("mouseenter", () => this.updateDocTitleTooltip());
    this.docTitleEl.addEventListener("click", () => {
      if (this.state.doc.path) {
        this.showToast(this.state.doc.path);
      }
    });
    window.addEventListener("resize", () => this.updateDocTitleTooltip());

    // File operations
    this.btnOpen.addEventListener("click", () => this.handleOpenFile());
    this.btnSave.addEventListener("click", () => this.handleSaveFile(false));

    // Theme toggle
    this.btnTheme.addEventListener("click", () => this.cycleTheme());

    // TOC toggle
    this.btnToc.addEventListener("click", () => {
      if (this.state.activeView !== "reader") {
        this.switchView("reader");
      }
      this.nav.toggleToc();
    });

    this.btnCloseToc.addEventListener("click", () => this.nav.closeToc());

    // Search and Replace
    this.findInput.addEventListener("input", () => this.runFind());
    this.findInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) this.findPrev();
        else this.findNext();
      } else if (e.key === "Escape") {
        this.closeFindBar();
      }
    });

    this.replaceInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.replaceOne();
      } else if (e.key === "Escape") {
        this.closeFindBar();
      }
    });

    this.btnFindNext.addEventListener("click", () => this.findNext());
    this.btnFindPrev.addEventListener("click", () => this.findPrev());
    this.btnCloseFind.addEventListener("click", () => this.closeFindBar());
    this.btnReplaceOne.addEventListener("click", () => this.replaceOne());
    this.btnReplaceAll.addEventListener("click", () => this.replaceAll());

    // Mobile Actions Sheet & Backdrop
    this.btnMore.addEventListener("click", () => this.openMobileSheet());
    this.btnCloseSheet.addEventListener("click", () => this.closeMobileSheet());
    this.drawerBackdrop.addEventListener("click", () => {
      this.closeMobileSheet();
      this.nav.closeToc();
    });

    this.sheetBtnOpen.addEventListener("click", () => {
      this.closeMobileSheet();
      this.handleOpenFile();
    });

    this.sheetBtnSave.addEventListener("click", () => {
      this.closeMobileSheet();
      this.handleSaveFile(false);
    });

    this.sheetBtnFind.addEventListener("click", () => {
      this.closeMobileSheet();
      if (this.state.activeView !== "editor") {
        this.switchView("editor");
      }
      this.openFindBar(false);
    });

    if (this.sheetBtnViewMode) {
      this.sheetBtnViewMode.addEventListener("click", () => {
        this.closeMobileSheet();
        this.switchView(this.state.activeView === "reader" ? "editor" : "reader");
      });
    }

    if (this.btnZoomReset) {
      this.btnZoomReset.addEventListener("click", () => {
        resetZoom();
        this.showToast("Zoom: 100% (Reset)");
      });
    }

    if (this.sheetBtnZoomIn) {
      this.sheetBtnZoomIn.addEventListener("click", () => {
        zoomIn();
        this.showToast(`Zoom: ${formatZoom(getZoom())}`);
      });
    }

    if (this.sheetBtnZoomOut) {
      this.sheetBtnZoomOut.addEventListener("click", () => {
        zoomOut();
        this.showToast(`Zoom: ${formatZoom(getZoom())}`);
      });
    }

    if (this.sheetBtnZoomReset) {
      this.sheetBtnZoomReset.addEventListener("click", () => {
        resetZoom();
        this.showToast("Zoom: 100% (Reset)");
      });
    }

    if (this.sheetBtnWrap) {
      this.sheetBtnWrap.addEventListener("click", () => {
        this.closeMobileSheet();
        this.toggleWordWrap();
      });
    }

    if (this.btnToggleWrap) {
      this.btnToggleWrap.addEventListener("click", () => {
        this.toggleWordWrap();
      });
    }

    document.querySelectorAll<HTMLButtonElement>(".sheet-theme-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-theme-mode") as ThemeMode;
        if (mode) {
          setTheme(mode);
          this.state.themeMode = mode;
          this.updateThemeButtonDisplay();
        }
      });
    });
  }

  private bindShortcuts(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === "e") {
        e.preventDefault();
        this.switchView(this.state.activeView === "reader" ? "editor" : "reader");
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "o") {
        e.preventDefault();
        this.handleOpenFile();
      } else if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        this.handleSaveFile(true);
      } else if (isCmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        this.handleSaveFile(false);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        this.openFindBar(false);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "h") {
        e.preventDefault();
        this.openFindBar(true);
      } else if (isCmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === "z") {
        if (this.state.activeView === "editor" && document.activeElement === this.markdownTextarea) {
          // Native or custom editor undo handled
        }
      } else if (e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        this.toggleWordWrap();
      } else if (isCmdOrCtrl && (e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd")) {
        e.preventDefault();
        zoomIn();
        this.showToast(`Zoom: ${formatZoom(getZoom())}`);
      } else if (isCmdOrCtrl && (e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        zoomOut();
        this.showToast(`Zoom: ${formatZoom(getZoom())}`);
      } else if (isCmdOrCtrl && (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0")) {
        e.preventDefault();
        resetZoom();
        this.showToast("Zoom: 100% (Reset)");
      } else if (e.key === "Escape") {
        if (this.isMobileSheetOpen) {
          this.closeMobileSheet();
        } else if (this.state.findOpen) {
          this.closeFindBar();
        } else if (this.state.tocOpen) {
          this.nav.closeToc();
        }
      }
    });
  }

  private bindWheelZoom(): void {
    let wheelAccumulator = 0;
    const WHEEL_THRESHOLD = 50;
    let lastWheelTime = 0;

    window.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const now = Date.now();
          wheelAccumulator += e.deltaY;
          if (Math.abs(wheelAccumulator) >= WHEEL_THRESHOLD || (now - lastWheelTime > 160 && Math.abs(e.deltaY) > 0)) {
            if (wheelAccumulator < 0 || e.deltaY < 0) {
              zoomIn();
            } else {
              zoomOut();
            }
            wheelAccumulator = 0;
            lastWheelTime = now;
            this.showToast(`Zoom: ${formatZoom(getZoom())}`);
          }
        }
      },
      { passive: false }
    );
  }

  private bindDragAndDrop(): void {
    window.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        // In webview/tauri, file object might have path property
        const filePath = (file as any).path || file.name;
        if (filePath && typeof filePath === "string" && (filePath.endsWith(".md") || filePath.endsWith(".markdown") || filePath.endsWith(".txt"))) {
          try {
            await this.loadDocument(filePath);
          } catch {
            // Read content via FileReader fallback
            const reader = new FileReader();
            reader.onload = async (evt) => {
              const content = evt.target?.result as string;
              this.state.doc = {
                path: null,
                fileName: file.name,
                directory: null,
                content: content,
                savedSnapshot: content,
                isDirty: false,
              };
              this.editor.setValue(content, true);
              this.updateTitleDisplay();
              this.updateEditorStats(content);
              if (this.state.activeView === "reader") {
                await this.renderCurrentDocument();
              } else {
                await this.switchView("reader");
              }
              this.readerView.scrollTop = 0;
              this.showToast(`Loaded ${file.name}`);
            };
            reader.readAsText(file);
          }
        }
      }
    });
  }

  // View Switcher (Reader ↔ Editor)
  public async switchView(newView: ViewMode, force: boolean = false): Promise<void> {
    const isSameView = this.state.activeView === newView;
    if (isSameView && !force) {
      if (newView === "reader" && this.lastRenderedContent !== this.state.doc.content) {
        await this.renderCurrentDocument();
      }
      return;
    }

    if (newView === "reader") {
      this.state.activeView = "reader";
      // 1. Immediately toggle DOM visibility so switch is instantaneous without delay
      this.editorView.style.display = "none";
      this.readerView.style.display = "flex";
      this.btnViewReader.classList.add("active");
      this.btnViewEditor.classList.remove("active");
      this.btnViewReader.setAttribute("aria-selected", "true");
      this.btnViewEditor.setAttribute("aria-selected", "false");
      this.btnToc.style.display = "inline-flex";
      this.closeFindBar();
      this.readerView.focus();

      // 2. Only re-render if content has actually changed since last render or forced
      if (force || this.lastRenderedContent !== this.state.doc.content) {
        await this.renderCurrentDocument();
      }
    } else {
      this.state.activeView = "editor";
      // 1. Immediately reveal editor view
      this.readerView.style.display = "none";
      this.editorView.style.display = "flex";
      this.btnViewEditor.classList.add("active");
      this.btnViewReader.classList.remove("active");
      this.btnViewEditor.setAttribute("aria-selected", "true");
      this.btnViewReader.setAttribute("aria-selected", "false");
      this.btnToc.style.display = "none";
      this.nav.closeToc();

      // 2. Only set textarea value if out of sync to preserve user cursor & avoid unnecessary recalculations
      if (force || this.editor.getValue() !== this.state.doc.content) {
        this.editor.setValue(this.state.doc.content);
      }
      this.editor.updateLineNumbers();
      this.editor.focus();
    }

    this.updateMobileViewToggleDisplay();
  }

  private async renderCurrentDocument(): Promise<void> {
    const headings = await renderDocument(
      this.state.doc.content,
      this.readerContent,
      this.state.doc.directory
    );
    this.nav.updateHeadings(headings);
    this.lastRenderedContent = this.state.doc.content;
  }

  // File Operations
  public async handleOpenFile(): Promise<void> {
    try {
      const selectedPath = await pickOpenFile();
      if (selectedPath) {
        await this.loadDocument(selectedPath);
      }
    } catch (err) {
      console.error("Open file error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      this.showToast(`Error opening file: ${msg}`, true);
    }
  }

  public async loadDocument(path: string): Promise<void> {
    try {
      const doc = await readDocumentFile(path);
      this.state.doc = {
        path: doc.path,
        fileName: doc.file_name,
        directory: doc.directory,
        content: doc.content,
        savedSnapshot: doc.content,
        isDirty: false,
      };

      this.editor.setValue(doc.content, true);
      this.updateTitleDisplay();
      this.updateEditorStats(doc.content);

      if (this.state.activeView === "reader") {
        await this.renderCurrentDocument();
      } else {
        await this.switchView("reader");
      }
      this.readerView.scrollTop = 0;
      this.showToast(`Opened ${doc.file_name}`);
    } catch (err) {
      console.error("Load document error:", err);
      const raw = err instanceof Error ? err.message : String(err);
      const msg = raw.length > 100 ? `${raw.slice(0, 97)}...` : raw;
      this.showToast(`Failed to open: ${msg}`, true);
    }
  }

  public async handleSaveFile(saveAs: boolean): Promise<void> {
    const bridge = (window as any).TsuzuriBridge;
    if (
      !saveAs &&
      this.state.doc.path &&
      this.state.doc.path.startsWith("content://") &&
      bridge &&
      typeof bridge.saveDocument === "function"
    ) {
      try {
        const ok = bridge.saveDocument(this.state.doc.path, this.state.doc.content);
        if (ok) {
          this.state.doc.savedSnapshot = this.state.doc.content;
          this.state.doc.isDirty = false;
          this.updateTitleDisplay();
          this.showToast(`Saved ${this.state.doc.fileName}`);
          return;
        }
      } catch (err) {
        console.warn("Android bridge direct save failed:", err);
      }
    }

    let targetPath = this.state.doc.path;

    if (!targetPath || saveAs || targetPath.startsWith("content://")) {
      try {
        const picked = await pickSaveFile(this.state.doc.fileName);
        if (!picked) return; // User cancelled
        targetPath = picked;
      } catch (err) {
        console.error("Save picker error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        this.showToast(`Save canceled: ${msg}`, true);
        return;
      }
    }

    try {
      await writeDocumentFile(targetPath, this.state.doc.content);
      const fileName = targetPath.split(/[/\\]/).pop() || "document.md";
      const directory = targetPath.substring(0, Math.max(targetPath.lastIndexOf("/"), targetPath.lastIndexOf("\\")));

      this.state.doc.path = targetPath;
      this.state.doc.fileName = fileName;
      this.state.doc.directory = directory || null;
      this.state.doc.savedSnapshot = this.state.doc.content;
      this.state.doc.isDirty = false;

      this.updateTitleDisplay();
      this.showToast(`Saved ${fileName}`);
    } catch (err) {
      console.error("Save error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      this.showToast(`Save failed: ${msg}`, true);
    }
  }

  private setupExternalDocumentListener(): void {
    // Global hook callable by native Android bridge at any time (onCreate or onNewIntent)
    (window as any).__tsuzuri_open_document = (payload: { fileName: string; content: string; uri?: string }) => {
      this.loadExternalDocument(payload);
    };

    // If an intent document arrived before JS initialization finished
    if ((window as any).__tsuzuri_pending_doc) {
      this.loadExternalDocument((window as any).__tsuzuri_pending_doc);
      (window as any).__tsuzuri_pending_doc = null;
    }

    // Synchronously check native bridge for pending document
    const bridge = (window as any).TsuzuriBridge;
    if (bridge && typeof bridge.getPendingDocument === "function") {
      try {
        const raw = bridge.getPendingDocument();
        if (raw) {
          const payload = JSON.parse(raw);
          if (payload && payload.content !== undefined) {
            this.loadExternalDocument(payload);
          }
        }
      } catch (err) {
        console.warn("Failed to check pending document from bridge:", err);
      }
    }
  }

  private async loadExternalDocument(payload: { fileName: string; content: string; uri?: string }): Promise<void> {
    const { fileName, content, uri } = payload;
    this.state.doc.fileName = fileName || "document.md";
    this.state.doc.content = content || "";
    this.state.doc.path = uri || fileName;
    this.state.doc.directory = null;
    this.state.doc.savedSnapshot = this.state.doc.content;
    this.state.doc.isDirty = false;

    this.editor.setValue(this.state.doc.content, true);
    this.updateEditorStats(this.state.doc.content);
    this.updateTitleDisplay();

    if (this.state.activeView === "reader") {
      await this.renderCurrentDocument();
    } else {
      await this.switchView("reader");
    }
    this.readerView.scrollTop = 0;
    this.showToast(`Opened ${this.state.doc.fileName}`);
  }

  private async checkLaunchFile(): Promise<void> {
    try {
      const cliFile = await getCliTargetFile();
      if (cliFile) {
        await this.loadDocument(cliFile);
      }
    } catch (err) {
      console.error("CLI file check:", err);
    }
  }

  private updateTitleDisplay(): void {
    const dirtySuffix = this.state.doc.isDirty ? " •" : "";
    this.docTitleEl.textContent = this.state.doc.fileName;
    this.dirtyIndicatorEl.style.display = this.state.doc.isDirty ? "inline" : "none";
    document.title = `${this.state.doc.fileName}${dirtySuffix} — Tsuzuri`;
    this.updateDocTitleTooltip();

    if (this.state.doc.isDirty) {
      this.btnSave.classList.add("dirty");
      this.sheetBtnSave.classList.add("dirty");
    } else {
      this.btnSave.classList.remove("dirty");
      this.sheetBtnSave.classList.remove("dirty");
    }
  }

  private updateDocTitleTooltip(): void {
    // Only display tooltip on hover when there is insufficient space to display full filename
    if (this.docTitleEl.scrollWidth > this.docTitleEl.clientWidth) {
      this.docTitleEl.title = this.state.doc.fileName;
    } else {
      this.docTitleEl.removeAttribute("title");
    }
  }

  private updateEditorStats(content: string): void {
    let wordCount = 0;
    let inWord = false;
    for (let i = 0; i < content.length; i++) {
      const code = content.charCodeAt(i);
      if (code <= 32) {
        inWord = false;
      } else if (!inWord) {
        inWord = true;
        wordCount++;
      }
    }
    const charCount = content.length;
    const readTimeMinutes = Math.max(1, Math.round(wordCount / 200));
    this.editorStats.textContent = `${wordCount} words · ${charCount} chars · ${readTimeMinutes} min read`;
  }

  // Find & Replace UI
  private openFindBar(showReplace: boolean): void {
    if (this.state.activeView !== "editor") {
      this.switchView("editor");
    }

    this.findReplaceBar.style.display = "flex";
    this.replaceRow.style.display = showReplace ? "flex" : "none";
    this.state.findOpen = true;

    this.findInput.focus();
    this.findInput.select();

    if (this.findInput.value) {
      this.runFind();
    }
  }

  private closeFindBar(): void {
    this.findReplaceBar.style.display = "none";
    this.state.findOpen = false;
    if (this.state.activeView === "editor") {
      this.editor.focus();
    }
  }

  private runFind(): void {
    const query = this.findInput.value;
    const res = this.editor.find(query);
    this.updateFindCount(res.current, res.count);
  }

  private findNext(): void {
    const res = this.editor.findNext();
    this.updateFindCount(res.current, res.count);
  }

  private findPrev(): void {
    const res = this.editor.findPrev();
    this.updateFindCount(res.current, res.count);
  }

  private replaceOne(): void {
    const res = this.editor.replaceCurrent(this.replaceInput.value);
    this.updateFindCount(res.current, res.count);
  }

  private replaceAll(): void {
    const res = this.editor.replaceAll(this.replaceInput.value);
    this.updateFindCount(res.current, res.count);
  }

  private updateFindCount(current: number, total: number): void {
    if (total === 0) {
      this.findCountEl.textContent = this.findInput.value ? "0/0" : "";
    } else {
      this.findCountEl.textContent = `${current}/${total}`;
    }
  }

  private showToast(msg: string, isError: boolean = false): void {
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }

    this.toastEl.textContent = msg;
    if (isError) {
      this.toastEl.classList.add("toast-error");
    } else {
      this.toastEl.classList.remove("toast-error");
    }

    this.toastEl.classList.add("visible");
    const duration = isError ? 4000 : 2400;
    this.toastTimeout = window.setTimeout(() => {
      this.toastEl.classList.remove("visible");
      this.toastEl.classList.remove("toast-error");
      this.toastTimeout = null;
    }, duration);
  }
}

function initSafeAreaInsets(): void {
  const updateFromBridge = () => {
    const bridge = (window as any).TsuzuriSafeAreaBridge;
    if (bridge && typeof bridge.getInsets === "function") {
      try {
        const insets = JSON.parse(bridge.getInsets());
        if (insets && typeof insets.top === "number") {
          document.documentElement.style.setProperty("--safe-area-top", `${insets.top}px`);
          document.documentElement.style.setProperty("--safe-area-bottom", `${insets.bottom}px`);
          document.documentElement.style.setProperty("--safe-area-left", `${insets.left}px`);
          document.documentElement.style.setProperty("--safe-area-right", `${insets.right}px`);
        }
      } catch (err) {
        console.warn("Error reading Android safe area insets:", err);
      }
    }
  };

  updateFromBridge();
  window.addEventListener("resize", updateFromBridge);
  window.addEventListener("orientationchange", updateFromBridge);
}

// Bootstrap
window.addEventListener("DOMContentLoaded", () => {
  initSafeAreaInsets();
  const app = new TsuzuriApp();
  app.init().catch((err) => console.error("Initialization error:", err));
});
