export interface EditorCallbacks {
  onContentChange: (newContent: string) => void;
  onCursorChange?: (line: number, col: number) => void;
}

export interface EditorOptions {
  wordWrap?: boolean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export class MarkdownEditor {
  private textarea: HTMLTextAreaElement;
  private lineGutter: HTMLElement;
  private callbacks: EditorCallbacks;
  private measureContainer: HTMLElement;
  private wordWrap: boolean = true;

  // Search state
  private findMatches: number[] = [];
  private currentMatchIndex: number = -1;
  private lastSearchQuery: string = "";

  // Undo/Redo history stack
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private isApplyingHistory: boolean = false;
  private maxHistory: number = 100;
  private historyDebounceTimer: number = 0;

  constructor(
    _container: HTMLElement,
    textarea: HTMLTextAreaElement,
    lineGutter: HTMLElement,
    callbacks: EditorCallbacks,
    options?: EditorOptions
  ) {
    this.textarea = textarea;
    this.lineGutter = lineGutter;
    this.callbacks = callbacks;
    this.wordWrap = options?.wordWrap ?? true;

    // Create hidden measuring container for wrapped line calculations
    this.measureContainer = document.createElement("div");
    this.measureContainer.className = "editor-measure-container";
    this.measureContainer.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.measureContainer);

    this.setWordWrap(this.wordWrap, false);
    this.initEvents();
  }

  private initEvents(): void {
    // Content input and history tracking
    this.textarea.addEventListener("input", () => {
      this.updateLineNumbers();
      this.callbacks.onContentChange(this.textarea.value);

      if (!this.isApplyingHistory) {
        this.schedulePushHistory(this.textarea.value);
        this.redoStack = [];
      }
    });

    // Sync scroll between textarea and line gutter
    this.textarea.addEventListener("scroll", () => {
      this.syncScroll();
    });

    // Forward wheel scrolling on line gutter to textarea
    this.lineGutter.addEventListener("wheel", (e: WheelEvent) => {
      this.textarea.scrollTop += e.deltaY;
    }, { passive: true });

    // Forward touch scrolling on mobile line gutter to textarea
    let touchGutterY = 0;
    this.lineGutter.addEventListener("touchstart", (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchGutterY = e.touches[0].clientY;
      }
    }, { passive: true });

