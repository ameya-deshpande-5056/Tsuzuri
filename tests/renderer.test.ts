// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderDocument, extractHeadings, slugify } from "../src/renderer";

describe("Tsuzuri Renderer & Pipeline", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("generates correct slugs for headings", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("LaTeX & Mermaid in Tsuzuri!")).toBe("latex-mermaid-in-tsuzuri");
    expect(slugify("  Spaces and -- dashes  ")).toBe("spaces-and-dashes");
  });

  it("extracts headings H1-H6 for Table of Contents", () => {
    const md = `
# Title
Some text
## Subtitle
### Section 1
#### Sub-section 1.1
##### Deep detail
###### Minute detail
`;
    const headings = extractHeadings(md);
    expect(headings.length).toBe(6);
    expect(headings[0]).toEqual({ level: 1, text: "Title", id: "title" });
    expect(headings[1]).toEqual({ level: 2, text: "Subtitle", id: "subtitle" });
    expect(headings[2]).toEqual({ level: 3, text: "Section 1", id: "section-1" });
    expect(headings[5]).toEqual({ level: 6, text: "Minute detail", id: "minute-detail" });
  });

  it("renders CommonMark & GFM formatting correctly", async () => {
    const md = `
# Document Title

This is **bold**, *italic*, and ~~strikethrough~~.

- [x] Completed task
- [ ] Incomplete task

> Blockquote reflection
`;
    await renderDocument(md, container, null);

    expect(container.querySelector("h1")?.textContent).toBe("Document Title");
    expect(container.querySelector("h1")?.id).toBe("document-title");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("s")?.textContent).toBe("strikethrough");
    expect(container.querySelector("blockquote")?.textContent?.trim()).toContain("Blockquote reflection");

    // Task lists
    const checkboxes = container.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it("wraps tables inside responsive table-wrapper container", async () => {
    const md = `
| Name | Type | Value |
| :--- | :---: | ---: |
| Alpha | String | "abc" |
| Beta | Number | 42 |
`;
    await renderDocument(md, container, null);

    const wrapper = container.querySelector(".table-wrapper");
    expect(wrapper).not.toBeNull();
    const table = wrapper?.querySelector("table");
    expect(table).not.toBeNull();
    const headers = table?.querySelectorAll("th");
    expect(headers?.length).toBe(3);
    expect(headers?.[0].textContent).toBe("Name");
  });

  it("renders footnotes correctly", async () => {
    const md = `
Text with footnote.[^sample]

[^sample]: Detailed footnote explanation.
`;
    await renderDocument(md, container, null);

    const footnoteRef = container.querySelector(".footnote-ref");
    expect(footnoteRef).not.toBeNull();
    const footnotesSection = container.querySelector(".footnotes");
    expect(footnotesSection).not.toBeNull();
    expect(footnotesSection?.textContent).toContain("Detailed footnote explanation.");
  });

  it("renders inline and display LaTeX math offline via KaTeX", async () => {
    const md = `
The famous equation is $E = mc^2$.

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$
`;
    await renderDocument(md, container, null);

    // Inline math
    const inlineWrapper = container.querySelector(".katex-inline-wrapper");
    expect(inlineWrapper).not.toBeNull();
    expect(inlineWrapper?.querySelector(".katex")).not.toBeNull();

    // Display math
    const displayWrapper = container.querySelector(".katex-display-wrapper");
    expect(displayWrapper).not.toBeNull();
    expect(displayWrapper?.querySelector(".katex-display")).not.toBeNull();
  });

  it("handles broken/invalid LaTeX gracefully without throwing", async () => {
    const md = `
Broken math: $\\invalidmacro{{{unclosed$

$$
\\broken\\equation{
$$
`;
    // Should not throw
    await expect(renderDocument(md, container, null)).resolves.not.toThrow();
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("marks Mermaid diagrams for SVG rendering", async () => {
    const md = `
\`\`\`mermaid
flowchart LR
    A --> B
\`\`\`
`;
    await renderDocument(md, container, null);

    const diagram = container.querySelector(".mermaid-diagram");
    expect(diagram).not.toBeNull();
  });

  it("renders syntax-highlighted code blocks with copy buttons", async () => {
    const md = `
\`\`\`rust
fn hello() {
    println!("Hello, Tsuzuri!");
}
\`\`\`
`;
    await renderDocument(md, container, null);

    const pre = container.querySelector("pre.hljs");
    expect(pre).not.toBeNull();
    const copyBtn = pre?.querySelector(".code-copy-btn");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.textContent).toBe("Copy");
    const code = pre?.querySelector("code.language-rust");
    expect(code).not.toBeNull();
  });

  it("sanitizes dangerous HTML and scripts (DOMPurify)", async () => {
    const md = `
<script>window.alert("XSS")</script>
<img src="x" onerror="alert('hack')">
[Malicious Link](javascript:alert('malicious'))
`;
    await renderDocument(md, container, null);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(container.querySelector("a[href^='javascript:']")).toBeNull();
  });

  it("renders LaTeX bracket display \\[...\\] and inline \\(...\\) math", async () => {
    const md = `
Display bracket formula:
\\[
\\int_0^1 x^2 dx = \\frac{1}{3}
\\]

Inline bracket formula is \\( E = mc^2 \\).
`;
    await renderDocument(md, container, null);

    const displayWrapper = container.querySelector(".katex-display-wrapper");
    expect(displayWrapper).not.toBeNull();
    expect(displayWrapper?.querySelector(".katex-display")).not.toBeNull();

    const inlineWrapper = container.querySelector(".katex-inline-wrapper");
    expect(inlineWrapper).not.toBeNull();
    expect(inlineWrapper?.querySelector(".katex")).not.toBeNull();
  });

  it("renders bare LaTeX environments (align, equation, pmatrix)", async () => {
    const md = `
\\begin{align}
a &= b + c \\\\
d &= e + f
\\end{align}

\\begin{pmatrix}
1 & 0 \\\\
0 & 1
\\end{pmatrix}
`;
    await renderDocument(md, container, null);

    const displayWrappers = container.querySelectorAll(".katex-display-wrapper");
    expect(displayWrappers.length).toBe(2);
    expect(displayWrappers[0].querySelector(".katex")).not.toBeNull();
    expect(displayWrappers[1].querySelector(".katex")).not.toBeNull();
  });

  it("renders fenced math code blocks (math and katex)", async () => {
    const md = `
\`\`\`math
\\sum_{k=1}^n k = \\frac{n(n+1)}{2}
\`\`\`

\`\`\`katex
\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1
\`\`\`
`;
    await renderDocument(md, container, null);

    const displayWrappers = container.querySelectorAll(".katex-display-wrapper");
    expect(displayWrappers.length).toBe(2);
    expect(displayWrappers[0].querySelector(".katex")).not.toBeNull();
    expect(displayWrappers[1].querySelector(".katex")).not.toBeNull();
  });

  it("distinguishes currency dollar signs from math formulas", async () => {
    const md = `
The ticket costs $15 and the meal is $25, but the equation $x + y = z$ is math.
`;
    await renderDocument(md, container, null);

    expect(container.textContent).toContain("$15 and the meal is $25");
    const inlineWrapper = container.querySelector(".katex-inline-wrapper");
    expect(inlineWrapper).not.toBeNull();
    expect(inlineWrapper?.textContent).toContain("x+y=z");
  });

  it("renders safe HTML elements and inline styles", async () => {
    const md = `
<div class="custom-card" style="padding: 10px; background-color: rgb(240, 240, 240);">
  <span style="color: rgb(255, 0, 0);">Red alert</span>
  <details>
    <summary>More Info</summary>
    <p>Detailed expandable description.</p>
  </details>
  <u>Underlined text</u> and <kbd>Ctrl+C</kbd>
</div>
`;
    await renderDocument(md, container, null);

    const card = container.querySelector(".custom-card") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.style.padding).toBe("10px");

    const span = card.querySelector("span") as HTMLElement;
    expect(span).not.toBeNull();
    expect(span.style.color).toBe("rgb(255, 0, 0)");

    const details = card.querySelector("details");
    expect(details).not.toBeNull();
    expect(card.querySelector("summary")?.textContent).toBe("More Info");
    expect(card.querySelector("u")?.textContent).toBe("Underlined text");
    expect(card.querySelector("kbd")?.textContent).toBe("Ctrl+C");
  });

  it("preserves embedded CSS style blocks", async () => {
    const md = `
<style>
  .custom-highlight { font-weight: bold; text-decoration: underline; }
</style>
<span class="custom-highlight">Highlighted text</span>
`;
    await renderDocument(md, container, null);

    const styleEl = container.querySelector("style");
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain(".custom-highlight");

    const spanEl = container.querySelector(".custom-highlight");
    expect(spanEl).not.toBeNull();
    expect(spanEl?.textContent).toBe("Highlighted text");
  });
});
