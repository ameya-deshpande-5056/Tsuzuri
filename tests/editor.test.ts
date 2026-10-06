// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MarkdownEditor } from "../src/editor";

describe("Tsuzuri MarkdownEditor", () => {
  let container: HTMLElement;
  let textarea: HTMLTextAreaElement;
  let lineGutter: HTMLElement;
  let editor: MarkdownEditor;
  let contentChangedVal = "";

  beforeEach(() => {
    container = document.createElement("div");
    textarea = document.createElement("textarea");
    lineGutter = document.createElement("div");

    container.appendChild(lineGutter);
    container.appendChild(textarea);
    document.body.appendChild(container);

    contentChangedVal = "";
    editor = new MarkdownEditor(container, textarea, lineGutter, {
      onContentChange: (newContent) => {
        contentChangedVal = newContent;
      },
    });
  });

  it("updates line numbers matching lines of content", () => {
    editor.setValue("Line 1\nLine 2\nLine 3", true);
    editor.updateLineNumbers();

    const lineElements = lineGutter.querySelectorAll(".line-number");
    expect(lineElements.length).toBe(3);
    expect(lineElements[0].textContent).toBe("1");
    expect(lineElements[1].textContent).toBe("2");
    expect(lineElements[2].textContent).toBe("3");
  });

  it("tracks value and triggers onContentChange", () => {
    editor.setValue("# New Title", true);
    expect(editor.getValue()).toBe("# New Title");

    textarea.value = "# Modified Title";
    textarea.dispatchEvent(new Event("input"));
    expect(contentChangedVal).toBe("# Modified Title");
  });

  it("performs text search accurately", () => {
    editor.setValue("The quick brown fox jumps over the lazy dog. The fox is quick.", true);

    const result = editor.find("fox");
    expect(result.count).toBe(2);
    expect(result.current).toBe(1);

    const next = editor.findNext();
    expect(next.current).toBe(2);

    const prev = editor.findPrev();
    expect(prev.current).toBe(1);
  });

  it("replaces single occurrences and all occurrences", () => {
    editor.setValue("hello world hello universe", true);

    editor.find("hello");
    editor.replaceCurrent("hi");
    expect(editor.getValue()).toBe("hi world hello universe");

    editor.replaceAll("greetings");
    expect(editor.getValue()).toBe("hi world greetings universe");
  });

  it("supports undo and redo functionality", async () => {
    vi.useFakeTimers();

    editor.setValue("Initial text", true);

    textarea.value = "Second text";
    textarea.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(350);

    textarea.value = "Third text";
    textarea.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(350);

    editor.undo();
    expect(editor.getValue()).toBe("Second text");

    editor.undo();
    expect(editor.getValue()).toBe("Initial text");

    editor.redo();
    expect(editor.getValue()).toBe("Second text");

    vi.useRealTimers();
  });
});