    this.lineGutter.addEventListener("touchmove", (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const delta = touchGutterY - e.touches[0].clientY;
        this.textarea.scrollTop += delta;
        touchGutterY = e.touches[0].clientY;
      }
    }, { passive: true });

    // Jump to line when clicking line number in gutter
    this.lineGutter.addEventListener("click", (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(".line-number") as HTMLElement;
      if (!target) return;
      const lineNum = parseInt(target.textContent || "1", 10);
      if (!isNaN(lineNum)) {
        this.goToLine(lineNum);
      }
    });

    // Keyboard behaviors: Tab insertion, Enter indentation
    this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const val = this.textarea.value;

        // Insert 2 spaces
        this.textarea.value = val.substring(0, start) + "  " + val.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
        this.updateLineNumbers();
        this.callbacks.onContentChange(this.textarea.value);
        this.schedulePushHistory(this.textarea.value);
      }
    });

    // Cursor position tracking
    this.textarea.addEventListener("select", () => {
      this.reportCursorPosition();
    });

    this.textarea.addEventListener("click", () => {
      this.reportCursorPosition();
    });

    this.textarea.addEventListener("keyup", () => {
      this.reportCursorPosition();
    });

    document.addEventListener("selectionchange", () => {
      if (document.activeElement === this.textarea) {
        this.reportCursorPosition();
      }
    });

    // Resize observer to recalculate line heights when editor container dimensions change
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => {
        this.updateLineNumbers();
      });
      resizeObserver.observe(this.textarea);
    }
  }

  public setWordWrap(enabled: boolean, update: boolean = true): void {
    this.wordWrap = enabled;
    if (enabled) {
      this.textarea.wrap = "soft";
      this.textarea.classList.remove("no-wrap");
      this.textarea.classList.add("word-wrap");
    } else {
      this.textarea.wrap = "off";
      this.textarea.classList.remove("word-wrap");
      this.textarea.classList.add("no-wrap");
    }
    if (update) {
      this.updateLineNumbers();
    }
  }

  public isWordWrap(): boolean {
    return this.wordWrap;
  }

  public goToLine(lineNumber: number): void {
    const lines = this.textarea.value.split("\n");
    const targetLine = Math.max(1, Math.min(lineNumber, lines.length));
    let charIndex = 0;
    for (let i = 0; i < targetLine - 1; i++) {
      charIndex += lines[i].length + 1;
    }
    this.textarea.focus();
    this.textarea.setSelectionRange(charIndex, charIndex);
    this.reportCursorPosition();
  }

  public highlightActiveLine(): void {
    const pos = this.textarea.selectionStart;
    const textBefore = this.textarea.value.substring(0, pos);
    const lineNumber = textBefore.split("\n").length;

    const lineElements = this.lineGutter.children;
    for (let i = 0; i < lineElements.length; i++) {
      if (i + 1 === lineNumber) {
        lineElements[i].classList.add("active");
      } else {
        lineElements[i].classList.remove("active");
      }
    }
  }

  public syncScroll(): void {
    this.lineGutter.scrollTop = this.textarea.scrollTop;
  }

  private reportCursorPosition(): void {
    const pos = this.textarea.selectionStart;
    const textBefore = this.textarea.value.substring(0, pos);
    const lines = textBefore.split("\n");
    const lineNumber = lines.length;
    const colNumber = lines[lines.length - 1].length + 1;
    this.highlightActiveLine();
    if (this.callbacks.onCursorChange) {
      this.callbacks.onCursorChange(lineNumber, colNumber);
    }
  }

  public setValue(content: string, resetHistory: boolean = false): void {
    this.textarea.value = content;
    this.updateLineNumbers();
    if (resetHistory) {
      this.undoStack = [content];
      this.redoStack = [];
    }
  }

  public getValue(): string {
    return this.textarea.value;
  }

  public focus(): void {
    this.textarea.focus();
  }

  // Synchronized line numbering
  public updateLineNumbers(): void {
    const value = this.textarea.value;
    const lines = value.split("\n");
    const lineCount = lines.length;

    // If word-wrap is disabled, every line occupies exactly 1 standard line-height
    if (!this.wordWrap) {
      this.renderUnwrappedLineNumbers(lineCount);
      return;
    }

    this.renderWrappedLineNumbers(lines);
  }

  private renderUnwrappedLineNumbers(lineCount: number): void {
    const computed = window.getComputedStyle(this.textarea);
    const defaultLineHeight = parseFloat(computed.lineHeight) || 22;

    let gutterHtml = "";
    for (let i = 1; i <= lineCount; i++) {
      gutterHtml += `<div class="line-number" style="height: ${defaultLineHeight}px; line-height: ${defaultLineHeight}px;">${i}</div>`;
    }
    this.lineGutter.innerHTML = gutterHtml;
    this.highlightActiveLine();
    this.syncScroll();
  }

  private renderWrappedLineNumbers(lines: string[]): void {
    const computed = window.getComputedStyle(this.textarea);
    const paddingLeft = parseFloat(computed.paddingLeft) || 0;
    const paddingRight = parseFloat(computed.paddingRight) || 0;
    const contentWidth = this.textarea.clientWidth - paddingLeft - paddingRight;
    const defaultLineHeight = parseFloat(computed.lineHeight) || 22;

    // In environments with no layout (e.g. clientWidth <= 0 in jsdom / hidden container)
    if (contentWidth <= 0) {
      this.renderUnwrappedLineNumbers(lines.length);
      return;
    }

    // Configure measuring container to match textarea text rendering area
    this.measureContainer.style.width = `${Math.max(1, contentWidth)}px`;
    this.measureContainer.style.fontFamily = computed.fontFamily;
    this.measureContainer.style.fontSize = computed.fontSize;
    this.measureContainer.style.fontWeight = computed.fontWeight;
    this.measureContainer.style.letterSpacing = computed.letterSpacing;
    this.measureContainer.style.tabSize = computed.tabSize;
    this.measureContainer.style.lineHeight = `${defaultLineHeight}px`;

    // Render all rows into measuring container in one write
    this.measureContainer.innerHTML = lines.map((line) => {
      const text = escapeHtml(line);
      return `<div class="editor-measure-row" style="min-height: ${defaultLineHeight}px; line-height: ${defaultLineHeight}px;">${text || "&#8203;"}</div>`;
    }).join("");

    // Read all row heights (browser computes in 1 batch layout pass)
    const rows = this.measureContainer.children;
    const rowCount = rows.length;
    let gutterHtml = "";

    for (let i = 0; i < rowCount; i++) {
      const rowEl = rows[i] as HTMLElement;
      const measuredH = rowEl.offsetHeight || defaultLineHeight;
      const lineRows = Math.max(1, Math.round(measuredH / defaultLineHeight));
      const rowHeight = lineRows * defaultLineHeight;

      gutterHtml += `<div class="line-number" style="height: ${rowHeight}px; line-height: ${defaultLineHeight}px;">${i + 1}</div>`;
    }

    this.lineGutter.innerHTML = gutterHtml;
    this.highlightActiveLine();
    this.syncScroll();
  }

  public destroy(): void {
    if (this.measureContainer && this.measureContainer.parentNode) {
      this.measureContainer.parentNode.removeChild(this.measureContainer);
    }
  }

  // Undo / Redo
  private schedulePushHistory(val: string): void {
    window.clearTimeout(this.historyDebounceTimer);
    this.historyDebounceTimer = window.setTimeout(() => {
      if (this.undoStack.length === 0 || this.undoStack[this.undoStack.length - 1] !== val) {
        this.undoStack.push(val);
        if (this.undoStack.length > this.maxHistory) {
          this.undoStack.shift();
        }
      }
    }, 300);
  }

  public undo(): void {
    if (this.undoStack.length > 1) {
      this.isApplyingHistory = true;
      const current = this.undoStack.pop()!;
      this.redoStack.push(current);
      const previous = this.undoStack[this.undoStack.length - 1];
      this.textarea.value = previous;
      this.updateLineNumbers();
      this.callbacks.onContentChange(previous);
      this.isApplyingHistory = false;
    }
  }

  public redo(): void {
    if (this.redoStack.length > 0) {
      this.isApplyingHistory = true;
      const next = this.redoStack.pop()!;
      this.undoStack.push(next);
      this.textarea.value = next;
      this.updateLineNumbers();
      this.callbacks.onContentChange(next);
      this.isApplyingHistory = false;
    }
  }

  // Search & Replace
  public find(query: string, matchCase: boolean = false): { count: number; current: number } {
    this.lastSearchQuery = query;
    this.findMatches = [];
    this.currentMatchIndex = -1;

    if (!query) {
      return { count: 0, current: 0 };
    }

    const content = matchCase ? this.textarea.value : this.textarea.value.toLowerCase();
    const needle = matchCase ? query : query.toLowerCase();

    let pos = 0;
    while ((pos = content.indexOf(needle, pos)) !== -1) {
      this.findMatches.push(pos);
      pos += needle.length;
    }

    if (this.findMatches.length > 0) {
      // Find nearest match to current cursor
      const cursor = this.textarea.selectionStart;
      let nearestIdx = this.findMatches.findIndex((m) => m >= cursor);
      if (nearestIdx === -1) nearestIdx = 0;
      this.selectMatch(nearestIdx);
    }

    return {
      count: this.findMatches.length,
      current: this.currentMatchIndex >= 0 ? this.currentMatchIndex + 1 : 0,
    };
  }

  public findNext(): { count: number; current: number } {
    if (this.findMatches.length === 0) return { count: 0, current: 0 };
    let nextIdx = this.currentMatchIndex + 1;
    if (nextIdx >= this.findMatches.length) nextIdx = 0;
    this.selectMatch(nextIdx);
    return { count: this.findMatches.length, current: nextIdx + 1 };
  }

  public findPrev(): { count: number; current: number } {
    if (this.findMatches.length === 0) return { count: 0, current: 0 };
    let prevIdx = this.currentMatchIndex - 1;
    if (prevIdx < 0) prevIdx = this.findMatches.length - 1;
    this.selectMatch(prevIdx);
    return { count: this.findMatches.length, current: prevIdx + 1 };
  }

  private selectMatch(index: number): void {
    if (index < 0 || index >= this.findMatches.length) return;
    this.currentMatchIndex = index;
    const matchStart = this.findMatches[index];
    const matchEnd = matchStart + this.lastSearchQuery.length;

    this.textarea.focus();
    this.textarea.setSelectionRange(matchStart, matchEnd);

    // Scroll into view if needed
    const textBefore = this.textarea.value.substring(0, matchStart);
    const lineIndex = textBefore.split("\n").length - 1;
    const approxLineHeight = 22;
    this.textarea.scrollTop = Math.max(0, lineIndex * approxLineHeight - 100);
  }

  public replaceCurrent(replaceWith: string): { count: number; current: number } {
    if (this.currentMatchIndex < 0 || this.findMatches.length === 0) {
      return { count: this.findMatches.length, current: 0 };
    }

    const matchStart = this.findMatches[this.currentMatchIndex];
    const matchEnd = matchStart + this.lastSearchQuery.length;
    const val = this.textarea.value;

    this.textarea.value = val.substring(0, matchStart) + replaceWith + val.substring(matchEnd);
    this.callbacks.onContentChange(this.textarea.value);
    this.schedulePushHistory(this.textarea.value);

    // Re-run search
    return this.find(this.lastSearchQuery);
  }

  public replaceAll(replaceWith: string): { count: number; current: number } {
    if (!this.lastSearchQuery) return { count: 0, current: 0 };

    const regex = new RegExp(this.escapeRegex(this.lastSearchQuery), "g");
    this.textarea.value = this.textarea.value.replace(regex, replaceWith);
    this.callbacks.onContentChange(this.textarea.value);
    this.schedulePushHistory(this.textarea.value);

    return this.find(this.lastSearchQuery);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
