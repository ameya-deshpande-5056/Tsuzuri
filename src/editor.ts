export interface EditorCallbacks {
  onContentChange: (newContent: string) => void;
  onCursorChange?: (line: number, col: number) => void;
}

export class MarkdownEditor {
  private textarea: HTMLTextAreaElement;
  private lineGutter: HTMLElement;
  private callbacks: EditorCallbacks;

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
    callbacks: EditorCallbacks
  ) {
    this.textarea = textarea;
    this.lineGutter = lineGutter;
    this.callbacks = callbacks;

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
      this.lineGutter.scrollTop = this.textarea.scrollTop;
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
    this.textarea.addEventListener("selectionchange", () => {
      this.reportCursorPosition();
    });

    this.textarea.addEventListener("click", () => {
      this.reportCursorPosition();
    });

    this.textarea.addEventListener("keyup", () => {
      this.reportCursorPosition();
    });

    // Resize observer to recalculate line heights if supported
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => {
        this.updateLineNumbers();
      });
      resizeObserver.observe(this.textarea);
    }
  }

  private reportCursorPosition(): void {
    if (!this.callbacks.onCursorChange) return;
    const pos = this.textarea.selectionStart;
    const textBefore = this.textarea.value.substring(0, pos);
    const lines = textBefore.split("\n");
    const lineNumber = lines.length;
    const colNumber = lines[lines.length - 1].length + 1;
    this.callbacks.onCursorChange(lineNumber, colNumber);
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
    const lines = this.textarea.value.split("\n");
    const lineCount = lines.length;

    let gutterHtml = "";
    for (let i = 1; i <= lineCount; i++) {
      gutterHtml += `<div class="line-number">${i}</div>`;
    }
    this.lineGutter.innerHTML = gutterHtml;
    this.lineGutter.scrollTop = this.textarea.scrollTop;
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
