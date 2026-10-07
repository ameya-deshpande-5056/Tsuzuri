export interface EditorCallbacks {
  onContentChange: (newContent: string) => void;
  onCursorChange?: (line: number, col: number) => void;
}

export interface EditorOptions {
  wordWrap?: boolean;
}

function normalizeSeparator(cell: string, width: number): string {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  const dashCount = Math.max(3, width - Number(left) - Number(right));
  return `${left ? ":" : ""}${"-".repeat(dashCount)}${right ? ":" : ""}`.padEnd(width, " ");
}

function alignMarkdownTables(markdown: string): string {
  const blocks = markdown.split(/\n{2,}/);
  return blocks.map((block) => {
    const rows = block.split("\n");
    if (rows.length < 2 || !rows.every((row) => /^\s*\|.*\|\s*$/.test(row))) return block;
    const cells = rows.map((row) => row.trim().slice(1, -1).split("|").map((cell) => cell.trim()));
    const widths = cells[0].map((_, index) => Math.max(...cells.map((row) => (row[index] || "").length)));
    return cells.map((row, rowIndex) => {
      const padded = row.map((cell, index) => rowIndex === 1 ? normalizeSeparator(cell, widths[index]) : cell.padEnd(widths[index], " "));
      return `| ${padded.join(" | ")} |`;
    }).join("\n");
  }).join("\n\n");
}

export class MarkdownEditor {
  private container: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private lineGutter: HTMLElement;
  private callbacks: EditorCallbacks;
  private lineMeasure: HTMLElement;
  private wordWrap: boolean = true;
  private renderedLineCount: number = 0;

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
    container: HTMLElement,
    textarea: HTMLTextAreaElement,
    lineGutter: HTMLElement,
    callbacks: EditorCallbacks,
    options?: EditorOptions
  ) {
    this.textarea = textarea;
    this.lineGutter = lineGutter;
    this.container = (textarea.closest(".editor-surface") || textarea.parentElement || container) as HTMLElement;
    this.callbacks = callbacks;
    this.wordWrap = options?.wordWrap ?? true;

    // Line measure element from md-latex-mermaid2pdf
    this.lineMeasure = document.createElement("div");
    this.lineMeasure.className = "editor-line-measure";
    this.lineMeasure.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.lineMeasure);

    this.applyEditorWrap();
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
      this.syncLineNumbers();
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
      const target = (e.target as HTMLElement).closest("span") as HTMLElement;
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

    // Resize observer matching md-latex-mermaid2pdf
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.updateLineNumbers(true)).observe(this.textarea);
    }
  }

  public applyEditorWrap(): void {
    const enabled = this.wordWrap;
    this.textarea.wrap = enabled ? "soft" : "off";
    this.textarea.classList.toggle("word-wrap", enabled);
    this.textarea.classList.toggle("no-wrap", !enabled);
    if (this.container) {
      this.container.classList.toggle("word-wrap", enabled);
      this.container.classList.toggle("no-wrap", !enabled);
    }
    this.textarea.scrollLeft = 0;
    this.updateLineNumbers(true);
  }

  public setWordWrap(enabled: boolean, update: boolean = true): void {
    this.wordWrap = enabled;
    this.applyEditorWrap();
    if (!update) {
      // already updated
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
    const lineNumber = this.countEditorLines(textBefore);

    const spans = this.lineGutter.querySelectorAll("span");
    for (let i = 0; i < spans.length; i++) {
      if (i + 1 === lineNumber) {
        spans[i].classList.add("active");
      } else {
        spans[i].classList.remove("active");
      }
    }
  }

  public syncLineNumbers(): void {
    this.lineGutter.scrollTop = this.textarea.scrollTop;
  }

  public syncScroll(): void {
    this.syncLineNumbers();
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
    this.updateLineNumbers(true);
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

  public updateLineNumbers(force: boolean = false): void {
    const count = this.countEditorLines(this.textarea.value);
    if (this.wordWrap) {
      this.renderWrappedLineNumbers();
    } else if (force || count !== this.renderedLineCount) {
      this.renderUnwrappedLineNumbers(count);
    }
    this.renderedLineCount = count;
    this.syncLineNumbers();
    this.highlightActiveLine();
  }

  private renderUnwrappedLineNumbers(count: number): void {
    const fragment = document.createDocumentFragment();
    for (let i = 1; i <= count; i++) {
      const number = document.createElement("span");
      number.className = "line-number";
      number.textContent = String(i);
      fragment.appendChild(number);
    }
    this.lineGutter.replaceChildren(fragment);
  }

  private renderWrappedLineNumbers(): void {
    const editorStyle = window.getComputedStyle(this.textarea);
    const contentWidth = this.textarea.clientWidth
      - parseFloat(editorStyle.paddingLeft)
      - parseFloat(editorStyle.paddingRight);
    const defaultLineHeight = parseFloat(editorStyle.lineHeight) || 23.1;

    this.lineMeasure.style.width = `${Math.max(1, contentWidth)}px`;
    this.lineMeasure.style.font = editorStyle.font;
    this.lineMeasure.style.lineHeight = editorStyle.lineHeight;
    this.lineMeasure.style.letterSpacing = editorStyle.letterSpacing;
    this.lineMeasure.style.tabSize = editorStyle.tabSize;

    const fragment = document.createDocumentFragment();
    this.textarea.value.split("\n").forEach((line, index) => {
      this.lineMeasure.textContent = line || "\u200b";
      const number = document.createElement("span");
      number.className = "line-number";
      number.textContent = String(index + 1);
      const measuredH = this.lineMeasure.getBoundingClientRect().height || defaultLineHeight;
      number.style.height = `${measuredH}px`;
      fragment.appendChild(number);
    });
    this.lineGutter.replaceChildren(fragment);
  }

  private countEditorLines(value: string): number {
    let count = 1;
    for (let index = 0; index < value.length; index += 1) {
      if (value.charCodeAt(index) === 10) count += 1;
    }
    return count;
  }

  public wrapSelection(before: string, after: string, fallback: string = ""): void {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    const selected = this.textarea.value.slice(start, end) || fallback;
    this.textarea.setRangeText(`${before}${selected}${after}`, start, end, "select");
    this.textarea.focus();
    this.callbacks.onContentChange(this.textarea.value);
    this.schedulePushHistory(this.textarea.value);
    this.updateLineNumbers();
  }

  public formatMarkdown(): void {
    const lines = this.textarea.value.replace(/\r\n/g, "\n").split("\n");
    const formatted: string[] = [];
    let inFence = false;
    let previousBlank = false;

    for (const rawLine of lines) {
      let line = rawLine.replace(/[ \t]+$/g, "");
      if (/^```/.test(line.trim())) inFence = !inFence;
      if (!inFence) {
        line = line.replace(/^(#{1,6})([^\s#])/g, "$1 $2");
        line = line.replace(/^(\s*[-*+])\s{2,}/g, "$1 ");
        line = line.replace(/^(\s*\d+\.)\s{2,}/g, "$1 ");
      }
      const blank = line.trim() === "";
      if (blank && previousBlank) continue;
      formatted.push(line);
      previousBlank = blank;
    }

    this.textarea.value = alignMarkdownTables(formatted.join("\n")).trim() + "\n";
    this.callbacks.onContentChange(this.textarea.value);
    this.schedulePushHistory(this.textarea.value);
    this.updateLineNumbers(true);
  }

  public destroy(): void {
    if (this.lineMeasure && this.lineMeasure.parentNode) {
      this.lineMeasure.parentNode.removeChild(this.lineMeasure);
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
