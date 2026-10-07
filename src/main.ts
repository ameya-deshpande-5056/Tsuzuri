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
  private btnPrint!: HTMLButtonElement;
  private btnTheme!: HTMLButtonElement;
  private themeLabel!: HTMLElement;
  private docTitleEl!: HTMLElement;
  private dirtyIndicatorEl!: HTMLElement;
  private tocDrawer!: HTMLElement;
  private tocList!: HTMLElement;
  private btnCloseToc!: HTMLButtonElement;
  private toastEl!: HTMLElement;

  // Mobile Sheet & Backdrop Elements
  private btnMore!: HTMLButtonElement;
  private mobileSheet!: HTMLElement;
  private btnCloseSheet!: HTMLButtonElement;
  private drawerBackdrop!: HTMLElement;
  private sheetBtnOpen!: HTMLButtonElement;
  private sheetBtnSave!: HTMLButtonElement;
  private sheetBtnFind!: HTMLButtonElement;
  private sheetBtnPrint!: HTMLButtonElement;
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

  private toastTimeout: number | null = null;

  constructor() {
    this.state = createInitialState();
  }

  public async init(): Promise<void> {
    this.bindDomElements();
    this.initThemeSystem();
    this.initEditor();
    this.initNavigation();
    this.bindEvents();
    this.bindShortcuts();
    this.bindDragAndDrop();

    // Initial render
    this.updateTitleDisplay();
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
    this.btnPrint = document.getElementById("btn-print") as HTMLButtonElement;
    this.btnTheme = document.getElementById("btn-theme") as HTMLButtonElement;
    this.themeLabel = document.getElementById("theme-label") as HTMLElement;
    this.docTitleEl = document.getElementById("doc-title") as HTMLElement;
    this.dirtyIndicatorEl = document.getElementById("dirty-indicator") as HTMLElement;
    this.tocDrawer = document.getElementById("toc-drawer") as HTMLElement;
    this.tocList = document.getElementById("toc-list") as HTMLElement;
    this.btnCloseToc = document.getElementById("btn-close-toc") as HTMLButtonElement;
    this.toastEl = document.getElementById("toast-notification") as HTMLElement;

    this.btnMore = document.getElementById("btn-more") as HTMLButtonElement;
    this.mobileSheet = document.getElementById("mobile-sheet") as HTMLElement;
    this.btnCloseSheet = document.getElementById("btn-close-sheet") as HTMLButtonElement;
    this.drawerBackdrop = document.getElementById("drawer-backdrop") as HTMLElement;
    this.sheetBtnOpen = document.getElementById("sheet-btn-open") as HTMLButtonElement;
    this.sheetBtnSave = document.getElementById("sheet-btn-save") as HTMLButtonElement;
    this.sheetBtnFind = document.getElementById("sheet-btn-find") as HTMLButtonElement;
    this.sheetBtnPrint = document.getElementById("sheet-btn-print") as HTMLButtonElement;

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
      }
    );

    this.editor.setValue(this.state.doc.content, true);
    this.updateEditorStats(this.state.doc.content);
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

    // File operations
    this.btnOpen.addEventListener("click", () => this.handleOpenFile());
    this.btnSave.addEventListener("click", () => this.handleSaveFile(false));
    this.btnPrint.addEventListener("click", () => this.printDocument());

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

    this.sheetBtnPrint.addEventListener("click", () => {
      this.closeMobileSheet();
      this.printDocument();
    });

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
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "p") {
        e.preventDefault();
        this.printDocument();
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
            reader.onload = (evt) => {
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
              this.renderCurrentDocument();
              this.switchView("reader");
              this.showToast(`Loaded ${file.name}`);
            };
            reader.readAsText(file);
          }
        }
      }
    });
  }

  // View Switcher (Reader ↔ Editor)
  public async switchView(newView: ViewMode): Promise<void> {
    if (this.state.activeView === newView) return;

    if (newView === "reader") {
      // Switched to Reader: render current Markdown
      await this.renderCurrentDocument();
      this.editorView.style.display = "none";
      this.readerView.style.display = "flex";
      this.btnViewReader.classList.add("active");
      this.btnViewEditor.classList.remove("active");
      this.btnViewReader.setAttribute("aria-selected", "true");
      this.btnViewEditor.setAttribute("aria-selected", "false");
      this.btnToc.style.display = "inline-flex";
      this.closeFindBar();
      this.readerView.focus();
    } else {
      // Switched to Editor: sync content and focus
      this.editor.setValue(this.state.doc.content);
      this.readerView.style.display = "none";
      this.editorView.style.display = "flex";
      this.btnViewEditor.classList.add("active");
      this.btnViewReader.classList.remove("active");
      this.btnViewEditor.setAttribute("aria-selected", "true");
      this.btnViewReader.setAttribute("aria-selected", "false");
      this.btnToc.style.display = "none";
      this.nav.closeToc();
      this.editor.focus();
    }

    this.state.activeView = newView;
  }

  private async renderCurrentDocument(): Promise<void> {
    const headings = await renderDocument(
      this.state.doc.content,
      this.readerContent,
      this.state.doc.directory
    );
    this.nav.updateHeadings(headings);
  }

  public async printDocument(): Promise<void> {
    if (this.state.activeView !== "reader") {
      await this.switchView("reader");
    }
    window.print();
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
      await this.renderCurrentDocument();
      await this.switchView("reader");
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

    // Start in Reader view
    await this.switchView("reader");
    await this.renderCurrentDocument();
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

    if (this.state.doc.isDirty) {
      this.btnSave.classList.add("dirty");
      this.sheetBtnSave.classList.add("dirty");
    } else {
      this.btnSave.classList.remove("dirty");
      this.sheetBtnSave.classList.remove("dirty");
    }
  }

  private updateEditorStats(content: string): void {
    const trimmed = content.trim();
    const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
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
